import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
const ids: Record<string, string> = {};

async function product(key: string, accords: [string, number][]) {
  const sfx = Math.floor(Math.random() * 1e9);
  const it = await ctx.prisma.item.create({ data: { code: `MS-${sfx}`, name: key, type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await ctx.prisma.product.create({ data: { itemId: it.id, sku: `SS-${sfx}`, name: key, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" } });
  await ctx.prisma.productAccord.createMany({ data: accords.map(([accord, score]) => ({ productId: p.id, accord, score })) });
  ids[key] = p.id;
  return p.id;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  await product("Amber Yoğun", [["amber", 90], ["woody", 60], ["sweet", 40]]);
  await product("Amber Hafif", [["amber", 80], ["woody", 50], ["sweet", 30]]);
  await product("Çiçeksi", [["floral", 90], ["citrus", 50]]);
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("koku AI (F5-01/02, KOK)", () => {
  it("benzer koku en yakın akor profilini önce döndürür", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const r = await admin.get(`/scent/products/${ids["Amber Yoğun"]}/similar?limit=5`).expect(200);
    expect(r.body.similar[0].id).toBe(ids["Amber Hafif"]); // en benzer amber
    expect(r.body.similar[0].score).toBeGreaterThan(0.9);
  });

  it("arama loglanır; sonuçsuz/düşük skorlu arama karşılanmayan talebe düşer (KOK-07)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    await admin.post("/scent/search").send({ query: `oud-${Math.random().toString(36).slice(2, 6)}` }).expect(201);
    const unmet = await admin.get("/scent/unmet-demand").expect(200);
    expect(Array.isArray(unmet.body)).toBe(true);
    expect(unmet.body.length).toBeGreaterThanOrEqual(1);
  });

  it("akor tabanlı arama benzerlik skoruyla sıralar", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const r = await admin.post("/scent/search").send({ query: "Amber", accords: [{ accord: "amber", score: 100 }] }).expect(201);
    expect(r.body.results.length).toBeGreaterThanOrEqual(1);
    expect(r.body.topScore).toBeGreaterThan(0);
  });
});
