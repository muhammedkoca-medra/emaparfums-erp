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
