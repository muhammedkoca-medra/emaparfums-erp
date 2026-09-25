import { checkConsistency, type Db } from "@atelier/db";
import { type ConnectionOptions, Queue, Worker } from "bullmq";
import { type Logger } from "pino";

/**
 * Zamanlanmış işler (docs/03-moduller/stok.md STK-10 ve sonraki fazlardaki gece işleri).
 * BullMQ iş zamanlayıcısı: birden çok worker çalışsa da iş tek kez tetiklenir.
 */
export const SCHEDULED_QUEUE = "scheduled";

export const SCHEDULES = [
  // STK-10: her gece 03:00 (İstanbul) stok tutarlılık kontrolü
  { id: "stock-consistency", pattern: "0 3 * * *" },
] as const;

export type ScheduledJobName = (typeof SCHEDULES)[number]["id"];

/** STK-10: hareket toplamları ile bakiyeleri karşılaştırır; fark varsa alarm logu yazar. */
export async function runStockConsistency(prisma: Db, log: Logger) {
  const mismatches = await checkConsistency(prisma);
  if (mismatches.length > 0) {
    log.error(
      { job: "stock-consistency", count: mismatches.length, mismatches: mismatches.slice(0, 50) },
      "ALARM: stok bakiyesi hareketlerle tutarsız",
    );
  } else {
    log.info({ job: "stock-consistency" }, "stok tutarlılık kontrolü: fark yok");
  }
  return mismatches;
}

export async function startScheduler(input: {
  connection: ConnectionOptions;
  prefix: string;
  prisma: Db;
  log: Logger;
}) {
  const queue = new Queue(SCHEDULED_QUEUE, { connection: input.connection, prefix: input.prefix });
  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(s.id, { pattern: s.pattern, tz: "Europe/Istanbul" }, { name: s.id });
  }
  const worker = new Worker(
    SCHEDULED_QUEUE,
    async (job) => {
      switch (job.name as ScheduledJobName) {
        case "stock-consistency":
          return { mismatches: (await runStockConsistency(input.prisma, input.log)).length };
        default:
          input.log.warn({ job: job.name }, "bilinmeyen zamanlanmış iş");
      }
    },
    { connection: input.connection, prefix: input.prefix, concurrency: 1 },
  );
  worker.on("failed", (job, err) =>
    input.log.error({ job: job?.name, err: err.message }, "zamanlanmış iş başarısız"),
  );
  return { queue, worker };
}
