import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createUser, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp({ MFA_REQUIRED: "false" });
});
afterAll(async () => {
  await ctx.app.close();
});

describe("iki adımlı doğrulama kapalı (yalnızca yerel geliştirme)", () => {
  it("web: parola ile oturum açılır, çerez yazılır", async () => {
    const user = await createUser(ctx, ["SALES"], { twoFactor: false });
    const agent = (await import("supertest")).default.agent(ctx.app.getHttpServer());
    const res = await agent
      .post("/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(res.body).toEqual({ status: "OK" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^atelier_session=/);
    await agent.get("/auth/me").expect(200);

    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { userId: user.id, action: "auth.login" },
    });
    expect(log.after).toMatchObject({ mfa: false });
  });

  it("cihaz: token gövdede döner", async () => {
    const user = await createUser(ctx, ["WAREHOUSE"], { twoFactor: false });
    const res = await ctx
      .http()
      .post("/auth/login")
      .send({ email: user.email, password: user.password, client: "device", deviceName: "El terminali 2" })
      .expect(200);
    expect(res.body.status).toBe("OK");
    await ctx.http().get("/auth/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);
  });

  it("hatalı parola yine reddedilir", async () => {
    const user = await createUser(ctx, ["SALES"], { twoFactor: false });
    await ctx.http().post("/auth/login").send({ email: user.email, password: "yanlis" }).expect(401);
  });

  it("üretimde kapatılamaz", () => {
    const base = { ...process.env, DATABASE_URL: "postgres://x", NODE_ENV: "production" };
    expect(() => loadConfig({ ...base, MFA_REQUIRED: "false" })).toThrow(/Üretimde iki adımlı doğrulama/);
    expect(loadConfig({ ...base, MFA_REQUIRED: "true" }).MFA_REQUIRED).toBe(true);
  });
});
