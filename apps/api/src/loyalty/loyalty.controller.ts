import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type RedeemRequest, redeemSchema, selectTier } from "@atelier/shared";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/** Sadakat (F5-04 · SDK). Bakiye, seviye, harcama (redeem). Kazanım worker'da (order.confirmed). */
@ApiTags("loyalty")
@Controller("loyalty")
export class LoyaltyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("tiers")
  @RequirePermission("loyalty", "VIEW")
  async tiers() {
    const rows = await this.prisma.loyaltyTier.findMany({ orderBy: { minPoints: "asc" } });
    return rows.map((t) => ({ id: t.id, code: t.code, name: t.name, minPoints: t.minPoints, earnPct: t.earnPct.toString(), perks: t.perks }));
  }

  @Get("accounts/:customerId")
  @RequirePermission("loyalty", "VIEW")
  async account(@Param("customerId") customerId: string) {
    const acc = await this.prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: { tier: { select: { code: true, name: true } }, transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    if (!acc) return { customerId, points: 0, tier: null, transactions: [] };
    return {
      customerId,
      points: acc.points,
      tier: acc.tier,
      transactions: acc.transactions.map((t) => ({ points: t.points, reason: t.reason, refId: t.refId, createdAt: t.createdAt.toISOString() })),
    };
  }

  /** SDK: puan harcama (redeem). Yetersiz bakiyede reddedilir. */
  @Post("redeem")
  @RequirePermission("loyalty", "EDIT")
  @ApiZodBody(redeemSchema)
  async redeem(@Body(new ZodPipe(redeemSchema)) body: RedeemRequest) {
    return this.prisma.$transaction(async (tx) => {
      const acc = await tx.loyaltyAccount.findUnique({ where: { customerId: body.customerId } });
      if (!acc) throw new NotFoundException({ message: "Sadakat hesabı yok" });
      if (acc.points < body.points) throw new BadRequestException({ message: "Yetersiz puan" });
      await tx.loyaltyTransaction.create({ data: { accountId: acc.id, points: -body.points, reason: body.reason, refId: body.refId ?? null } });
      const balance = acc.points - body.points;
      const tiers = await tx.loyaltyTier.findMany();
      const newTier = selectTier(balance, tiers) ?? { id: acc.tierId };
      await tx.loyaltyAccount.update({ where: { id: acc.id }, data: { points: balance, tierId: newTier.id } });
      return { customerId: body.customerId, points: balance };
    });
  }

  /**
   * SDK-07: boş şişe iadesi (refill). Kalite uygunsa puan verilir; RefillReturn + LoyaltyTransaction yazılır.
   */
  @Post("refill")
  @RequirePermission("loyalty", "EDIT")
  async refill(@Body() body: { customerId: string; productId: string; bottleQcOk?: boolean; points?: number }) {
    if (!body.customerId || !body.productId) throw new BadRequestException({ message: "customerId ve productId gerekli" });
    const points = body.bottleQcOk === false ? 0 : Math.max(0, Math.floor(body.points ?? 100));
    return this.prisma.$transaction(async (tx) => {
      const refill = await tx.refillReturn.create({ data: { customerId: body.customerId, productId: body.productId, bottleQcOk: body.bottleQcOk ?? null, pointsGiven: points } });
      if (points > 0) {
        const acc = await tx.loyaltyAccount.findUnique({ where: { customerId: body.customerId } });
        if (acc) {
          await tx.loyaltyTransaction.create({ data: { accountId: acc.id, points, reason: "REFILL", refId: refill.id } });
          await tx.loyaltyAccount.update({ where: { id: acc.id }, data: { points: acc.points + points } });
        }
      }
      return { id: refill.id, pointsGiven: points };
    });
  }
}
