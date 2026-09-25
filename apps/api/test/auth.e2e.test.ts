import { totp } from "@atelier/shared/node";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("kimlik doğrulama (F0-04)", () => {
  it("ilk girişte TOTP kurulumu zorunlu, kurulumdan sonra oturum açılır", async () => {
    const user = await createUser(ctx, ["SALES"], { twoFactor: false });
    const agent = request.agent(ctx.app.getHttpServer());
    const login = await agent.post("/auth/login").send({ email: user.email, password: user.password }).expect(200);
    expect(login.body.status).toBe("MFA_ENROLL");
    expect(login.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Atelier/);

    // Kurulum tamamlanmadan korumalı uca erişilemez
    await agent.get("/auth/me").expect(401);

    const verify = await agent
      .post("/auth/mfa/verify")
      .send({ client: "web", challenge: login.body.challenge, code: totp(login.body.secret) })
      .expect(200);
    const cookie = verify.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^atelier_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get("/auth/me").expect(200);
    expect(me.body.email).toBe(user.email);

    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.twoFactorOn).toBe(true);
    expect(row.totpSecretEnc).not.toContain(login.body.secret);
    const audit = await ctx.prisma.auditLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["auth.mfa_enrolled", "auth.login"]);
  });

  it("2FA kurulu kullanıcıdan kod istenir", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const res = await ctx.http().post("/auth/login").send({ email: user.email, password: user.password }).expect(200);
    expect(res.body).toEqual({ status: "MFA_REQUIRED", challenge: expect.any(String) });
  });

  it("hatalı parola ve bilinmeyen kullanıcı aynı mesajı alır", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const a = await ctx.http().post("/auth/login").send({ email: user.email, password: "yanlis-parola" }).expect(401);
    const b = await ctx.http().post("/auth/login").send({ email: "yok@atelier.test", password: "x" }).expect(401);
    expect(a.body.message).toBe("E-posta veya parola hatalı");
    expect(b.body.message).toBe(a.body.message);
  });

  it("art arda hatalı denemede hesap kilitlenir (423)", async () => {
    const user = await createUser(ctx, ["SALES"]);
    for (let i = 0; i < ctx.config.LOGIN_MAX_FAILURES; i++) {
      await ctx.http().post("/auth/login").send({ email: user.email, password: "yanlis" }).expect(401);
    }
    await ctx.http().post("/auth/login").send({ email: user.email, password: user.password }).expect(423);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { userId: user.id, action: "auth.locked" } });
    expect(audit).not.toBeNull();
  });

  it("hatalı ve tekrar kullanılan TOTP kodu reddedilir", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const login = async () =>
      (await ctx.http().post("/auth/login").send({ email: user.email, password: user.password })).body.challenge as string;

    const verify = async (code: string) => {
      const challenge = await login();
      return ctx.http().post("/auth/mfa/verify").send({ client: "web", challenge, code });
    };

    expect((await verify("000000")).status).toBe(401);
    const code = totp(user.totpSecret);
    expect((await verify(code)).status).toBe(200);
    const replay = await verify(code);
    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe("Doğrulama kodu hatalı");
  });

  it("değiştirilmiş challenge reddedilir", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const res = await ctx.http().post("/auth/login").send({ email: user.email, password: user.password });
    const tampered = `${res.body.challenge}x`;
    await ctx.http().post("/auth/mfa/verify").send({ client: "web", challenge: tampered, code: totp(user.totpSecret) }).expect(401);
  });

  it("mobil cihaz token'ı: Bearer ile çalışır, 12 saat geçerli (YTK-07)", async () => {
    const user = await createUser(ctx, ["WAREHOUSE"]);
    const login = await ctx.http().post("/auth/login").send({ email: user.email, password: user.password });
    const res = await ctx
      .http()
      .post("/auth/mfa/verify")
      .send({ client: "device", challenge: login.body.challenge, code: totp(user.totpSecret), deviceName: "El terminali 1" })
      .expect(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    const hours = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);

    await ctx.http().get("/auth/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);
    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.kind).toBe("DEVICE");
    expect(session.deviceName).toBe("El terminali 1");
    expect(session.tokenHash).not.toBe(res.body.token);
  });

  it("çıkış oturumu iptal eder", async () => {
    const agent = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await agent.get("/auth/me").expect(200);
    await agent.post("/auth/logout").expect(200);
    await agent.get("/auth/me").expect(401);
  });

  it("süresi dolmuş oturum reddedilir", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const agent = await loginAgent(ctx, user);
    await ctx.prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get("/auth/me").expect(401);
  });

  it("giriş ucunda hız sınırı var (429)", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await ctx.http().post("/auth/login").send({ email: "x@y.z", password: "x" })).status;
    }
    expect(last).toBe(429);
  });

  it("geçersiz gövde 400 ve alan bazlı hata döner", async () => {
    const res = await ctx.http().post("/auth/login").send({ email: "eposta-degil" }).expect(400);
    expect(res.body.message).toBe("Gönderilen veri geçersiz");
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(["email", "password"]));
  });
});
