import { consumeReservation, emit, Prisma, releaseReservation, reserveAvailableFefo, type Tx, writeAudit } from "@atelier/db";
import { canTransition, type OrderStatus } from "@atelier/shared";
import { type EventHandler } from "./index.js";

/**
 * Sipariş ↔ stok zinciri (docs/02 §Olaylar · STK/SAT):
 *  - order.confirmed → sipariş satırları için serbest stoktan FEFO rezervasyonu; yetmeyen kısım "stok bekliyor".
 *  - stock.changed   → stok gelince bekleyen siparişlerin eksikleri sırayla (en eski sipariş önce) tamamlanır.
 *  - order.cancelled → açık rezervasyonlar stoğa geri bırakılır.
 *  - shipment.created → ayrılan stok SALE hareketiyle düşülür, sipariş SHIPPED olur.
 * Hepsi idempotenttir: ihtiyaç her seferinde "satır adedi − (açık + tüketilmiş rezervasyon)" olarak hesaplanır.
 */

/** Rezervasyonu beklenen sipariş durumları (onaylanmış, henüz sevk edilmemiş). */
const OPEN_STATUSES = ["CONFIRMED", "IN_PRODUCTION", "PICKING"] as const;

/** Bir sipariş satırının hâlâ ayrılması gereken miktarı (açık + tüketilmiş rezervasyonlar düşülür). */
async function lineNeed(tx: Tx, line: { id: string; qty: number }): Promise<Prisma.Decimal> {
  const agg = await tx.stockReservation.aggregate({
    where: { orderLineId: line.id, releasedAt: null },
    _sum: { qty: true },
  });
  const covered = agg._sum.qty ?? new Prisma.Decimal(0);
  const need = new Prisma.Decimal(line.qty).minus(covered);
  return need.greaterThan(0) ? need : new Prisma.Decimal(0);
}

/** Siparişin tüm satırları için karşılanabilen kadar rezervasyon yapar; bir şey ayrıldıysa true. */
async function reserveForOrder(tx: Tx, orderId: string): Promise<boolean> {
  const lines = await tx.salesOrderLine.findMany({
    where: { orderId },
    select: { id: true, qty: true, product: { select: { itemId: true } } },
  });
  let reservedAny = false;
  for (const l of lines) {
    const need = await lineNeed(tx, l);
    if (need.lessThanOrEqualTo(0)) continue;
    const got = await reserveAvailableFefo(tx, {
      itemId: l.product.itemId,
      qty: need.toString(),
      refType: "SalesOrderLine",
      refId: l.id,
      orderLineId: l.id,
      note: "Sipariş rezervasyonu",
    });
    if (got.greaterThan(0)) reservedAny = true;
  }
  return reservedAny;
}

export const reserveOnOrderConfirmed: EventHandler<"order.confirmed"> = async (event, { prisma, log, eventId }) => {
  await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: event.orderId }, select: { status: true } });
    if (!order || !(OPEN_STATUSES as readonly string[]).includes(order.status)) return;
    const reserved = await reserveForOrder(tx, event.orderId);
    if (reserved) await emit(tx, { type: "stock.reserved", orderId: event.orderId });
    log.info({ eventId, orderId: event.orderId, reserved }, "order.confirmed → stok rezervasyonu");
  });
};

/** Stok gelince (giriş, kalite onayı, iade…) o kalemi bekleyen siparişlerin eksiklerini en eskiden başlayarak ayırır. */
export const backfillOnStockChanged: EventHandler<"stock.changed"> = async (event, { prisma, log, eventId }) => {
  const waiting = await prisma.salesOrderLine.findMany({
    where: { product: { itemId: event.itemId }, order: { status: { in: [...OPEN_STATUSES] } } },
    select: { orderId: true, order: { select: { createdAt: true } } },
    orderBy: { order: { createdAt: "asc" } },
  });
  const orderIds = [...new Set(waiting.map((w) => w.orderId))];
  for (const orderId of orderIds) {
    const reserved = await prisma.$transaction(async (tx) => {
      const got = await reserveForOrder(tx, orderId);
      if (got) await emit(tx, { type: "stock.reserved", orderId });
      return got;
    });
    if (reserved) log.info({ eventId, orderId, itemId: event.itemId }, "stock.changed → bekleyen sipariş tamamlandı");
  }
};

export const releaseOnOrderCancelled: EventHandler<"order.cancelled"> = async (event, { prisma, log, eventId }) => {
  await prisma.$transaction(async (tx) => {
    const open = await tx.stockReservation.findMany({
      where: { orderLine: { orderId: event.orderId }, releasedAt: null, consumedAt: null },
      select: { id: true },
    });
    for (const r of open) await releaseReservation(tx, r.id);
    if (open.length) log.info({ eventId, orderId: event.orderId, released: open.length }, "order.cancelled → rezervasyonlar stoğa bırakıldı");
  });
};

/** Sevkiyat: ayrılan stok SALE hareketiyle düşülür; sipariş PICKING üzerinden SHIPPED olur. */
export const shipOnShipmentCreated: EventHandler<"shipment.created"> = async (event, { prisma, log, eventId }) => {
  await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({
      where: { id: event.shipmentId },
      select: { id: true, orderId: true, order: { select: { status: true, number: true } } },
    });
    if (!shipment) return;
    const open = await tx.stockReservation.findMany({
      where: { orderLine: { orderId: shipment.orderId }, releasedAt: null, consumedAt: null },
      select: { id: true },
    });
    for (const r of open) await consumeReservation(tx, r.id, { type: "SALE", refType: "Shipment", refId: shipment.id });

    let status = shipment.order.status as OrderStatus;
    const path: OrderStatus[] = [];
    if (canTransition(status, "PICKING") && status !== "PICKING") {
      status = "PICKING";
      path.push(status);
    }
    if (canTransition(status, "SHIPPED")) {
      status = "SHIPPED";
      path.push(status);
    }
    if (path.length) {
      await tx.salesOrder.update({ where: { id: shipment.orderId }, data: { status } });
      await writeAudit(tx, {
        userId: null,
        action: "order.transition",
        entity: "SalesOrder",
        entityId: shipment.orderId,
        before: { status: shipment.order.status },
        after: { status, via: "shipment.created", path },
      });
    }
    log.info({ eventId, orderId: shipment.orderId, consumed: open.length, status }, "shipment.created → stok düşüldü, sipariş sevk edildi");
  });
};
