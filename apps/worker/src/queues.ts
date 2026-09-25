import { type ConnectionOptions, Queue } from "bullmq";
import { type DomainEvent } from "@atelier/shared";

/** Modüller arası olayların kuyruğu ve ölü mektup kuyruğu. */
export const EVENTS_QUEUE = "domain-events";
export const EVENTS_DLQ = "domain-events-dlq";

export interface EventJobData {
  eventId: string;
  type: DomainEvent["type"];
  payload: DomainEvent;
  createdAt: string;
}

export interface DeadLetterData extends EventJobData {
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    // BullMQ Worker bağlantısı için zorunlu
    maxRetriesPerRequest: null,
  };
}

export function createQueues(connection: ConnectionOptions, prefix: string) {
  return {
    events: new Queue<EventJobData>(EVENTS_QUEUE, { connection, prefix }),
    dlq: new Queue<DeadLetterData>(EVENTS_DLQ, { connection, prefix }),
  };
}
