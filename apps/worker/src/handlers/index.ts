import { type Db } from "@atelier/db";
import { type DomainEvent, type DomainEventType } from "@atelier/shared";
import { type Logger } from "pino";
import { notifyOrderConfirmed, notifyShipmentStatus } from "./notifications.js";
import { earnLoyaltyOnOrderConfirmed, reverseLoyaltyOnOrderCancelled } from "./loyalty.js";
import { backfillOnStockChanged, releaseOnOrderCancelled, reserveOnOrderConfirmed, shipOnShipmentCreated } from "./order-stock.js";
import { orderConfirmed } from "./order-confirmed.js";
import { paymentCaptured } from "./payment-captured.js";
import { deactivateOnComplianceChanged, inspectOnBatchCompleted, inspectOnLotReceived, releaseBatchOnLotReleased } from "./quality.js";
import { systemPing } from "./system-ping.js";

/**
 * Olay işleyicileri. Dinleyenler docs/02-veri-modeli.md#olaylar tablosundaki "Dinleyenler"
 * sütununa göre eklenir. Her işleyici idempotent olmalıdır (en az bir kez teslim).
 */
export interface HandlerDeps {
  prisma: Db;
  log: Logger;
}

export type EventHandler<T extends DomainEventType = DomainEventType> = (
  event: Extract<DomainEvent, { type: T }>,
  deps: HandlerDeps & { eventId: string },
) => Promise<void>;

export type HandlerMap = { [T in DomainEventType]?: { name: string; handle: EventHandler<T> }[] };

export const handlers: HandlerMap = {
  "system.ping": [{ name: "system.log-ping", handle: systemPing }],
  "payment.captured": [{ name: "order.confirm-on-payment", handle: paymentCaptured }],
  "order.confirmed": [
    { name: "stock.reserve-on-confirm", handle: reserveOnOrderConfirmed },
    { name: "invoice.issue-on-confirm", handle: orderConfirmed },
    { name: "notify.order-confirmed", handle: notifyOrderConfirmed },
    { name: "loyalty.earn-on-confirm", handle: earnLoyaltyOnOrderConfirmed },
  ],
  "order.cancelled": [
    { name: "stock.release-on-cancel", handle: releaseOnOrderCancelled },
    { name: "loyalty.reverse-on-cancel", handle: reverseLoyaltyOnOrderCancelled },
  ],
  "stock.changed": [{ name: "stock.backfill-waiting-orders", handle: backfillOnStockChanged }],
  "shipment.created": [{ name: "stock.consume-on-shipment", handle: shipOnShipmentCreated }],
  "shipment.status_changed": [{ name: "notify.shipment-status", handle: notifyShipmentStatus }],
  "lot.received": [{ name: "quality.inspect-on-receipt", handle: inspectOnLotReceived }],
  "batch.completed": [{ name: "quality.inspect-on-batch", handle: inspectOnBatchCompleted }],
  "lot.released": [{ name: "production.release-batch-on-lot", handle: releaseBatchOnLotReleased }],
  "compliance.changed": [{ name: "marketplace.deactivate-on-lock", handle: deactivateOnComplianceChanged }],
};
