import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;

async function batchWithCosts() {
  const sfx = Math.floor(Math.random() * 1e9);
  const it = await ctx.prisma.item.create({ data: { code: `MC-${sfx}`, name: "Mamul", type: "FINISHED_GOOD", uom: "PCS" } });
  const product = await ctx.prisma.product.create({ data: { itemId: it.id, sku: `SC-${sfx}`, name: "Ürün", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME" } });
  const formula = await ctx.prisma.formula.create({ data: { code: `FC-${sfx}`, version: 1, name: "F", concentrationPct: "20", status: "APPROVED" } });
  const batch = await ctx.prisma.productionBatch.create({ data: { number: `PC-${sfx}`, productId: product.id, formulaId: formula.id, plannedQty: 1000, producedQty: 1000, stage: "QUALITY_CONTROL" } });
  await ctx.prisma.batchCost.createMany({
    data: [
      { batchId: batch.id, component: "ESSENCE", standard: "305", actual: "318" },
      { batchId: batch.id, component: "BOTTLE", standard: "2", actual: "2" },
    ],
  });
  return batch;
}

beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("maliyet (F4-01/02)", () => {
  it("parti kırılımı bileşen sapmasını ve eşik uyarısını verir (MLY-04)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const batch = await batchWithCosts();
    const r = await admin.get(`/costing/batches/${batch.id}`).expect(200);
    expect(r.body.components).toHaveLength(2);
    const essence = r.body.components.find((c: { component: string }) => c.component === "ESSENCE");
    expect(essence.variance).toBe("13");
    expect(essence.warn).toBe(true); // %4.26 > %3
    expect(Number(r.body.unitCost)).toBeCloseTo(320, 0); // 318 + 2
  });

  it("parametreler okunur ve güncellenir; yetkisiz güncelleyemez", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const p = await admin.get("/costing/parameters").expect(200);
    expect(p.body.laborRatePerHour).toBeTruthy();
    await admin.put("/costing/parameters").send({ laborRatePerHour: "150.00" }).expect(200);
    expect((await admin.get("/costing/parameters").expect(200)).body.laborRatePerHour).toBe("150.00");
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.put("/costing/parameters").send({ laborRatePerHour: "1" }).expect(403);
  });

  it("senaryo hesabı (MLY-05) kaydetmeden birim maliyet ve marj döndürür", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const r = await admin
      .post("/costing/simulate")
      .send({ baseComponents: [{ component: "ESSENCE", unit: "100" }, { component: "DIRECT_LABOR", unit: "20" }], essenceFactor: 1.2, fxFactor: 1.1, batchSizeFactor: 2, avgNetSale: "200" })
      .expect(201);
    expect(r.body.unitCost).toBe("142");
    expect(r.body.margin).toBe("58");
  });
});
