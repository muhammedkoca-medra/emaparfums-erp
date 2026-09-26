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

describe("döviz kuru (F2-17, FX_TCMB mock)", () => {
  it("refresh kurları çeker; rates güncel kurları döner; idempotent", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const r1 = await admin.post("/fx/refresh").send({}).expect(201);
    expect(r1.body.quotes).toEqual(expect.arrayContaining(["USD", "EUR", "GBP"]));
    await admin.post("/fx/refresh").send({}).expect(201); // aynı gün tekrar → upsert
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(await ctx.prisma.fxRate.count({ where: { date: today } })).toBe(3);
    const rates = await admin.get("/fx/rates").expect(200);
    const usd = (rates.body as { quote: string; rate: string }[]).find((x) => x.quote === "USD");
    expect(Number(usd!.rate)).toBeGreaterThan(0);
  });

  it("oturumsuz erişemez", async () => {
    await ctx.http().get("/fx/rates").expect(401);
  });
});
