import { createLot, recordMovement } from "@atelier/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from "vitest";
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
  // 5.000 ml · 50 ml şişe · %20 → 100 adet, esans 1.000 ml, baz 4.000 ml
  plannedMl: "5000",
  macerationDays: 14,
  macerationPlace: "Soğuk oda R2",
  bottleType: "AMBER" as const,
});

describe("üretim partisi (F3-01, URT-01/04/08)", () => {
  it("hacimle (ml) parti açılır; esans/baz formül konsantrasyonundan bölünür", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    const detail = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(detail.body.plannedMl).toBe("5000");
    expect(detail.body.plannedQty).toBe(100); // 5000 / 50
    expect(detail.body.essenceMl).toBe("1000");
    expect(detail.body.baseMl).toBe("4000");
    expect(detail.body.mixUnit).toBe("ml");
    expect(detail.body.essencePct).toBe(20);
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

  it("değerler elle düzenlenir; hacim değişince adet ve esans/baz yeniden hesaplanır", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    await prod.patch(`/production/batches/${body.id}`).send({ plannedMl: "12500", macerationPlace: "Tank T5" }).expect(200);
    let d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.plannedQty).toBe(250);
    expect(d.body.essenceMl).toBe("2500");
    expect(d.body.macerationPlace).toBe("Tank T5");
    // Ölçülen değer elle düzeltilir
    await prod.patch(`/production/batches/${body.id}`).send({ essenceMl: "3000", baseMl: "7000" }).expect(200);
    d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.essencePct).toBe(30);
  });

  it("devam eden üretim doğrudan demlenmede, geçmiş tarihle kaydedilir (URT-14)", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const { body } = await prod
      .post("/production/batches")
      .send({ ...batchBody(approvedProductId), startStage: "MACERATION", startedAt: tenDaysAgo })
      .expect(201);
    const d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.stage).toBe("MACERATION");
    expect(d.body.maceration.start).toBe(tenDaysAgo);
    // 14 günlük demlenmenin ~4 günü kaldı
    expect(Math.round(d.body.maceration.remainingMs / 86_400_000)).toBe(4);
    expect(d.body.stageLogs[0]).toMatchObject({ stage: "MACERATION", startedAt: tenDaysAgo, note: "mevcut üretim kaydı" });
    // Geçmişte kullanılan malzeme için stok rezervasyonu yapılmaz
    expect(await ctx.prisma.stockReservation.count({ where: { refType: "ProductionBatch", refId: body.id } })).toBe(0);
    // Gelecek tarih reddedilir
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await prod.post("/production/batches").send({ ...batchBody(approvedProductId), startStage: "MACERATION", startedAt: future }).expect(400);
  });

  it("elle aşama geçişinde giriş tarihi geriye dönük girilir; kalite aşamasında kayıtlı üretimin çıktısı girilebilir", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201);
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await prod.patch(`/production/batches/${body.id}/stage`).send({ stage: "CHILL_FILTER", startedAt: twoDaysAgo }).expect(200);
    const d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.stageLogs.find((l: { stage: string }) => l.stage === "CHILL_FILTER").startedAt).toBe(twoDaysAgo);

    const qc = await prod
      .post("/production/batches")
      .send({ ...batchBody(approvedProductId), startStage: "QUALITY_CONTROL", startedAt: twoDaysAgo })
      .expect(201);
    // Mamulün gireceği bir lokasyon (canlıda depolar tohumdan gelir)
    const wh = await ctx.prisma.warehouse.create({ data: { code: `EX-${Math.floor(Math.random() * 1e6)}`, name: "Mevcut üretim deposu" } });
    await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "EX-01", pickSequence: 1 } });
    const out = await prod.post(`/production/batches/${qc.body.id}/output`).send({ producedQty: 100 });
    expect(out.status, JSON.stringify(out.body)).toBe(201);
    expect(out.body.producedQty).toBe(100);
  });

  it("hacim bir şişeden azsa parti açılmaz", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    await prod.post("/production/batches").send({ ...batchBody(approvedProductId), plannedMl: "40" }).expect(400);
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

  // 5.000 ml / 50 ml = 100 adet
  const bomBatch = () => ({ productId: bomProductId, plannedMl: "5000", macerationDays: 0, macerationPlace: "Tank", bottleType: "AMBER" as const });

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
    const { body } = await prod.post("/production/batches").send({ ...bomBatch(), plannedMl: "5000000" }).expect(201);
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

  const toFilling = async (agent: Awaited<ReturnType<typeof loginAgent>>, id: string) => {
    for (let i = 0; i < 4; i++) await agent.post(`/production/batches/${id}/advance`).send({}).expect(201);
  };

  it("dolum: stok + tester (ayrı satılamaz stok) + fire; hacim farkı uyarılır", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    await toFilling(prod, body.id);
    // 90 adet × 50 ml = 4.500 + tester 250 + fire 100 = 4.850 → partiden 150 ml kayıt dışı
    const out = await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 90, testerMl: "250", scrapMl: "100" }).expect(201);
    expect(out.body.producedQty).toBe(90);
    expect(out.body.tester.ml).toBe("250.00");
    expect(out.body.warnings[0]).toContain("150.00 ml");

    // Tester kalemi: SAMPLE · ML, ürüne bağlı; satılabilir mamulden ayrı
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { id: bomProductId }, include: { testerItem: true } });
    expect(product.testerItem?.type).toBe("SAMPLE");
    expect(product.testerItem?.uom).toBe("ML");
    expect(product.testerItem?.code).toMatch(/^TS-/);
    const testerLot = await ctx.prisma.lot.findUniqueOrThrow({ where: { id: out.body.tester.lotId } });
    expect(testerLot.qcStatus).toBe("QUARANTINE");
    expect(testerLot.batchId).toBe(body.id);
    const testerMove = await ctx.prisma.stockMovement.findFirstOrThrow({ where: { lotId: testerLot.id, type: "PRODUCTION_OUTPUT" } });
    expect(testerMove.qty.toString()).toBe("250");
    // Satılabilir mamul stoğuna yalnızca 90 adet girdi
    const fg = await ctx.prisma.stockMovement.findFirstOrThrow({ where: { refId: body.id, type: "PRODUCTION_OUTPUT", itemId: bomProductItemId } });
    expect(fg.qty.toString()).toBe("90");

    const d = await prod.get(`/production/batches/${body.id}`).expect(200);
    expect(d.body.testerMl).toBe("250");
    expect(d.body.scrapMl).toBe("100");
  });

  it("yalnızca tester dolumu da kaydedilir; ikinci çıktı reddedilir", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    await toFilling(prod, body.id);
    await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 0, testerMl: "0" }).expect(400);
    const out = await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 0, testerMl: "500" }).expect(201);
    expect(out.body.lotId).toBeNull();
    expect(out.body.tester.ml).toBe("500.00");
    // Adet 0 olsa da çıktı lotu var → tekrar giriş engellenir
    await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 10 }).expect(400);
  });

  it("kalite kontrolde tek adım onay: tüm testler onaylanmadan serbest bırakılmaz (KAL-02)", async () => {
    const tag = Math.random().toString(36).slice(2, 7).toUpperCase();
    const t1 = await ctx.prisma.qcTest.create({ data: { code: `APP-${tag}`, name: "Görünüş", appliesTo: ["FINISHED_GOOD"] } });
    const t2 = await ctx.prisma.qcTest.create({ data: { code: `ODR-${tag}`, name: "Koku", appliesTo: ["FINISHED_GOOD", "SAMPLE"] } });
    // Bu testin eklediği kalite testleri diğer test dosyalarının lotlarına da uygulanır; sonunda temizlenir.
    onTestFinished(async () => {
      await ctx.prisma.qcResult.deleteMany({ where: { testId: { in: [t1.id, t2.id] } } });
      await ctx.prisma.qcTest.deleteMany({ where: { id: { in: [t1.id, t2.id] } } });
    });
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const { body } = await admin.post("/production/batches").send(bomBatch()).expect(201);
    await toFilling(admin, body.id);
    await admin.post(`/production/batches/${body.id}/output`).send({ producedQty: 95, testerMl: "200" }).expect(201);
    // Dolum aşamasında onay verilemez
    await admin.post(`/production/batches/${body.id}/quality-release`).send({ passedTestIds: [t1.id, t2.id] }).expect(400);
    // FILLING → LABEL_PACK → QUALITY_CONTROL
    await admin.post(`/production/batches/${body.id}/advance`).send({}).expect(201);
    await admin.post(`/production/batches/${body.id}/advance`).send({}).expect(201);

    const q = await admin.get(`/production/batches/${body.id}/quality`).expect(200);
    expect(q.body.lots).toHaveLength(2); // mamul + tester
    const fgLot = q.body.lots.find((l: { item: { type: string } }) => l.item.type === "FINISHED_GOOD");
    expect(fgLot.tests.map((t: { code: string }) => t.code)).toEqual(expect.arrayContaining([t1.code, t2.code]));

    // Uygulanabilir tüm testler (başka test dosyalarının eklediği testler de dahil) ekrandaki listeden gelir.
    const allIds = [
      ...new Set((q.body.lots as { tests: { id: string }[] }[]).flatMap((l) => l.tests.map((x) => x.id))),
    ];
    // Eksik onay → hiçbir lot serbest kalmaz
    await admin
      .post(`/production/batches/${body.id}/quality-release`)
      .send({ passedTestIds: allIds.filter((x) => x !== t2.id) })
      .expect(400);
    const stillQ = await ctx.prisma.lot.count({ where: { batchId: body.id, qcStatus: "QUARANTINE" } });
    expect(stillQ).toBe(2);

    // Tümü onaylı → lotlar RELEASED, sonuçlar ve muayene kaydı yazılır
    const rel = await admin.post(`/production/batches/${body.id}/quality-release`).send({ passedTestIds: allIds }).expect(201);
    expect(rel.body.released).toHaveLength(2);
    const lots = await ctx.prisma.lot.findMany({ where: { batchId: body.id } });
    expect(lots.every((l) => l.qcStatus === "RELEASED")).toBe(true);
    const insp = await ctx.prisma.qcInspection.findFirstOrThrow({ where: { lotId: fgLot.lotId }, include: { results: true } });
    expect(insp.status).toBe("PASSED");
    expect(insp.results.filter((r) => r.passed).map((r) => r.testId)).toEqual(expect.arrayContaining([t1.id, t2.id]));
    const released = await ctx.prisma.outboxEvent.count({ where: { type: "lot.released", payload: { path: ["lotId"], equals: fgLot.lotId } } });
    expect(released).toBe(1);
  });

  it("dolum dağılımı girilmeden dolumdan, kalite onayı olmadan kalite kontrolden çıkılmaz", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    await toFilling(prod, body.id);
    const blocked = await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(400);
    expect(blocked.body.message).toContain("dolum dağılımını");
    await prod.post(`/production/batches/${body.id}/output`).send({ producedQty: 100 }).expect(201);
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201); // → LABEL_PACK
    await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(201); // → QUALITY_CONTROL
    const qc = await prod.post(`/production/batches/${body.id}/advance`).send({}).expect(400);
    expect(qc.body.message).toContain("kalite onayıyla");
  });

  it("kalite onayı quality:APPROVE ister", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const { body } = await prod.post("/production/batches").send(bomBatch()).expect(201);
    await prod.post(`/production/batches/${body.id}/quality-release`).send({ passedTestIds: [] }).expect(403);
  });
});

