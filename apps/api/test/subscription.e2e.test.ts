import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let planId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  planId = (await ctx.prisma.subscriptionPlan.create({ data: { code: `PLAN-${Math.random().toString(36).slice(2, 7)}`, name: "Aylık kutu", price: "299.00", intervalMonths: 1, samplesPerBox: 3, sampleMl: "2" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("abonelik (F5-05/06, SDK)", () => {
  it("plan listelenir; abonelik başlar ve iptal edilir; kart verisi yok", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    expect((await admin.get("/subscriptions/plans").expect(200)).body.length).toBeGreaterThanOrEqual(1);
    const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Abone" } });
    const sub = (await admin.post("/subscriptions").send({ customerId: customer.id, planId, paymentToken: "tok_abc" }).expect(201)).body;
    expect(sub.status).toBe("ACTIVE");
    // Kart verisi tutulmaz: yalnızca token
    const row = await ctx.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(row.paymentToken).toBe("tok_abc");
    await admin.post(`/subscriptions/${sub.id}/cancel`).expect(201);
    expect((await ctx.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("CANCELLED");
  });

  it("ayrılma riski hesaplanır (SDK-06)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Riskli" } });
    const sub = await ctx.prisma.subscription.create({ data: { customerId: customer.id, planId, status: "PAST_DUE", nextBillingAt: new Date(), createdAt: new Date(Date.now() - 120 * 86_400_000) } });
    const r = await admin.post(`/subscriptions/${sub.id}/churn-risk`).expect(201);
    expect(r.body.churnRisk).toBeGreaterThan(0.5); // 120 gün + PAST_DUE
  });
});
