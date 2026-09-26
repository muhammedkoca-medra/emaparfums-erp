import { type Db } from "@atelier/db";
import { type DomainEvent, type DomainEventType } from "@atelier/shared";
import { type Logger } from "pino";
import { orderConfirmed } from "./order-confirmed.js";
import { paymentCaptured } from "./payment-captured.js";
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
  "order.confirmed": [{ name: "invoice.issue-on-confirm", handle: orderConfirmed }],
};
