import { type Db } from "@atelier/db";
import { type DomainEvent, type DomainEventType } from "@atelier/shared";
import { type Logger } from "pino";
import { notifyOrderConfirmed, notifyShipmentStatus } from "./notifications.js";
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
    { name: "invoice.issue-on-confirm", handle: orderConfirmed },
    { name: "notify.order-confirmed", handle: notifyOrderConfirmed },
  ],
  "shipment.status_changed": [{ name: "notify.shipment-status", handle: notifyShipmentStatus }],
  "lot.received": [{ name: "quality.inspect-on-receipt", handle: inspectOnLotReceived }],
  "batch.completed": [{ name: "quality.inspect-on-batch", handle: inspectOnBatchCompleted }],
  "lot.released": [{ name: "production.release-batch-on-lot", handle: releaseBatchOnLotReleased }],
  "compliance.changed": [{ name: "marketplace.deactivate-on-lock", handle: deactivateOnComplianceChanged }],
};
