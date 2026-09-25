import { randomUUID } from "node:crypto";
import path from "node:path";
import { type NestExpressApplication } from "@nestjs/platform-express";
import { type Db } from "@atelier/db";
import { defaultRolePermissions, ROLE_CODES, ROLE_NAMES, type RoleCode } from "@atelier/shared";
import { encryptField, generateTotpSecret, parseKeyring, totp } from "@atelier/shared/node";
import { config as loadEnv } from "dotenv";
import { pino } from "pino";
import request from "supertest";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/auth.service.js";
import { RateLimitGuard } from "../src/common/rate-limit.js";
import { type AppConfig, loadConfig } from "../src/config.js";
import { PrismaService } from "../src/prisma.service.js";

export interface TestContext {
  app: NestExpressApplication;
  prisma: Db;
  config: AppConfig;
  http: () => ReturnType<typeof request>;
}

export async function setupTestApp(): Promise<TestContext> {
  loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    COOKIE_SECURE: "false",
    LOG_LEVEL: "silent",
  });
  const app = await createApp(config, pino({ level: "silent" }));
  await app.init();
  const prisma = app.get(PrismaService) as unknown as Db;
  await seedRoles(prisma);
  return { app, prisma, config, http: () => request(app.getHttpServer()) };
}

export function resetRateLimit(ctx: TestContext) {
  ctx.app.get(RateLimitGuard).reset();
}

/** Rolleri ve varsayılan yetki matrisini tohumlar (idempotent). */
async function seedRoles(prisma: Db) {
  const matrix = defaultRolePermissions();
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: {},
      create: { code, name: ROLE_NAMES[code] },
    });
    await prisma.rolePermission.createMany({
      data: matrix[code].map((p) => ({ roleId: role.id, module: p.module, action: p.action })),
      skipDuplicates: true,
    });
  }
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  totpSecret: string;
}

/** Rolleri verilen, iki adımlı doğrulaması kurulu bir test kullanıcısı oluşturur. */
export async function createUser(
  ctx: TestContext,
  roles: RoleCode[],
  opts: { twoFactor?: boolean } = {},
): Promise<TestUser> {
  const twoFactor = opts.twoFactor ?? true;
  const email = `test-${randomUUID().slice(0, 8)}@atelier.test`;
  const password = "Test-parola-12345";
  const totpSecret = generateTotpSecret();
  const ring = parseKeyring(ctx.config.PII_ENC_KEYS, ctx.config.PII_ENC_ACTIVE_KEY, ctx.config.PII_HASH_KEY);
  const roleRows = await ctx.prisma.role.findMany({ where: { code: { in: roles } } });
  const user = await ctx.prisma.user.create({
    data: {
      email,
      fullName: `Test ${roles.join("+")}`,
      passwordHash: await hashPassword(password),
      twoFactorOn: twoFactor,
      totpSecretEnc: twoFactor ? encryptField(ring, totpSecret) : null,
      roles: { create: roleRows.map((r) => ({ roleId: r.id })) },
    },
  });
  return { id: user.id, email, password, totpSecret };
}

/** Tam giriş akışı (parola + TOTP); oturum çerezini taşıyan bir supertest ajanı döner. */
export async function loginAgent(ctx: TestContext, user: TestUser) {
  const agent = request.agent(ctx.app.getHttpServer());
  const login = await agent
    .post("/auth/login")
    .send({ email: user.email, password: user.password })
    .expect(200);
  await agent
    .post("/auth/mfa/verify")
    .send({ client: "web", challenge: login.body.challenge, code: totp(user.totpSecret) })
    .expect(200);
  return agent;
}
