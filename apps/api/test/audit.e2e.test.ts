import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, loginAgent, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});

describe("denetim kaydı (F0-02, F0-06)", () => {
  it("rol değişikliği önce/sonra değeriyle AuditLog'a yazılır", async () => {
    const admin = await createUser(ctx, ["ADMIN"]);
    const target = await createUser(ctx, ["SALES"]);
    const agent = await loginAgent(ctx, admin);

    await agent
      .post(`/admin/users/${target.id}/roles`)
      .set("User-Agent", "vitest")
      .send({ roleCodes: ["SALES", "MARKETING"] })
      .expect(201);

    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: "user.roles.change", entityId: target.id },
    });
    expect(log.userId).toBe(admin.id);
    expect(log.entity).toBe("User");
    expect(log.userAgent).toBe("vitest");
    const codes = (v: unknown) => (v as { roles: { role: { code: string } }[] }).roles.map((r) => r.role.code);
    expect(codes(log.before)).toEqual(["SALES"]);
    expect(codes(log.after)).toEqual(["MARKETING", "SALES"]);
    // Parola hash'i ve TOTP sırrı denetim kaydına girmez
    expect(JSON.stringify(log)).not.toMatch(/passwordHash|totpSecret/);
  });

  it("kullanıcı oluşturma denetlenir; başarısız istek kayıt bırakmaz", async () => {
    const agent = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const email = `yeni-${Date.now()}@atelier.test`;
    const body = { email, fullName: "Yeni Kullanıcı", password: "Guclu-parola-2026", roleCodes: ["QUALITY"] };
    const res = await agent.post("/admin/users").send(body).expect(201);
    const created = await ctx.prisma.auditLog.findMany({ where: { action: "user.create", entityId: res.body.id } });
    expect(created).toHaveLength(1);
    expect(created[0]!.before).toBeNull();

    const dup = await agent.post("/admin/users").send(body).expect(409);
    expect(dup.body.message).toBe("Bu e-posta ile kayıtlı bir kullanıcı var");
    expect(await ctx.prisma.auditLog.count({ where: { action: "user.create", after: { path: ["email"], equals: email } } })).toBe(1);
  });

  it("AuditLog veritabanında değiştirilemez ve silinemez (YTK-03)", async () => {
    const row = await ctx.prisma.auditLog.create({ data: { action: "test.row", entity: "Test", entityId: "1" } });
    await expect(ctx.prisma.auditLog.update({ where: { id: row.id }, data: { action: "degisti" } })).rejects.toThrow(
      /değiştirilemez/,
    );
    await expect(ctx.prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/değiştirilemez/);
    await expect(ctx.prisma.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow(/değiştirilemez/);
  });

  it("işlem geçmişi filtrelenir ve sayfalanır", async () => {
    const admin = await createUser(ctx, ["ADMIN"]);
    const agent = await loginAgent(ctx, admin);
    const res = await agent.get(`/admin/audit?userId=${admin.id}&limit=1`).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].action).toBe("auth.login");
  });
});

describe("outbox (F0-07)", () => {
  it("ping olayı outbox'a PENDING olarak yazılır", async () => {
    const admin = await createUser(ctx, ["ADMIN"]);
    const agent = await loginAgent(ctx, admin);
    const res = await agent.post("/system/ping").expect(202);
    const ev = await ctx.prisma.outboxEvent.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(ev).toMatchObject({ type: "system.ping", aggregate: "system", aggregateId: res.body.pingId, status: "PENDING" });
    expect(ev.payload).toEqual({ type: "system.ping", pingId: res.body.pingId, requestedById: admin.id });

    const status = await agent.get("/system/status").expect(200);
    expect(status.body.outbox.PENDING).toBeGreaterThanOrEqual(1);
  });

  it("sağlık kontrolü herkese açık", async () => {
    const res = await ctx.http().get("/system/health").expect(200);
    expect(res.body.status).toBe("ok");
  });
});
