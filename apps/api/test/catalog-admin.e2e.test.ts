import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;

// 1x1 saydam PNG (geçerli küçük görsel)
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeAll(async () => {
  ctx = await setupTestApp();
  // createFull/tax kontrolü için PERFUME vergi kuralı
  await ctx.prisma.taxRule.create({
    data: { category: "PERFUME", gtipPrefix: "3303", kdvRate: "20", otvRate: "0", validFrom: new Date("2020-01-01") },
  });
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("ürün yönetimi (tam oluşturma, görsel, silme)", () => {
  it("tek adımda tam ürün oluşturur: kalem + ürün + vitrin profili → vitrinde görünür", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const res = await admin
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-FULL01",
        itemName: "Tam Ürün Kalemi",
        sku: "FULL-01",
        name: "Tam Ürün",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "ACTIVE",
        scentProfile: {
          gender: "unisex",
          accords: [{ label: "amber", strength: 80 }],
          dayPct: 50,
          seasons: { winter: 50, spring: 50, summer: 50, autumn: 50 },
        },
      })
      .expect(201);
    expect(res.body.id).toBeTruthy();
    // Kalem gerçekten açıldı
    const item = await ctx.prisma.item.findUnique({ where: { code: "EM-FULL01" } });
    expect(item?.type).toBe("FINISHED_GOOD");
    // Vitrinde ACTIVE ve stokta yok (hiç stok yok)
    const showcase = await ctx.http().get("/showcase/products").expect(200);
    const row = (showcase.body as { slug: string; inStock: boolean }[]).find((p) => p.slug === "FULL-01");
    expect(row).toBeDefined();
    expect(row?.inStock).toBe(false);
  });

  it("aynı SKU veya kalem kodu ikinci kez reddedilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const base = {
      itemName: "Çakışma",
      name: "Çakışma Ürünü",
      concentration: "EDP" as const,
      volumeMl: 50,
      gtip: "3303.00",
      taxCategory: "PERFUME",
      status: "ACTIVE" as const,
    };
    await admin.post("/catalog/products/full").send({ ...base, itemCode: "EM-DUP01", sku: "DUP-01" }).expect(201);
    await admin.post("/catalog/products/full").send({ ...base, itemCode: "EM-DUP02", sku: "DUP-01" }).expect(400);
    await admin.post("/catalog/products/full").send({ ...base, itemCode: "EM-DUP01", sku: "DUP-02" }).expect(400);
  });

  it("görsel yükler, herkese açık servis edilir, sonra kaldırılır", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const created = await admin
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-IMG01",
        itemName: "Görsel Kalemi",
        sku: "IMG-01",
        name: "Görsel Ürünü",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "ACTIVE",
      })
      .expect(201);
    const id = created.body.id as string;

    const up = await admin.put(`/catalog/products/${id}/image`).send({ dataUrl: PNG_1PX }).expect(200);
    expect(up.body.imageUrl).toMatch(/^\/api\/media\/products\//);
    const file = up.body.imageUrl.replace("/api/media/products/", "");
    // Herkese açık servis (oturumsuz)
    const img = await ctx.http().get(`/media/products/${file}`).expect(200);
    expect(img.headers["content-type"]).toContain("image/png");
    // Medya kaydı yazıldı
    const media = await ctx.prisma.productMedia.findFirst({ where: { productId: id, role: "NOTES_CARD" } });
    expect(media?.url).toBe(up.body.imageUrl);

    // Geçersiz görsel reddedilir
    await admin.put(`/catalog/products/${id}/image`).send({ dataUrl: "data:text/plain;base64,aGVsbG8=" }).expect(400);

    // Kaldır
    await admin.delete(`/catalog/products/${id}/image`).expect(200);
    const after = await ctx.prisma.productMedia.findFirst({ where: { productId: id, role: "NOTES_CARD" } });
    expect(after).toBeNull();
  });

  it("geçmişi olmayan ürün silinir; tekrar silme 404", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const created = await admin
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-DEL01",
        itemName: "Silinecek Kalem",
        sku: "DEL-01",
        name: "Silinecek Ürün",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "DRAFT",
      })
      .expect(201);
    const id = created.body.id as string;
    await admin.delete(`/catalog/products/${id}`).expect(200);
    await admin.delete(`/catalog/products/${id}`).expect(404);
  });

  it("fiyat/satış kaydı olan ürün silinmez (400), durum değiştirmesi önerilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const created = await admin
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-DEL02",
        itemName: "Fiyatlı Kalem",
        sku: "DEL-02",
        name: "Fiyatlı Ürün",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "ACTIVE",
      })
      .expect(201);
    const id = created.body.id as string;
    const channel = await ctx.prisma.salesChannel.create({ data: { code: "T-WEB", name: "Test Web", type: "WEBSITE" } });
    const list = await ctx.prisma.priceList.create({ data: { channelId: channel.id, currency: "TRY" } });
    await ctx.prisma.priceListItem.create({ data: { priceListId: list.id, productId: id, price: "1000" } });
    await admin.delete(`/catalog/products/${id}`).expect(400);
  });

  it("stokta olan ürün vitrinde inStock=true döner", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const created = await admin
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-STK01",
        itemName: "Stoklu Kalem",
        sku: "STK-01",
        name: "Stoklu Ürün",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "ACTIVE",
        scentProfile: {
          gender: "women",
          accords: [{ label: "çiçeksi", strength: 70 }],
          dayPct: 60,
          seasons: { winter: 40, spring: 60, summer: 50, autumn: 40 },
        },
      })
      .expect(201);
    const id = created.body.id as string;
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { id } });

    // Stok, bakiye↔hareket değişmezliğini koruyacak şekilde RECEIPT hareketiyle eklenir (CLAUDE.md kural 2).
    const wh = await ctx.prisma.warehouse.create({ data: { code: "W-STK", name: "Stok Depo" } });
    const loc = await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "A-01" } });
    await admin
      .post("/stock/movements")
      .send({ type: "RECEIPT", itemId: product.itemId, locationId: loc.id, qty: "10", newLot: { lotNo: "L-STK-1" } })
      .expect(201);

    const showcase = await ctx.http().get("/showcase/products/STK-01").expect(200);
    expect(showcase.body.inStock).toBe(true);
  });

  it("yetki: sales:CREATE olmayan /full açamaz; sales:DELETE olmayan silemez", async () => {
    const viewer = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    await viewer
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-NOP01",
        itemName: "Yetkisiz",
        sku: "NOP-01",
        name: "Yetkisiz Ürün",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "DRAFT",
      })
      .expect(403);

    // SALES rolü CREATE/EDIT yapar ama DELETE yapamaz
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const created = await sales
      .post("/catalog/products/full")
      .send({
        itemCode: "EM-SAL01",
        itemName: "Satış Kalemi",
        sku: "SAL-01",
        name: "Satış Ürünü",
        concentration: "EDP",
        volumeMl: 50,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "DRAFT",
      })
      .expect(201);
    await sales.delete(`/catalog/products/${created.body.id}`).expect(403);
  });
});
