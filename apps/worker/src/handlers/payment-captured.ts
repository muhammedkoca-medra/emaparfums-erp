import { emit } from "@atelier/db";
import { canTransition, type OrderStatus } from "@atelier/shared";
import { type EventHandler } from "./index.js";

/**
 * payment.captured → siparişi onaylar (satis.md "Dinler: payment.captured → siparişi onaylar").
 * Idempotent: sipariş zaten ileri durumdaysa dokunmaz. NEW/PAYMENT_PENDING → CONFIRMED.
 */
export const paymentCaptured: EventHandler<"payment.captured"> = async (event, { prisma, log, eventId }) => {
  if (!event.orderId) return;
  const order = await prisma.salesOrder.findUnique({ where: { id: event.orderId }, select: { id: true, status: true, number: true } });
  if (!order) return;
  if (!canTransition(order.status as OrderStatus, "CONFIRMED")) {
    log.debug({ eventId, orderId: order.id, status: order.status }, "payment.captured: sipariş onaya uygun değil");
    return;
  }
  await prisma.$transaction(async (tx) => {
    // Yarış durumunu önle: FOR UPDATE ile yeniden oku.
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "SalesOrder" WHERE id = ${order.id} FOR UPDATE`;
    if (!rows[0] || !canTransition(rows[0].status as OrderStatus, "CONFIRMED")) return;
    await tx.salesOrder.update({ where: { id: order.id }, data: { status: "CONFIRMED" } });
    await emit(tx, { type: "order.confirmed", orderId: order.id });
  });
  log.info({ eventId, orderId: order.id, number: order.number }, "payment.captured → sipariş CONFIRMED");
};
