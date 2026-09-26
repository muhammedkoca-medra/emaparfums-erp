import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let channelId: string;
let customerId: string;
let activeProductId: string;
let lockedProductId: string;

async function product(ctx: TestContext, sku: string, status: "ACTIVE" | "SALES_LOCKED") {
  const item = await ctx.prisma.item.create({ data: { code: `MM-${sku}`, name: sku, type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await ctx.prisma.product.create({
    data: { itemId: item.id, sku, name: sku, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status },
  });
  return p.id;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  const channel = await ctx.prisma.salesChannel.create({ data: { code: "B2B", name: "B2B", type: "B2B" } });
  channelId = channel.id;
  const customer = await ctx.prisma.customer.create({ data: { type: "CORPORATE", fullName: "ACME A.Ş." } });
  customerId = customer.id;
  await ctx.prisma.taxRule.create({
    data: { category: "PERFUME", kdvRate: "0.20", otvRate: "0.20", validFrom: new Date("2026-01-01"), approvedAt: new Date("2026-01-01") },
  });
  activeProductId = await product(ctx, "ORD-A", "ACTIVE");
  lockedProductId = await product(ctx, "ORD-L", "SALES_LOCKED");
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("satış siparişi (F2-02, SAL-01/02/03/06/07)", () => {
  it("kanal önekiyle numara üretir, vergi anlık görüntüsünü kopyalar", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const { body } = await sales
      .post("/sales/orders")
      .send({ channelId, customerId, lines: [{ productId: activeProductId, qty: 2, unitPriceGross: "1200.00" }] })
      .expect(201);
    const o = await sales.get(`/sales/orders/${body.id}`).expect(200);
    expect(o.body.number).toMatch(/^B2B-\d{5}$/);
    // 2 × 1200 = 2400 brüt, ÖTV %20 + KDV %20: net = 2400/(1.2×1.2)=1666.67
    expect(o.body.grandTotal).toBe("2400.00");
    expect(o.body.lines[0].netAmount).toBe("1666.67");
    expect(o.body.lines[0].otvRate).toBe("0.2");
    expect(o.body.status).toBe("NEW");
  });

  it("SALES_LOCKED ürün siparişe eklenemez (SAL-03)", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales
      .post("/sales/orders")
      .send({ channelId, customerId, lines: [{ productId: lockedProductId, qty: 1, unitPriceGross: "100.00" }] })
      .expect(400);
  });

  it("durum makinesi geçerli/geçersiz geçişleri uygular (SAL-07)", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const { body } = await sales
      .post("/sales/orders")
      .send({ channelId, customerId, lines: [{ productId: activeProductId, qty: 1, unitPriceGross: "500.00" }] })
      .expect(201);
    await sales.post(`/sales/orders/${body.id}/transition`).send({ to: "CONFIRMED" }).expect(201);
    // CONFIRMED → DELIVERED geçersiz
    await sales.post(`/sales/orders/${body.id}/transition`).send({ to: "DELIVERED" }).expect(400);
    await sales.post(`/sales/orders/${body.id}/transition`).send({ to: "PICKING" }).expect(201);
    await sales.post(`/sales/orders/${body.id}/transition`).send({ to: "SHIPPED" }).expect(201);
    // SHIPPED sonrası iptal edilemez (SAL-06)
    await sales.post(`/sales/orders/${body.id}/transition`).send({ to: "CANCELLED" }).expect(400);
  });

  it("yetkisiz kullanıcı sipariş oluşturamaz", async () => {
    const wh = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE"]));
    await wh
      .post("/sales/orders")
      .send({ channelId, customerId, lines: [{ productId: activeProductId, qty: 1, unitPriceGross: "100.00" }] })
      .expect(403);
  });
});
