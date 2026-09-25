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

describe("parola değiştirme", () => {
  it("mevcut oturum açık kalır, diğer oturumlar kapanır, yeni parola çalışır", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const a = await loginAgent(ctx, user);
    // Aynı 30 sn'lik TOTP adımında ikinci giriş (tekrar kullanım) reddedildiği için
    // "başka cihazdaki oturum" doğrudan oluşturulur.
    const other = await ctx.prisma.session.create({
      data: {
        userId: user.id,
        kind: "WEB",
        tokenHash: `test-${user.id}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const res = await a
      .post("/auth/password")
      .send({ currentPassword: user.password, newPassword: "Yeni-guclu-parola-2026" })
      .expect(200);
    expect(res.body.otherSessionsRevoked).toBe(1);
    expect(
      (await ctx.prisma.session.findUniqueOrThrow({ where: { id: other.id } })).revokedAt,
    ).not.toBeNull();
    await a.get("/auth/me").expect(200);

    await ctx.http().post("/auth/login").send({ email: user.email, password: user.password }).expect(401);
    await ctx
      .http()
      .post("/auth/login")
      .send({ email: user.email, password: "Yeni-guclu-parola-2026" })
      .expect(200);
    expect(
      await ctx.prisma.auditLog.count({ where: { userId: user.id, action: "auth.password_change" } }),
    ).toBe(1);
  });

  it("mevcut parola yanlışsa ve yeni parola kısaysa reddedilir", async () => {
    const user = await createUser(ctx, ["SALES"]);
    const a = await loginAgent(ctx, user);
    const wrong = await a
      .post("/auth/password")
      .send({ currentPassword: "yanlis", newPassword: "Yeni-guclu-parola-2026" })
      .expect(400);
    expect(wrong.body.message).toBe("Mevcut parola hatalı");
    await a.post("/auth/password").send({ currentPassword: user.password, newPassword: "kisa" }).expect(400);
  });
});

describe("kullanıcı yönetimi", () => {
  it("devre dışı bırakılan kullanıcının oturumu kapanır ve giriş yapamaz; yeniden etkinleştirilebilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const target = await createUser(ctx, ["SALES"]);
    const t = await loginAgent(ctx, target);

    await admin.post(`/admin/users/${target.id}/status`).send({ isActive: false }).expect(200);
    await t.get("/auth/me").expect(401);
    await ctx.http().post("/auth/login").send({ email: target.email, password: target.password }).expect(401);

    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: "user.status.change", entityId: target.id },
    });
    expect(log.before).toMatchObject({ isActive: true });
    expect(log.after).toMatchObject({ isActive: false });

    await admin.post(`/admin/users/${target.id}/status`).send({ isActive: true }).expect(200);
    await ctx.http().post("/auth/login").send({ email: target.email, password: target.password }).expect(200);
  });

  it("yönetici kendini kilitleyemez", async () => {
    const adminUser = await createUser(ctx, ["ADMIN"]);
    const admin = await loginAgent(ctx, adminUser);
    const a = await admin.post(`/admin/users/${adminUser.id}/status`).send({ isActive: false }).expect(400);
    expect(a.body.message).toBe("Kendi hesabınızı devre dışı bırakamazsınız");
    const b = await admin
      .post(`/admin/users/${adminUser.id}/roles`)
      .send({ roleCodes: ["SALES"] })
      .expect(400);
    expect(b.body.message).toBe("Kendi yönetici rolünüzü kaldıramazsınız");
  });

  it("yetkisiz kullanıcı durum değiştiremez", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const target = await createUser(ctx, ["SALES"]);
    await sales.post(`/admin/users/${target.id}/status`).send({ isActive: false }).expect(403);
  });
});
