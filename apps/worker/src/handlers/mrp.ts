import { emit, Prisma } from "@atelier/db";
import { type EventHandler } from "./index.js";

/**
 * SAT-01 MRP: stock.below_min → satın alınan kalem (hammadde, ambalaj, yarı mamul) için satın alma talebi
 * taslağı açar ve requisition.created yayar. Miktar = sipariş miktarı (reorderQty) ya da min − kullanılabilir.
 * İhtiyaç tarihi = bugün + tercihli tedarikçinin teslim süresi (tedarikçi yoksa bugün; gün uydurulmaz).
 * Idempotent: kalem için siparişe bağlanmamış açık talep varsa yenisi açılmaz. Mamul için talep açılmaz
 * (üretim önerisi panoda hesaplanır).
 */
export const requisitionOnBelowMin: EventHandler<"stock.below_min"> = async (event, { prisma, log, eventId }) => {
  const item = await prisma.item.findUnique({
    where: { id: event.itemId },
    select: {
      id: true,
      code: true,
      type: true,
      minStock: true,
      reorderQty: true,
      supplierItems: { where: { isPreferred: true }, select: { supplierId: true, leadTimeDays: true }, take: 1 },
    },
  });
  if (!item || !item.minStock || !["RAW_MATERIAL", "PACKAGING", "SEMI_FINISHED"].includes(item.type)) return;
  await prisma.$transaction(async (tx) => {
    const open = await tx.purchaseRequisition.findFirst({ where: { itemId: item.id, purchaseOrderId: null }, select: { id: true } });
    if (open) return;
    const available = new Prisma.Decimal(event.available);
    const qty = item.reorderQty ?? item.minStock!.minus(available);
    if (qty.lessThanOrEqualTo(0)) return;
    const pref = item.supplierItems[0];
    const neededBy = new Date(Date.now() + (pref?.leadTimeDays ?? 0) * 86_400_000);
    const req = await tx.purchaseRequisition.create({
      data: {
        itemId: item.id,
        qty,
        neededBy,
        source: "MRP",
        reason: `Min. stok altı: kullanılabilir ${available.toString()} / min ${item.minStock!.toString()}`,
        suggestedSupplierId: pref?.supplierId ?? null,
      },
      select: { id: true },
    });
    await emit(tx, { type: "requisition.created", requisitionId: req.id, source: "MRP" });
    log.info({ eventId, itemId: item.id, code: item.code, qty: qty.toString() }, "stock.below_min → satın alma talebi açıldı");
  });
};
