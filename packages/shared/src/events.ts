/**
 * Modüller arası olay sözleşmesi. Liste docs/02-veri-modeli.md#olaylar ile birebir aynı olmalı.
 * Yeni olay: önce doküman, sonra buraya tip.
 */
export type DomainEvent =
  | { type: "order.created"; orderId: string; channelCode: string }
  | { type: "order.confirmed"; orderId: string }
  | { type: "order.cancelled"; orderId: string }
  | { type: "payment.captured"; paymentId: string; orderId?: string }
  | { type: "payment.failed"; paymentId: string; orderId?: string }
  | { type: "stock.reserved"; orderId: string }
  | { type: "stock.below_min"; itemId: string; available: string }
  | { type: "stock.changed"; itemId: string }
  | { type: "lot.received"; lotId: string }
  | { type: "lot.released"; lotId: string }
  | { type: "lot.quarantined"; lotId: string; reason: string }
  | { type: "batch.stage_changed"; batchId: string; stage: string }
  | { type: "batch.completed"; batchId: string; outputLotId: string }
  | { type: "requisition.created"; requisitionId: string; source: "MRP" | "MANUAL" }
  | { type: "po.approved"; purchaseOrderId: string }
  | { type: "invoice.issued"; invoiceId: string }
  | { type: "invoice.failed"; invoiceId: string; error: string }
  | { type: "invoice.purchase_received"; invoiceId: string }
  | { type: "shipment.created"; shipmentId: string }
  | { type: "shipment.status_changed"; shipmentId: string; status: string }
  | { type: "shipment.delayed"; shipmentId: string }
  | { type: "return.requested"; returnId: string }
  | { type: "product.updated"; productId: string; fields: string[] }
  | { type: "price.changed"; productId: string; channelCode?: string }
  | { type: "compliance.changed"; productId: string }
  | { type: "quiz.completed"; quizId: string; customerId?: string }
  | { type: "post.published"; postId: string }
  | { type: "subscription.renewed"; subscriptionId: string }
  | { type: "tax_rule.changed"; taxRuleId: string }
  | { type: "system.ping"; pingId: string; requestedById: string };

export type DomainEventType = DomainEvent["type"];

/** docs/02-veri-modeli.md#olaylar tablosundaki olay adları (çalışma zamanında doğrulama için). */
export const DOMAIN_EVENT_TYPES = [
  "order.created",
  "order.confirmed",
  "order.cancelled",
  "payment.captured",
  "payment.failed",
  "stock.reserved",
  "stock.below_min",
  "stock.changed",
  "lot.received",
  "lot.released",
  "lot.quarantined",
  "batch.stage_changed",
  "batch.completed",
  "requisition.created",
  "po.approved",
  "invoice.issued",
  "invoice.failed",
  "invoice.purchase_received",
  "shipment.created",
  "shipment.status_changed",
  "shipment.delayed",
  "return.requested",
  "product.updated",
  "price.changed",
  "compliance.changed",
  "quiz.completed",
  "post.published",
  "subscription.renewed",
  "tax_rule.changed",
  "system.ping",
] as const satisfies readonly DomainEventType[];

// Liste ile birleşim tipi arasında eksik varsa derleme hatası verir.
type _MissingFromList = Exclude<DomainEventType, (typeof DOMAIN_EVENT_TYPES)[number]>;
const _exhaustive: [_MissingFromList] extends [never] ? true : _MissingFromList = true;
void _exhaustive;
