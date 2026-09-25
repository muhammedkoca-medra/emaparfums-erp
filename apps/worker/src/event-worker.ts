import { type Db } from "@atelier/db";
import { type ConnectionOptions, type Queue, Worker } from "bullmq";
import { type Logger } from "pino";
import { type HandlerMap } from "./handlers/index.js";
import { type DeadLetterData, EVENTS_QUEUE, type EventJobData } from "./queues.js";

/**
 * Olay işleyici: kuyruktaki her olay için kayıtlı dinleyicileri sırayla çalıştırır.
 * Hata olursa BullMQ üstel geri çekilmeyle yeniden dener; son denemede de başarısız olan iş
 * ölü mektup kuyruğuna (DLQ) kopyalanır ve alarm logu yazılır.
 */
export function startEventWorker(input: {
  connection: ConnectionOptions;
  prefix: string;
  prisma: Db;
  log: Logger;
  dlq: Queue<DeadLetterData>;
  handlers: HandlerMap;
  concurrency?: number;
}) {
  const { prisma, log, dlq, handlers } = input;

  const worker = new Worker<EventJobData>(
    EVENTS_QUEUE,
    async (job) => {
      const listeners = (handlers[job.data.type] ?? []) as {
        name: string;
        handle: (e: unknown, d: unknown) => Promise<void>;
      }[];
      if (listeners.length === 0) {
        log.debug({ eventId: job.data.eventId, type: job.data.type }, "olay: dinleyici yok");
        return;
      }
      for (const l of listeners) {
        const jobLog = log.child({
          eventId: job.data.eventId,
          type: job.data.type,
          handler: l.name,
          attempt: job.attemptsMade + 1,
        });
        await l.handle(job.data.payload, { prisma, log: jobLog, eventId: job.data.eventId });
      }
    },
    { connection: input.connection, prefix: input.prefix, concurrency: input.concurrency ?? 5 },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const final = job.attemptsMade >= (job.opts.attempts ?? 1);
    log.warn(
      { eventId: job.data.eventId, type: job.data.type, attemptsMade: job.attemptsMade, err: err.message },
      "olay işlenemedi",
    );
    if (!final) return;
    await dlq.add(
      job.data.type,
      {
        ...job.data,
        failedReason: err.message,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
      },
      { jobId: job.data.eventId, removeOnComplete: false, removeOnFail: false },
    );
    // Alarm: ölü mektup kuyruğuna düşen olay (docs/01 §Gözlemlenebilirlik)
    log.error(
      { eventId: job.data.eventId, type: job.data.type, err: err.message },
      "ALARM: olay ölü mektup kuyruğuna taşındı",
    );
  });

  worker.on("error", (err) => log.error({ err }, "olay işleyici hatası"));
  return worker;
}
