import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let channelId: string;
let productId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  channelId = (await ctx.prisma.salesChannel.create({ data: { code: "TRENDYOL", name: "Trendyol", type: "MARKETPLACE" } })).id;
  await ctx.prisma.taxRule.create({ data: { category: "PERFUME", kdvRate: "0.20", otvRate: "0.20", validFrom: new Date("2026-01-01"), approvedAt: new Date("2026-01-01") } });
  const item = await ctx.prisma.item.create({ data: { code: "MM-EC1", name: "Ürün", type: "FINISHED_GOOD", uom: "PCS" } });
  productId = (await ctx.prisma.product.create({ data: { itemId: item.id, sku: "EC-1", name: "Ürün", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("e-ticaret / pazaryeri (F2-11/12/13)", () => {
  it("ürün listeler; kanal ve listeleme görünür", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const l = await sales.post("/ecommerce/listings").send({ channelId, productId }).expect(201);
    expect(l.body.externalId).toMatch(/^trendyol_/);
    const chans = await sales.get("/ecommerce/channels").expect(200);
    expect((chans.body as { code: string; listings: number }[]).find((c) => c.code === "TRENDYOL")?.listings).toBeGreaterThanOrEqual(1);
    const listings = await sales.get("/ecommerce/listings?channel=TRENDYOL").expect(200);
    expect(listings.body).toHaveLength(1);
  });

  it("pazaryeri siparişi içeri alınır; ikinci kez tekrar oluşturmaz (SAL-01)", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const body = { externalOrderNo: "TY-EXT-99", sku: "EC-1", qty: 2, unitPriceGross: "600.00" };
    const first = await sales.post("/ecommerce/channels/TRENDYOL/sync-orders").send(body).expect(201);
    expect(first.body.created).toBe(true);
    const second = await sales.post("/ecommerce/channels/TRENDYOL/sync-orders").send(body).expect(201);
    expect(second.body.created).toBe(false);
    expect(second.body.orderId).toBe(first.body.orderId);
    const order = await ctx.prisma.salesOrder.findUniqueOrThrow({ where: { id: first.body.orderId } });
    expect(order.number).toMatch(/^TY-\d{5}$/);
    expect(order.grandTotal.toFixed(2)).toBe("1200.00");
  });

  it("stok itme kullanılabilir − tampon gönderir", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const res = await sales.post("/ecommerce/channels/TRENDYOL/push-stock").expect(201);
    expect(res.body.pushed).toBeGreaterThanOrEqual(1);
  });

  it("ecommerce:VIEW olmayan erişemez", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    await prod.get("/ecommerce/channels").expect(403);
  });
});
