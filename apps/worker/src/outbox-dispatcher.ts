import { type Db } from "@atelier/db";
import { type DomainEvent } from "@atelier/shared";
import { type Queue } from "bullmq";
import { type Logger } from "pino";
import { type EventJobData } from "./queues.js";

/**
 * Transactional outbox → BullMQ (docs/01-mimari.md §İlkeler 2).
 *  - PENDING olaylar `FOR UPDATE SKIP LOCKED` ile kilitlenir: birden çok worker aynı olayı almaz.
 *  - Kuyruğa olay kimliği jobId olarak eklenir; tekrar aktarımda kuyruk yinelenen işi yok sayar.
 *  - En az bir kez teslim: işleyiciler idempotent olmalıdır.
 */
export interface DispatchOptions {
  batchSize: number;
  maxAttempts: number;
  jobAttempts: number;
  jobBackoffMs: number;
}

interface OutboxRow {
  id: string;
  type: string;
  payload: DomainEvent;
  attempts: number;
  createdAt: Date;
}

export async function dispatchBatch(
  prisma: Db,
  queue: Queue<EventJobData>,
  log: Logger,
  opts: DispatchOptions,
): Promise<{ dispatched: number; failed: number }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, type, payload, attempts, "createdAt"
      FROM "OutboxEvent"
      WHERE status = 'PENDING'
      ORDER BY "createdAt"
      LIMIT ${opts.batchSize}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return { dispatched: 0, failed: 0 };

    const ok: string[] = [];
    let failed = 0;
    for (const row of rows) {
      try {
        await queue.add(
          row.type,
          {
            eventId: row.id,
            type: row.type as DomainEvent["type"],
            payload: row.payload,
            createdAt: row.createdAt.toISOString(),
          },
          {
            jobId: row.id,
            attempts: opts.jobAttempts,
            backoff: { type: "exponential", delay: opts.jobBackoffMs },
            removeOnComplete: { age: 24 * 3600, count: 10_000 },
            removeOnFail: false,
          },
        );
        ok.push(row.id);
      } catch (err) {
        const attempts = row.attempts + 1;
        const giveUp = attempts >= opts.maxAttempts;
        if (giveUp) failed++;
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: { attempts, status: giveUp ? "FAILED" : "PENDING" },
        });
        log.error({ err, eventId: row.id, type: row.type, attempts }, "outbox: kuyruğa aktarılamadı");
      }
    }
    if (ok.length) {
      await tx.outboxEvent.updateMany({
        where: { id: { in: ok } },
        data: { status: "DISPATCHED", dispatchedAt: new Date() },
      });
      log.debug({ count: ok.length }, "outbox: olaylar kuyruğa aktarıldı");
    }
    return { dispatched: ok.length, failed };
  });
}

/** Periyodik tarama döngüsü; stop() çağrılınca mevcut tur bitince durur. */
export function startDispatcher(
  prisma: Db,
  queue: Queue<EventJobData>,
  log: Logger,
  opts: DispatchOptions & { pollMs: number },
) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = async () => {
    if (stopped) return;
    try {
      // Birikme varsa bekleme olmadan tekrar tara
      let r;
      do {
        r = await dispatchBatch(prisma, queue, log, opts);
      } while (!stopped && r.dispatched === opts.batchSize);
    } catch (err) {
      log.error({ err }, "outbox: tarama hatası");
    }
    if (!stopped) timer = setTimeout(() => (running = tick()), opts.pollMs);
  };
  running = tick();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
