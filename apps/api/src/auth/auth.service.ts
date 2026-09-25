import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { writeAudit } from "@atelier/db";
import { type LoginResponse } from "@atelier/shared";
import {
  decryptField,
  encryptField,
  generateTotpSecret,
  otpauthUrl,
  type PiiKeyring,
  verifyTotp,
} from "@atelier/shared/node";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { PrismaService } from "../prisma.service.js";
import { issueChallenge, readChallenge } from "./challenge.js";
import { SessionService } from "./session.service.js";

export const PII_KEYRING = Symbol("PII_KEYRING");

/** argon2id parametreleri (OWASP önerisi, docs/07 §Uygulama güvenliği). */
export const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (password: string) => hash(password, ARGON2_OPTIONS);

/** Kullanıcı bulunamadığında da aynı süre harcansın diye sabit bir hash ile doğrulama yapılır. */
const DUMMY_HASH = hash("atelier-dummy-password", ARGON2_OPTIONS);

const INVALID = "E-posta veya parola hatalı";

interface Client {
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PII_KEYRING) private readonly keyring: PiiKeyring,
  ) {}

  /** 1. adım: e-posta + parola. Başarılıysa ikinci adım (TOTP) ya da TOTP kurulumu istenir. */
  async login(email: string, password: string, client: Client): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !user.passwordHash) {
      await verify(await DUMMY_HASH, password).catch(() => false);
      throw new UnauthorizedException({ message: INVALID });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        { message: "Çok sayıda hatalı deneme nedeniyle hesap geçici olarak kilitlendi" },
        HttpStatus.LOCKED,
      );
    }

    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failures = user.failedLoginCount + 1;
      const lock = failures >= this.config.LOGIN_MAX_FAILURES;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: lock ? 0 : failures,
            lockedUntil: lock ? new Date(Date.now() + this.config.LOGIN_LOCK_MINUTES * 60_000) : undefined,
          },
        });
        await writeAudit(tx, {
          userId: user.id,
          action: lock ? "auth.locked" : "auth.login_failed",
          entity: "User",
          entityId: user.id,
          after: { failedLoginCount: failures },
          ...client,
        });
      });
      throw new UnauthorizedException({ message: INVALID });
    }

    if (user.failedLoginCount > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0 } });
    }

    // İki adımlı doğrulama zorunlu (YTK-04). Kurulu değilse kurulum başlatılır.
    if (user.twoFactorOn && user.totpSecretEnc) {
      return { status: "MFA_REQUIRED", challenge: issueChallenge(this.config.AUTH_SECRET, { uid: user.id, purpose: "mfa" }) };
    }
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: encryptField(this.keyring, secret), totpLastCounter: null },
    });
    return {
      status: "MFA_ENROLL",
      challenge: issueChallenge(this.config.AUTH_SECRET, { uid: user.id, purpose: "enroll" }),
      otpauthUrl: otpauthUrl({ issuer: this.config.TOTP_ISSUER, account: user.email, secret }),
      secret,
    };
  }

  /** 2. adım: TOTP kodu. Başarılıysa oturum açılır. */
  async verifyMfa(input: {
    challenge: string;
    code: string;
    kind: "WEB" | "DEVICE";
    deviceName?: string;
    client: Client;
  }) {
    const payload = readChallenge(this.config.AUTH_SECRET, input.challenge);
    if (!payload) throw new UnauthorizedException({ message: "Doğrulama süresi doldu, lütfen tekrar giriş yapın" });

    const user = await this.prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user || !user.isActive || !user.totpSecretEnc) throw new UnauthorizedException({ message: INVALID });
    if (payload.purpose === "mfa" && !user.twoFactorOn) throw new UnauthorizedException({ message: INVALID });

    const counter = verifyTotp(decryptField(this.keyring, user.totpSecretEnc), input.code);
    // Aynı kod (veya daha eski adım) ikinci kez kabul edilmez.
    if (counter === null || (user.totpLastCounter !== null && counter <= user.totpLastCounter)) {
      await writeAudit(this.prisma, {
        userId: user.id,
        action: "auth.mfa_failed",
        entity: "User",
        entityId: user.id,
        ...input.client,
      });
      throw new UnauthorizedException({ message: "Doğrulama kodu hatalı" });
    }

    const enrolling = payload.purpose === "enroll";
    const updated = await this.prisma.user.updateMany({
      // Eşzamanlı iki istekte aynı kodun iki oturum açmasını engelle.
      where: { id: user.id, OR: [{ totpLastCounter: null }, { totpLastCounter: { lt: counter } }] },
      data: { totpLastCounter: counter, twoFactorOn: true, lastLoginAt: new Date() },
    });
    if (updated.count === 0) throw new UnauthorizedException({ message: "Doğrulama kodu hatalı" });

    const session = await this.sessions.create({
      userId: user.id,
      kind: input.kind,
      deviceName: input.deviceName,
      ...input.client,
    });
    await this.prisma.$transaction(async (tx) => {
      if (enrolling) {
        await writeAudit(tx, {
          userId: user.id,
          action: "auth.mfa_enrolled",
          entity: "User",
          entityId: user.id,
          before: { twoFactorOn: false },
          after: { twoFactorOn: true },
          ...input.client,
        });
      }
      await writeAudit(tx, {
        userId: user.id,
        action: input.kind === "DEVICE" ? "auth.device_login" : "auth.login",
        entity: "Session",
        entityId: session.sessionId,
        after: { kind: input.kind, deviceName: input.deviceName ?? null },
        ...input.client,
      });
    });
    return session;
  }

  async logout(sessionId: string, userId: string, client: Client) {
    await this.sessions.revoke(sessionId);
    await writeAudit(this.prisma, { userId, action: "auth.logout", entity: "Session", entityId: sessionId, ...client });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isExternal: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
    return { ...user, roles: user.roles.map((r) => r.role) };
  }
}
