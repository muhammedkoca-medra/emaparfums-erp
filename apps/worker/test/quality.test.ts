import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deactivateOnComplianceChanged, inspectOnBatchCompleted, inspectOnLotReceived, releaseBatchOnLotReleased } from "../src/handlers/quality.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;
let itemId: string;

async function lot(opts: { batchId?: string } = {}) {
  return prisma.lot.create({ data: { itemId, lotNo: `L-${Math.random().toString(36).slice(2, 8)}`, qcStatus: "QUARANTINE", batchId: opts.batchId ?? null } });
}

beforeAll(async () => {
  prisma = createPrismaClient(workerTestDbUrl());
  const sfx = Math.floor(Math.random() * 1e6);
  itemId = (await prisma.item.create({ data: { code: `WQ-${sfx}`, name: "WQ", type: "SAMPLE", uom: "PCS" } })).id;
  await prisma.qcTest.create({ data: { code: `WQT-${sfx}`, name: "T", appliesTo: ["SAMPLE"] } });
});
afterAll(() => prisma.$disconnect());

describe("kalite worker işleyicileri (KAL-01, URT-06)", () => {
  it("lot.received → muayene açar (idempotent)", async () => {
    const l = await lot();
    await inspectOnLotReceived({ type: "lot.received", lotId: l.id }, { prisma, log, eventId: "e1" });
    expect(await prisma.qcInspection.count({ where: { lotId: l.id } })).toBe(1);
    // ikinci teslim: yeni muayene açılmaz
    await inspectOnLotReceived({ type: "lot.received", lotId: l.id }, { prisma, log, eventId: "e1b" });
    expect(await prisma.qcInspection.count({ where: { lotId: l.id } })).toBe(1);
  });

  it("batch.completed → mamul lotu için muayene açar", async () => {
    const l = await lot();
    await inspectOnBatchCompleted({ type: "batch.completed", batchId: "b1", outputLotId: l.id }, { prisma, log, eventId: "e2" });
    expect(await prisma.qcInspection.count({ where: { lotId: l.id } })).toBe(1);
  });

  it("lot.released → partiyi RELEASED yapar (URT-06)", async () => {
    const formula = await prisma.formula.create({ data: { code: `WF-${Math.random().toString(36).slice(2, 7)}`, version: 1, name: "F", concentrationPct: "20", status: "APPROVED" } });
    const pItem = await prisma.item.create({ data: { code: `WM-${Math.random().toString(36).slice(2, 7)}`, name: "M", type: "FINISHED_GOOD", uom: "PCS" } });
    const product = await prisma.product.create({ data: { itemId: pItem.id, sku: `WS-${Math.random().toString(36).slice(2, 7)}`, name: "P", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", formulaId: formula.id } });
    const batch = await prisma.productionBatch.create({ data: { number: `PB-${Math.random().toString(36).slice(2, 7)}`, productId: product.id, formulaId: formula.id, plannedQty: 10, stage: "QUALITY_CONTROL" } });
    const l = await lot({ batchId: batch.id });
    await releaseBatchOnLotReleased({ type: "lot.released", lotId: l.id }, { prisma, log, eventId: "e3" });
    expect((await prisma.productionBatch.findUniqueOrThrow({ where: { id: batch.id } })).stage).toBe("RELEASED");
    expect(await prisma.outboxEvent.findFirst({ where: { type: "batch.stage_changed", aggregateId: batch.id } })).toBeTruthy();
  });

  it("lot.released → partisiz lotta hata vermez", async () => {
    const l = await lot();
    await expect(releaseBatchOnLotReleased({ type: "lot.released", lotId: l.id }, { prisma, log, eventId: "e4" })).resolves.toBeUndefined();
  });

  it("compliance.changed → SALES_LOCKED üründe pazaryeri stok 0 iter (mock, hatasız)", async () => {
    const sfx = Math.random().toString(36).slice(2, 7);
    const it = await prisma.item.create({ data: { code: `CC-${sfx}`, name: "CC", type: "FINISHED_GOOD", uom: "PCS" } });
    const locked = await prisma.product.create({ data: { itemId: it.id, sku: `CS-${sfx}`, name: "P", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "SALES_LOCKED" } });
    await expect(deactivateOnComplianceChanged({ type: "compliance.changed", productId: locked.id }, { prisma, log, eventId: "e5" })).resolves.toBeUndefined();
  });

  it("compliance.changed → ACTIVE üründe pazaryerine dokunmaz", async () => {
    const sfx = Math.random().toString(36).slice(2, 7);
    const it = await prisma.item.create({ data: { code: `CA-${sfx}`, name: "CA", type: "FINISHED_GOOD", uom: "PCS" } });
    const active = await prisma.product.create({ data: { itemId: it.id, sku: `CAS-${sfx}`, name: "P", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" } });
    await expect(deactivateOnComplianceChanged({ type: "compliance.changed", productId: active.id }, { prisma, log, eventId: "e6" })).resolves.toBeUndefined();
  });
});
