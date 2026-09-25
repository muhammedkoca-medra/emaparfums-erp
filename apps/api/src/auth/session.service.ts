import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { PrismaService } from "../prisma.service.js";

export const SESSION_COOKIE = "atelier_session";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Oturumlar: istemciye rastgele 32 bayt, veritabanına yalnızca SHA-256 hash'i. */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(input: {
    userId: string;
    kind: "WEB" | "DEVICE";
    deviceName?: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const hours =
      input.kind === "DEVICE" ? this.config.DEVICE_SESSION_TTL_HOURS : this.config.SESSION_TTL_HOURS;
    const expiresAt = new Date(Date.now() + hours * 3_600_000);
    const session = await this.prisma.session.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        tokenHash: hashToken(token),
        deviceName: input.deviceName ?? null,
        ip: input.ip,
        userAgent: input.userAgent,
        expiresAt,
      },
      select: { id: true },
    });
    return { token, sessionId: session.id, expiresAt };
  }

  /** Geçerli oturumu döner; süresi dolmuş, iptal edilmiş ya da kullanıcısı pasif ise null. */
  async resolve(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        kind: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        user: { select: { isActive: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive)
      return null;
    // Son görülme zamanını en fazla 5 dakikada bir yaz (her istekte yazma yükü olmasın).
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return { sessionId: session.id, userId: session.userId, kind: session.kind };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieOptions(expiresAt?: Date) {
    return {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: "lax" as const,
      path: "/",
      ...(expiresAt ? { expires: expiresAt } : {}),
    };
  }
}
