import { createLot, recordMovement } from "@atelier/db";
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

describe("BOM'lu üretim: malzeme, FEFO tüketim, maliyet, çıktı (URT-02/03/05)", () => {
  let bomProductId: string;
  let bomProductItemId: string;
  let rawItemId: string;
  let pkgItemId: string;
  let locId: string;

  async function receive(itemId: string, qty: string, lotNo: string, unitCost: string) {
    await ctx.prisma.$transaction(async (tx) => {
      const lot = await createLot(tx, { itemId, lotNo, qcStatus: "RELEASED", expiryDate: new Date("2031-01-01") });
      await recordMovement(tx, { type: "RECEIPT", itemId, lotId: lot.id, qty, toLocationId: locId, unitCost, refType: "Test", refId: "prod-flow" });
    });
  }

  beforeAll(async () => {
    const sfx = Math.floor(Math.random() * 1e6);
    const wh = (await ctx.prisma.warehouse.create({ data: { code: `PF-${sfx}`, name: "Üretim testi deposu" } })).id;
    locId = (await ctx.prisma.location.create({ data: { warehouseId: wh, code: "PF-01", pickSequence: 1 } })).id;
    // Mamul + onaylı formül + BOM
    const item = await ctx.prisma.item.create({ data: { code: `MM-BOM${sfx}`, name: `Mamul BOM ${sfx}`, type: "FINISHED_GOOD", uom: "PCS" } });
    bomProductItemId = item.id;
    const formula = await ctx.prisma.formula.create({ data: { code: `F-BOM${sfx}`, version: 1, name: "BOM Formül", concentrationPct: "20", status: "APPROVED" } });
    const product = await ctx.prisma.product.create({ data: { itemId: item.id, sku: `BOM-${sfx}`, name: "BOM Ürün", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", formulaId: formula.id } });
    bomProductId = product.id;
    const raw = await ctx.prisma.item.create({ data: { code: `HM-BOM${sfx}`, name: "Esans BOM", type: "RAW_MATERIAL", uom: "KG" } });
    const pkg = await ctx.prisma.item.create({ data: { code: `AM-BOM${sfx}`, name: "50 ml amber şişe", type: "PACKAGING", uom: "PCS" } });
    rawItemId = raw.id;
    pkgItemId = pkg.id;
    await ctx.prisma.billOfMaterials.create({
      data: {
        productId: product.id,
        formulaId: formula.id,
        batchSize: 1000,
        lines: { create: [{ itemId: raw.id, qty: "10", uom: "KG", scrapPct: "0" }, { itemId: pkg.id, qty: "1000", uom: "PCS", scrapPct: "0" }] },
      },
    });
    // Bol stok: esans birim 5, şişe birim 2
    await receive(raw.id, "50", "L-RAW-1", "5");
    await receive(pkg.id, "5000", "L-PKG-1", "2");
  });

  const bomBatch = () => ({ productId: bomProductId, plannedQty: 100, essenceGr: "200", baseGr: "800", macerationDays: 0, macerationPlace: "Tank", bottleType: "AMBER" as const });

  it("malzeme ihtiyacı adet başına ölçeklenir ve stok yeterliyse ok", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    const mats = await prod.get(`/production/batches/${body.id}/materials`).expect(200);
    expect(mats.body.hasBom).toBe(true);
    expect(mats.body.hasShortage).toBe(false);
    const raw = mats.body.lines.find((l: { itemId: string }) => l.itemId === rawItemId);
    const pkg = mats.body.lines.find((l: { itemId: string }) => l.itemId === pkgItemId);
    expect(raw.requiredQty).toBe("1"); // 10 * 100 / 1000
    expect(pkg.requiredQty).toBe("100"); // 1000 * 100 / 1000
    expect(raw.ok).toBe(true);
  });

  it("tartıma girişte FEFO rezerve, çıkışta PRODUCTION_CONSUME + BatchConsumption + BatchCost", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    // FORMULA_APPROVAL → WEIGHING_MIXING: rezervasyon
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201);
    const reserved = await ctx.prisma.stockReservation.findMany({ where: { refType: "ProductionBatch", refId: body.id, releasedAt: null, consumedAt: null } });
    expect(reserved).toHaveLength(2);
    // WEIGHING_MIXING → MACERATION: tüketim
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201);
    const consumptions = await ctx.prisma.batchConsumption.findMany({ where: { batchId: body.id } });
    expect(consumptions).toHaveLength(2);
    const moves = await ctx.prisma.stockMovement.findMany({ where: { refType: "ProductionBatch", refId: body.id, type: "PRODUCTION_CONSUME" } });
    expect(moves).toHaveLength(2);
    // Açık rezervasyon kalmadı
    const stillOpen = await ctx.prisma.stockReservation.count({ where: { refType: "ProductionBatch", refId: body.id, releasedAt: null, consumedAt: null } });
    expect(stillOpen).toBe(0);
    // Maliyet: ESSENCE = 1kg*5 / 100 adet = 0.05 ; BOTTLE = 100*2 / 100 = 2
    const costs = await ctx.prisma.batchCost.findMany({ where: { batchId: body.id } });
    const byComp = Object.fromEntries(costs.map((c) => [c.component, c.actual.toString()]));
    expect(byComp.ESSENCE).toBe("0.05");
    expect(byComp.BOTTLE).toBe("2");
  });

  it("stok yetersizse tartıma geçiş engellenir (URT-02)", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    // Çok büyük parti: esans ihtiyacı 10*100000/1000 = 1000 KG > 50 KG stok
    const { body } = await prod.post("/production/batches").send({ ...bomBatch(), plannedQty: 100000 }).expect(201);
    const mats = await prod.get(`/production/batches/${body.id}/materials`).expect(200);
    expect(mats.body.hasShortage).toBe(true);
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(400);
    // Aşama değişmedi
    const d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.stage).toBe("FORMULA_APPROVAL");
  });

  it("dolum çıktısı mamul lotunu QUARANTINE açar ve PRODUCTION_OUTPUT yazar (URT-05)", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    // FORMULA_APPROVAL → WEIGHING → MACERATION → CHILL_FILTER → FILLING (macerationDays 0)
    for (let i = 0; i < 4; i++) await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201);
    const atFilling = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(atFilling.body.stage).toBe("FILLING");
    const out = await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 98, scrapQty: 2 }).expect(201);
    expect(out.body.lotNo).toMatch(/^L-\d{4}-[A-Z]$/);
    const lot = await ctx.prisma.lot.findUniqueOrThrow({ where: { id: out.body.lotId } });
    expect(lot.qcStatus).toBe("QUARANTINE");
    expect(lot.batchId).toBe(body.id);
    expect(lot.itemId).toBe(bomProductItemId);
    const output = await ctx.prisma.stockMovement.findFirstOrThrow({ where: { refType: "ProductionBatch", refId: body.id, type: "PRODUCTION_OUTPUT" } });
    expect(output.qty.toString()).toBe("98");
    const d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.producedQty).toBe(98);
    // İkinci çıktı reddedilir
    await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 10 }).expect(400);
  });

  it("çıktı yalnızca FILLING aşamasında girilir", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 10 }).expect(400);
  });
});
