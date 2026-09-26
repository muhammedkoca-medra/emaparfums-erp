import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let productId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const item = await ctx.prisma.item.create({
    data: { code: "MM-9001", name: "Genel Bakış Test", type: "FINISHED_GOOD", uom: "PCS" },
  });
  const p = await ctx.prisma.product.create({
    data: { itemId: item.id, sku: "OV-TEST-1", name: "Overview Test", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME" },
  });
  productId = p.id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("ürün genel bakış / satış / ücretlendirme", () => {
  it("ürün overview stok, fiyat ve formül alanlarını döndürür", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const res = await sales.get(`/catalog/products/${productId}/overview`).expect(200);
    expect(res.body).toMatchObject({ sku: "OV-TEST-1", stock: { onHand: "0", reserved: "0", available: "0" }, price: null });
    // SALES üretim yetkisi taşımaz → hammadde/formül gizli
    expect(res.body.canSeeFormula).toBe(false);
    expect(res.body.rawMaterials).toBeNull();
  });

  it("olmayan ürün overview 404", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.get("/catalog/products/yok/overview").expect(404);
  });

  it("satış özeti boş veritabanında sıfır döndürür", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const res = await sales.get("/sales/analytics/summary").expect(200);
    expect(res.body).toMatchObject({ orders: 0, revenue: "0", avg: "0" });
    expect(Array.isArray(res.body.byStatus)).toBe(true);
  });

  it("ücretlendirme fiyatsız ürünü fiyat null ile listeler", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const res = await sales.get("/pricing/overview").expect(200);
    const row = (res.body as { sku: string; price: string | null }[]).find((r) => r.sku === "OV-TEST-1");
    expect(row).toBeDefined();
    expect(row?.price).toBeNull();
  });

  it("sales:VIEW olmayan rol satış özetine erişemez", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    await prod.get("/sales/analytics/summary").expect(403);
  });

  it("şişe modelleri listelenir; stok bağlı ambalaj kaleminden gelir", async () => {
    // Modele bağlı ambalaj kalemi + stok
    await ctx.prisma.item.create({ data: { code: "AM-SISE-50Y", name: "Şişe Yeşil", type: "PACKAGING", uom: "PCS" } });
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const res = await sales.get("/catalog/bottles").expect(200);
    const rows = res.body as { code: string; item: unknown; stock: unknown; productCount: number }[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const green = rows.find((r) => r.code === "EMA-50-YESIL");
    expect(green?.item).not.toBeNull();
    expect(green?.stock).not.toBeNull();
    // Ambalaj kalemi olmayan model item null döner
    const other = rows.find((r) => r.code === "EMA-KRISTAL");
    expect(other?.item).toBeNull();
  });
});
