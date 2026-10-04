import { notifyCustomer } from "./notify.js";
import { type EventHandler } from "./index.js";

/** order.confirmed → müşteriye işlem bildirimi (SMS). */
export const notifyOrderConfirmed: EventHandler<"order.confirmed"> = async (event, { prisma }) => {
  const order = await prisma.salesOrder.findUnique({ where: { id: event.orderId }, select: { customerId: true, number: true } });
  if (!order?.customerId) return;
  await notifyCustomer(prisma, {
    customerId: order.customerId,
    channel: "SMS",
    purpose: "TRANSACTIONAL",
    template: "order.confirmed",
    body: `Siparişiniz onaylandı: ${order.number}. EMA Parfums`,
    refType: "SalesOrder",
    refId: event.orderId,
  });
};

const SHIP_MSG: Record<string, string> = {
  SHIPPED: "Siparişiniz kargoya verildi",
  OUT_FOR_DELIVERY: "Siparişiniz dağıtımda",
  DELIVERED: "Siparişiniz teslim edildi",
  DELAYED: "Kargonuzda gecikme oluştu",
};

/** shipment.status_changed → önemli durumlarda müşteriye bildirim. */
export const notifyShipmentStatus: EventHandler<"shipment.status_changed"> = async (event, { prisma }) => {
  const msg = SHIP_MSG[event.status];
  if (!msg) return;
  const shipment = await prisma.shipment.findUnique({
    where: { id: event.shipmentId },
    select: { trackingNo: true, order: { select: { customerId: true, number: true } } },
  });
  if (!shipment?.order?.customerId) return;
  await notifyCustomer(prisma, {
    customerId: shipment.order.customerId,
    channel: "SMS",
    purpose: "TRANSACTIONAL",
    template: `shipment.${event.status}`,
    body: `${msg}. Takip: ${shipment.trackingNo ?? "-"}. EMA Parfums`,
    refType: "Shipment",
    refId: event.shipmentId,
  });
};

/** payment.failed → müşteriye "ödeme alınamadı, tekrar deneyin" bildirimi (sipariş PAYMENT_PENDING kalır). */
export const notifyPaymentFailed: EventHandler<"payment.failed"> = async (event, { prisma }) => {
  if (!event.orderId) return;
  const order = await prisma.salesOrder.findUnique({ where: { id: event.orderId }, select: { customerId: true, number: true, status: true } });
  if (!order?.customerId || order.status !== "PAYMENT_PENDING") return;
  await notifyCustomer(prisma, {
    customerId: order.customerId,
    channel: "SMS",
    purpose: "TRANSACTIONAL",
    template: "payment.failed",
    body: `Siparişiniz ${order.number} için ödeme alınamadı. Lütfen tekrar deneyin. EMA Parfums`,
    refType: "Payment",
    refId: event.paymentId,
  });
};
