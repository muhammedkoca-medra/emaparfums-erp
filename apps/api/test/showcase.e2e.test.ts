import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let itemId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const item = await ctx.prisma.item.create({
    data: { code: "EM-T001", name: "Vitrin Test", type: "FINISHED_GOOD", uom: "PCS" },
  });
  itemId = item.id;
  await ctx.prisma.product.create({
    data: {
      itemId,
      sku: "EMAT001",
      name: "Test Kokusu",
      concentration: "EDP",
      volumeMl: 50,
      gtip: "3303.00",
      taxCategory: "PERFUME",
      status: "ACTIVE",
      scentProfile: {
        referenceName: "Referans Parfüm",
        referenceBrand: "Gizli Marka",
        gender: "unisex",
        accords: [{ label: "narenciye", strength: 100 }],
        dayPct: 60,
        seasons: { winter: 20, spring: 40, summer: 30, autumn: 25 },
        source: "test",
      },
    },
  });
  // DRAFT ürün vitrinde görünmemeli
  const draftItem = await ctx.prisma.item.create({
    data: { code: "EM-T002", name: "Taslak Test", type: "FINISHED_GOOD", uom: "PCS" },
  });
  await ctx.prisma.product.create({
    data: {
      itemId: draftItem.id,
      sku: "EMAT002",
      name: "Taslak Koku",
      concentration: "EDP",
      volumeMl: 50,
      gtip: "3303.00",
      taxCategory: "PERFUME",
      status: "DRAFT",
      scentProfile: {
        gender: "men",
        accords: [{ label: "odunsu", strength: 90 }],
        dayPct: 40,
        seasons: { winter: 50, spring: 10, summer: 5, autumn: 30 },
      },
    },
  });
});

afterAll(async () => {
  await ctx.app.close();
});

describe("vitrin (herkese açık)", () => {
  it("oturumsuz erişilir ve ACTIVE ürünleri döndürür", async () => {
    const res = await ctx.http().get("/showcase/products").expect(200);
    const skus = (res.body as { slug: string }[]).map((p) => p.slug);
    expect(skus).toContain("EMAT001");
    expect(skus).not.toContain("EMAT002"); // DRAFT gizli
  });

  it("referans marka/ad ASLA dönmez", async () => {
    const res = await ctx.http().get("/showcase/products").expect(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("Gizli Marka");
    expect(raw).not.toContain("referenceBrand");
    expect(raw).not.toContain("Referans Parfüm");
  });

  it("detay güvenli profili döndürür, bulunmayan slug 404", async () => {
    const res = await ctx.http().get("/showcase/products/EMAT001").expect(200);
    expect(res.body).toMatchObject({
      slug: "EMAT001",
      name: "Test Kokusu",
      gender: "unisex",
      dayPct: 60,
    });
    expect(res.body.accords).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("Gizli Marka");
    await ctx.http().get("/showcase/products/YOK999").expect(404);
  });
});
