import { recordMovement, reserveFefo } from "@atelier/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let itemId: string;
let testA: string;
let testB: string;

async function lot(qc: "QUARANTINE" = "QUARANTINE") {
  return ctx.prisma.lot.create({ data: { itemId, lotNo: `L-${Math.random().toString(36).slice(2, 8)}`, qcStatus: qc } });
}
async function inspectionFor(lotId: string) {
  return ctx.prisma.qcInspection.create({ data: { lotId, status: "PENDING" } });
}

beforeAll(async () => {
  ctx = await setupTestApp();
  const sfx = Math.floor(Math.random() * 1e6);
  itemId = (await ctx.prisma.item.create({ data: { code: `NUM-${sfx}`, name: "Numune", type: "SAMPLE", uom: "PCS" } })).id;
  testA = (await ctx.prisma.qcTest.create({ data: { code: `QCA-${sfx}`, name: "Görünüş", appliesTo: ["SAMPLE"] } })).id;
  testB = (await ctx.prisma.qcTest.create({ data: { code: `QCB-${sfx}`, name: "Koku", appliesTo: ["SAMPLE"] } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("kalite muayene ve lot serbest bırakma (F3-04, KAL-02/03)", () => {
  it("tüm testler geçmeden serbest bırakılamaz (KAL-02)", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const l = await lot();
    const insp = await inspectionFor(l.id);
    await qc.post(`/quality/inspections/${insp.id}/release`).send({}).expect(400);
    expect((await ctx.prisma.lot.findUniqueOrThrow({ where: { id: l.id } })).qcStatus).toBe("QUARANTINE");
  });

  it("tüm testler geçince lot serbest bırakılır ve lot.released yayılır (KAL-02)", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const l = await lot();
    const insp = await inspectionFor(l.id);
    await qc.post(`/quality/inspections/${insp.id}/results`).send({ results: [{ testId: testA, passed: true, value: "berrak" }, { testId: testB, passed: true }] }).expect(201);
    const rel = await qc.post(`/quality/inspections/${insp.id}/release`).send({ note: "uygun" }).expect(201);
    expect(rel.body.status).toBe("PASSED");
    expect((await ctx.prisma.lot.findUniqueOrThrow({ where: { id: l.id } })).qcStatus).toBe("RELEASED");
    const evt = await ctx.prisma.outboxEvent.findFirst({ where: { type: "lot.released", aggregateId: l.id } });
    expect(evt).toBeTruthy();
  });

  it("bir test kalırsa lot REJECTED, DÖF açılır, lot.quarantined yayılır (KAL-03)", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const l = await lot();
    const insp = await inspectionFor(l.id);
    const res = await qc.post(`/quality/inspections/${insp.id}/results`).send({ results: [{ testId: testA, passed: true }, { testId: testB, passed: false, value: "sapma" }] }).expect(201);
    expect(res.body.status).toBe("FAILED");
    expect(res.body.nonConformance).toMatch(/^NC-/);
    expect((await ctx.prisma.lot.findUniqueOrThrow({ where: { id: l.id } })).qcStatus).toBe("REJECTED");
    expect(await ctx.prisma.nonConformance.count({ where: { lotId: l.id } })).toBe(1);
    expect(await ctx.prisma.outboxEvent.findFirst({ where: { type: "lot.quarantined", aggregateId: l.id } })).toBeTruthy();
  });

  it("başarısız muayene serbest bırakılamaz", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const l = await lot();
    const insp = await inspectionFor(l.id);
    await qc.post(`/quality/inspections/${insp.id}/results`).send({ results: [{ testId: testA, passed: false }] }).expect(201);
    await qc.post(`/quality/inspections/${insp.id}/release`).send({}).expect(400);
  });

  it("karantinadaki lot satış rezervasyonuna giremez (STK-03)", async () => {
    // Karantinadaki lota (RECEIPT ile) stok koyup satış rezervasyonu denenince yetersiz stok döner.
    const { reserveFefo, recordMovement } = await import("@atelier/db");
    const wh = (await ctx.prisma.warehouse.create({ data: { code: `Q-${Math.random().toString(36).slice(2, 7)}`, name: "Q" } })).id;
    const loc = (await ctx.prisma.location.create({ data: { warehouseId: wh, code: "Q-01", pickSequence: 1 } })).id;
    const l = await lot();
    await ctx.prisma.$transaction((tx) => recordMovement(tx, { type: "RECEIPT", itemId, lotId: l.id, qty: "10", toLocationId: loc, refType: "Test", refId: "q" }));
    // reserveFefo yalnızca RELEASED lotlardan ayırır → karantinadaki lot görünmez.
    await expect(ctx.prisma.$transaction((tx) => reserveFefo(tx, { itemId, qty: "1", refType: "Test", refId: "q", warehouseId: wh }))).rejects.toThrow();
  });

  it("yetkisiz kullanıcı lot serbest bırakamaz (quality:APPROVE gerekir)", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const l = await lot();
    const insp = await inspectionFor(l.id);
    await sales.post(`/quality/inspections/${insp.id}/release`).send({}).expect(403);
  });
});

