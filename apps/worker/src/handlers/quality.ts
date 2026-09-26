import { emit, openInspectionForLot } from "@atelier/db";
import { type EventHandler } from "./index.js";

/** KAL-01: lot.received → kalem tipine göre otomatik muayene açar (idempotent). */
export const inspectOnLotReceived: EventHandler<"lot.received"> = async (event, { prisma, log, eventId }) => {
  const id = await prisma.$transaction((tx) => openInspectionForLot(tx, event.lotId));
  if (id) log.info({ eventId, lotId: event.lotId, inspectionId: id }, "lot.received → muayene açıldı");
};

/** KAL-01: batch.completed → mamul lotu için otomatik muayene açar (idempotent). */
export const inspectOnBatchCompleted: EventHandler<"batch.completed"> = async (event, { prisma, log, eventId }) => {
  const id = await prisma.$transaction((tx) => openInspectionForLot(tx, event.outputLotId));
  if (id) log.info({ eventId, lotId: event.outputLotId, inspectionId: id }, "batch.completed → muayene açıldı");
};

/**
 * URT-06: lot.released → lot bir üretim partisinden geldiyse (batchId) partiyi RELEASED yapar.
 * Idempotent: parti zaten RELEASED/CANCELLED ise dokunmaz.
 */
export const releaseBatchOnLotReleased: EventHandler<"lot.released"> = async (event, { prisma, log, eventId }) => {
  const lot = await prisma.lot.findUnique({ where: { id: event.lotId }, select: { batchId: true } });
  if (!lot?.batchId) return;
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ stage: string }[]>`SELECT stage FROM "ProductionBatch" WHERE id = ${lot.batchId} FOR UPDATE`;
    const stage = rows[0]?.stage;
    if (!stage || stage === "RELEASED" || stage === "CANCELLED") return;
    await tx.productionBatch.update({ where: { id: lot.batchId! }, data: { stage: "RELEASED" } });
    await tx.productionStageLog.updateMany({ where: { batchId: lot.batchId!, endedAt: null }, data: { endedAt: new Date() } });
    await tx.productionStageLog.create({ data: { batchId: lot.batchId!, stage: "RELEASED", startedAt: new Date(), note: "lot serbest bırakıldı" } });
    await emit(tx, { type: "batch.stage_changed", batchId: lot.batchId!, stage: "RELEASED" });
    log.info({ eventId, batchId: lot.batchId }, "lot.released → parti RELEASED (URT-06)");
  });
};
