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

describe("kontrol paneli AI (F5-07, PNL-03/04)", () => {
  it("talep tahmini aylık seriden hesaplar", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const sfx = Math.random().toString(36).slice(2, 7);
    const it = await ctx.prisma.item.create({ data: { code: `MF-${sfx}`, name: "F", type: "FINISHED_GOOD", uom: "PCS" } });
    const p = await ctx.prisma.product.create({ data: { itemId: it.id, sku: `SF-${sfx}`, name: "F", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" } });
    const channel = await ctx.prisma.salesChannel.upsert({ where: { code: "WEB" }, update: {}, create: { code: "WEB", name: "Web", type: "WEBSITE" } });
    const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "M" } });
    for (const [monthsAgo, qty] of [[2, 5], [1, 8]] as const) {
      const created = new Date();
      created.setUTCMonth(created.getUTCMonth() - monthsAgo, 15);
      const o = await ctx.prisma.salesOrder.create({ data: { number: `FO-${Math.random().toString(36).slice(2, 8)}`, channelId: channel.id, customerId: customer.id, status: "CONFIRMED", netTotal: "100", otvTotal: "0", kdvTotal: "0", grandTotal: "100", createdAt: created } });
      await ctx.prisma.salesOrderLine.create({ data: { orderId: o.id, productId: p.id, qty, unitPriceGross: "100", otvRate: "0", kdvRate: "0.20", netAmount: "100", otvAmount: "0", kdvAmount: "0" } });
    }
    const f = await admin.get(`/dashboard/forecast/${p.id}`).expect(200);
    expect(f.body.series.length).toBeGreaterThanOrEqual(2);
    expect(f.body.forecast).toBeGreaterThan(0);
  });

  it("AI önerileri min stok altı kalemi listeler", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    await ctx.prisma.item.create({ data: { code: `LOW-${Math.random().toString(36).slice(2, 7)}`, name: "Az stok", type: "RAW_MATERIAL", uom: "KG", minStock: "100" } });
    const s = await admin.get("/dashboard/ai-suggestions").expect(200);
    expect(Array.isArray(s.body)).toBe(true);
    expect(s.body.some((x: { type: string }) => x.type === "PURCHASE" || x.type === "PRODUCE")).toBe(true);
  });
});
