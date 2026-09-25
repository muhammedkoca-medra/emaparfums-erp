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
  | { type: "tax_rule.changed"; taxRuleId: string };

export type DomainEventType = DomainEvent["type"];
