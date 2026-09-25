import { randomUUID } from "node:crypto";
import { Controller, Get, HttpCode, Post, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit } from "@atelier/db";
import { type AuthContext, CurrentUser } from "../auth/auth-context.js";
import { Public, RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

@ApiTags("system")
@Controller("system")
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  /** Canlılık kontrolü: API ayakta ve veritabanına erişiyor mu. */
  @Get("health")
  @Public()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ message: "Veritabanına erişilemiyor" });
    }
    return { status: "ok", time: new Date().toISOString() };
  }

  /** Olay hattının durumu: outbox'ta bekleyen, iletilen, başarısız olaylar. */
  @Get("status")
  @RequirePermission("admin", "VIEW")
  async status() {
    const [byStatus, recent] = await Promise.all([
      this.prisma.outboxEvent.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.outboxEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, status: true, attempts: true, createdAt: true, dispatchedAt: true },
      }),
    ]);
    const counts = { PENDING: 0, DISPATCHED: 0, FAILED: 0 };
    for (const row of byStatus) counts[row.status] = row._count._all;
    return { outbox: counts, recent };
  }

  /**
   * Uçtan uca olay hattı testi (Faz 0 çıkış kriteri): outbox'a `system.ping` yazar,
   * worker olayı kuyruktan alıp loglar ve durumunu DISPATCHED yapar.
   */
  @Post("ping")
  @RequirePermission("admin", "CREATE")
  @HttpCode(202)
  async ping(@CurrentUser() auth: AuthContext) {
    const pingId = randomUUID();
    const eventId = await this.prisma.$transaction((tx) =>
      emit(tx, { type: "system.ping", pingId, requestedById: auth.userId }),
    );
    return { eventId, pingId };
  }
}
