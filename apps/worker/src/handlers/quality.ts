import { emit, integrationLogSink, openInspectionForLot } from "@atelier/db";
import { buildContext, createDefaultRegistry, type IntegrationAdapter, type MarketplaceCapabilities, MemoryLogSink, resolveCredentials } from "@atelier/integrations";
import { type EventHandler } from "./index.js";

const registry = createDefaultRegistry();

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

/**
 * KAL-04: compliance.changed → ürün SALES_LOCKED olduysa pazaryeri listelemesini pasifler (mock: stok 0 iter).
 * Yalnızca kilitlenmede uygulanır; ACTIVE'e dönünce yeniden yayınlama ayrı akış (stok senkronu).
 */
export const deactivateOnComplianceChanged: EventHandler<"compliance.changed"> = async (event, { prisma, log, eventId }) => {
  const product = await prisma.product.findUnique({ where: { id: event.productId }, select: { sku: true, status: true } });
  if (!product || product.status !== "SALES_LOCKED") return;
  for (const code of ["TRENDYOL", "HEPSIBURADA"]) {
    const integration = await prisma.integration.findUnique({ where: { code } });
    const credentials = resolveCredentials(integration?.credentialsRef);
    const { adapter } = registry.resolve<IntegrationAdapter & MarketplaceCapabilities>(code, { credentials }, "mock");
    const ctx = buildContext({ integrationId: integration?.id ?? code, credentials, sink: integration ? integrationLogSink(prisma) : new MemoryLogSink(), direction: "OUT" });
    await adapter.pushStock(ctx, [{ sku: product.sku, qty: 0 }]);
  }
  log.info({ eventId, productId: event.productId, sku: product.sku }, "compliance.changed → SALES_LOCKED; pazaryeri stok 0 itildi");
};
