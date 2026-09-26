import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let discoveryId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  discoveryId = (await ctx.prisma.loyaltyTier.upsert({ where: { code: "DISCOVERY" }, update: {}, create: { code: "DISCOVERY", name: "Keşif", minPoints: 0, earnPct: "0.05", perks: [] } })).id;
  await ctx.prisma.loyaltyTier.upsert({ where: { code: "COLLECTOR" }, update: {}, create: { code: "COLLECTOR", name: "Koleksiyoner", minPoints: 3000, earnPct: "0.08", perks: [] } });
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

async function accountWith(points: number) {
  const c = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Sadık Müşteri" } });
  await ctx.prisma.loyaltyAccount.create({ data: { customerId: c.id, tierId: discoveryId, points } });
  return c.id;
}

describe("sadakat (F5-04, SDK)", () => {
  it("bakiye ve seviyeler okunur", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const customerId = await accountWith(500);
    const acc = await admin.get(`/loyalty/accounts/${customerId}`).expect(200);
    expect(acc.body.points).toBe(500);
    const tiers = await admin.get("/loyalty/tiers").expect(200);
    expect(tiers.body.length).toBeGreaterThanOrEqual(2);
  });

  it("redeem puan düşer; yetersiz bakiyede reddedilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const customerId = await accountWith(200);
    await admin.post("/loyalty/redeem").send({ customerId, points: 150 }).expect(201);
    expect((await admin.get(`/loyalty/accounts/${customerId}`).expect(200)).body.points).toBe(50);
    await admin.post("/loyalty/redeem").send({ customerId, points: 999 }).expect(400);
  });

  it("boş şişe iadesi (refill) puan kazandırır; QC uygun değilse 0 (SDK-07)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const customerId = await accountWith(0);
    const it = await ctx.prisma.item.create({ data: { code: `MR-${Math.random().toString(36).slice(2, 7)}`, name: "M", type: "FINISHED_GOOD", uom: "PCS" } });
    const p = await ctx.prisma.product.create({ data: { itemId: it.id, sku: `SR-${Math.random().toString(36).slice(2, 7)}`, name: "P", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME" } });
    const ok = await admin.post("/loyalty/refill").send({ customerId, productId: p.id, bottleQcOk: true, points: 120 }).expect(201);
    expect(ok.body.pointsGiven).toBe(120);
    expect((await admin.get(`/loyalty/accounts/${customerId}`).expect(200)).body.points).toBe(120);
    const bad = await admin.post("/loyalty/refill").send({ customerId, productId: p.id, bottleQcOk: false }).expect(201);
    expect(bad.body.pointsGiven).toBe(0);
  });
});