describe("uyum belgeleri ve satış kilidi (F3-04, KAL-04)", () => {
  async function product(status: "ACTIVE" | "SALES_LOCKED" = "ACTIVE") {
    const sfx = Math.floor(Math.random() * 1e9);
    const it = await ctx.prisma.item.create({ data: { code: `MC-${sfx}`, name: "Mamul C", type: "FINISHED_GOOD", uom: "PCS" } });
    return ctx.prisma.product.create({ data: { itemId: it.id, sku: `SC-${sfx}`, name: "Ürün C", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status } });
  }
  const MANDATORY = ["UTS_NOTIFICATION", "SAFETY_ASSESSMENT", "PIF", "LABEL_APPROVAL"] as const;

  it("zorunlu belge VALID değilse ürün SALES_LOCKED olur ve compliance.changed yayılır", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const p = await product("ACTIVE");
    const r = await qc.put(`/quality/compliance/${p.id}/UTS_NOTIFICATION`).send({ status: "IN_PROGRESS", externalRef: "UTS-123" }).expect(200);
    expect(r.body.productStatus).toBe("SALES_LOCKED");
    expect(r.body.statusChanged).toBe(true);
    expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SALES_LOCKED");
    expect(await ctx.prisma.outboxEvent.findFirst({ where: { type: "compliance.changed", aggregateId: p.id } })).toBeTruthy();
  });

  it("tüm zorunlu belgeler VALID olunca ürün ACTIVE olur", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const p = await product("SALES_LOCKED");
    for (const t of MANDATORY) await qc.put(`/quality/compliance/${p.id}/${t}`).send({ status: "VALID" }).expect(200);
    expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ACTIVE");
    const list = await qc.get(`/quality/compliance?productId=${p.id}`).expect(200);
    expect(list.body.docs.filter((d: { status: string }) => d.status === "VALID")).toHaveLength(MANDATORY.length);
  });
});

describe("izlenebilirlik ve geri çağırma (F3-04, KAL-06)", () => {
  async function forwardChain() {
    const sfx = Math.floor(Math.random() * 1e9);
    const it = await ctx.prisma.item.create({ data: { code: `MR-${sfx}`, name: "Mamul R", type: "FINISHED_GOOD", uom: "PCS" } });
    const product = await ctx.prisma.product.create({ data: { itemId: it.id, sku: `SR-${sfx}`, name: "Ürün R", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME" } });
    const formula = await ctx.prisma.formula.create({ data: { code: `FR-${sfx}`, version: 1, name: "F", concentrationPct: "20", status: "APPROVED" } });
    const batch = await ctx.prisma.productionBatch.create({ data: { number: `PR-${sfx}`, productId: product.id, formulaId: formula.id, plannedQty: 10, stage: "QUALITY_CONTROL" } });
    const outLot = await ctx.prisma.lot.create({ data: { itemId: it.id, lotNo: `L-OUT-${sfx}`, qcStatus: "RELEASED", batchId: batch.id } });
    const wh = await ctx.prisma.warehouse.create({ data: { code: `R-${sfx}`, name: "R" } });
    const loc = await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "R-01", pickSequence: 1 } });
    const channel = await ctx.prisma.salesChannel.create({ data: { code: `CH-${sfx}`, name: "K", type: "WEBSITE" } });
    const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Geri Çağrı Müşteri" } });
    const order = await ctx.prisma.salesOrder.create({ data: { number: `OR-${sfx}`, channelId: channel.id, customerId: customer.id, status: "CONFIRMED", netTotal: "100", otvTotal: "0", kdvTotal: "0", grandTotal: "100" } });
    const line = await ctx.prisma.salesOrderLine.create({ data: { orderId: order.id, productId: product.id, qty: 1, unitPriceGross: "100", netAmount: "100", otvRate: "0", otvAmount: "0", kdvRate: "0.20", kdvAmount: "0" } });
    // Stok ve rezervasyon stok servisiyle yazılır (kural 2): bakiye ↔ hareket ↔ rezervasyon tutarlı kalır.
    await ctx.prisma.$transaction(async (tx) => {
      await recordMovement(tx, { type: "RECEIPT", itemId: it.id, lotId: outLot.id, qty: "1", toLocationId: loc.id, refType: "Test", refId: "recall-chain" });
      await reserveFefo(tx, { itemId: it.id, qty: "1", refType: "SalesOrderLine", refId: line.id, orderLineId: line.id, warehouseId: wh.id });
    });
    return { outLot, customer };
  }

  it("trace mamul lotu için ileri (müşteri) zincirini döndürür", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const { outLot } = await forwardChain();
    const t = await qc.get(`/quality/trace/${outLot.id}`).expect(200);
    expect(t.body.batch).toBeTruthy();
    expect(t.body.orders.length).toBeGreaterThanOrEqual(1);
    expect(t.body.affectedCustomers).toBeGreaterThanOrEqual(1);
  });

  it("simülasyon lotu karantinaya almaz; gerçek geri çağırma alır", async () => {
    const qc = await loginAgent(ctx, await createUser(ctx, ["QUALITY"]));
    const { outLot } = await forwardChain();
    const sim = await qc.post("/quality/recalls").send({ lotIds: [outLot.id], reason: "test", isSimulation: true }).expect(201);
    expect(sim.body.affectedCustomers).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.lot.findUniqueOrThrow({ where: { id: outLot.id } })).qcStatus).toBe("RELEASED");
    const real = await qc.post("/quality/recalls").send({ lotIds: [outLot.id], reason: "gerçek", isSimulation: false }).expect(201);
    expect(real.body.affectedCustomers).toBeGreaterThanOrEqual(1);
    expect((await ctx.prisma.lot.findUniqueOrThrow({ where: { id: outLot.id } })).qcStatus).toBe("QUARANTINE");
  });
});
