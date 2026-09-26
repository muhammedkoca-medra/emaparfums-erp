import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let approvedProductId: string;
let draftProductId: string;

async function makeProduct(ctx: TestContext, sku: string, formulaStatus: "APPROVED" | "DRAFT") {
  const item = await ctx.prisma.item.create({ data: { code: `MM-${sku}`, name: `Ürün ${sku}`, type: "FINISHED_GOOD", uom: "PCS" } });
  const formula = await ctx.prisma.formula.create({
    data: { code: `F-${sku}`, version: 1, name: `Formül ${sku}`, concentrationPct: "20", status: formulaStatus },
  });
  const p = await ctx.prisma.product.create({
    data: { itemId: item.id, sku, name: `Ürün ${sku}`, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", formulaId: formula.id },
  });
  return p.id;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  approvedProductId = await makeProduct(ctx, "PRD-A1", "APPROVED");
  draftProductId = await makeProduct(ctx, "PRD-D1", "DRAFT");
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

const batchBody = (productId: string) => ({
  productId,
  plannedQty: 100,
  essenceGr: "200",
  baseGr: "800",
  macerationDays: 14,
  macerationPlace: "Soğuk oda R2",
  bottleType: "AMBER" as const,
});

describe("üretim partisi (F3-01, URT-01/04/08)", () => {
  it("onaylı formülle parti açılır; esans yüzdesi hesaplanır", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    const detail = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(detail.body.essencePct).toBe(20); // 200/(200+800)
    expect(detail.body.basePct).toBe(80);
    expect(detail.body.stage).toBe("FORMULA_APPROVAL");
    expect(detail.body.bottleType).toBe("AMBER");
  });

  it("onaysız formülle parti açılamaz (URT-01)", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    await prod.post("/production/batches").send(batchBody(draftProductId)).expect(400);
  });

  it("maserasyon süresi dolmadan gerekçesiz geçilemez (URT-04)", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    // FORMULA_APPROVAL → WEIGHING_MIXING → MACERATION
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201);
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201);
    const inMac = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(inMac.body.stage).toBe("MACERATION");
    expect(inMac.body.maceration.done).toBe(false);
    // gerekçesiz geçiş reddedilir
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(400);
    // gerekçeli geçiş (PRODUCTION rolü production:APPROVE taşır)
    await prod.post(`/production/batches/${body.id}/advance`).send({ overrideReason: "acil sevkiyat" }).expect(201);
    const after = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(after.body.stage).toBe("CHILL_FILTER");
    expect(after.body.stageLogs.some((l: { note: string | null }) => l.note === "acil sevkiyat")).toBe(true);
  });

  it("yetkisiz kullanıcı parti açamaz", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.post("/production/batches").send(batchBody(approvedProductId)).expect(403);
  });

  it("değerler elle düzenlenir; esans yüzdesi yeniden hesaplanır", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    await prod.patch(`/production/batches/${body.id}`).send({ essenceGr: "300", baseGr: "700", macerationPlace: "Tank T5", plannedQty: 250 }).expect(200);
    const d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.essencePct).toBe(30);
    expect(d.body.macerationPlace).toBe("Tank T5");
    expect(d.body.plannedQty).toBe(250);
  });

  it("aşama manuel ayarlanır (ileri/geri) ve loglanır", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    // Doğrudan FILLING'e atla (manuel düzeltme)
    await prod.patch(`/production/batches/${body.id}/stage`).send({ stage: "FILLING", note: "elle düzeltme" }).expect(200);
    let d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.stage).toBe("FILLING");
    // Geri al
    await prod.patch(`/production/batches/${body.id}/stage`).send({ stage: "WEIGHING_MIXING" }).expect(200);
    d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.stage).toBe("WEIGHING_MIXING");
    expect(d.body.stageLogs.some((l: { stage: string }) => l.stage === "FILLING")).toBe(true);
  });
});