describe("hat planı — kapasite ve yeniden planlama (URT-07)", () => {
  it("kesin slot çakışamaz; tentative çakışabilir; yeniden planlama serbest aralığa taşır", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const resource = await ctx.prisma.resource.create({ data: { code: `T-${Math.random().toString(36).slice(2, 7)}`, name: "Tank", kind: "TANK" } });
    const b1 = (await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201)).body;
    const b2 = (await prod.post("/production/batches").send(batchBody(approvedProductId)).expect(201)).body;
    const base = new Date("2027-03-01T09:00:00Z").getTime();
    const iso = (h: number) => new Date(base + h * 3_600_000).toISOString();
    // 09:00–12:00 kesin slot
    await prod.post("/production/schedule").send({ resourceId: resource.id, batchId: b1.id, startAt: iso(0), endAt: iso(3) }).expect(201);
    // 11:00–13:00 kesin → çakışma 409
    await prod.post("/production/schedule").send({ resourceId: resource.id, batchId: b2.id, startAt: iso(2), endAt: iso(4) }).expect(409);
    // 11:00–13:00 tentative → izinli 201
    const tent = (await prod.post("/production/schedule").send({ resourceId: resource.id, batchId: b2.id, startAt: iso(2), endAt: iso(4), isTentative: true }).expect(201)).body;
    // tentative'i kesin serbest aralığa (13:00–15:00) taşı → 200
    await prod.patch(`/production/schedule/${tent.id}`).send({ startAt: iso(4), endAt: iso(6), isTentative: false }).expect(200);
    const list = await prod.get(`/production/schedule?from=${iso(-1)}&to=${iso(24)}`).expect(200);
    expect(list.body.filter((s: { resourceId: string }) => s.resourceId === resource.id).length).toBe(2);
    // Kaynak listesi
    const res = await prod.get("/production/resources").expect(200);
    expect(res.body.some((r: { id: string }) => r.id === resource.id)).toBe(true);
  });
});
