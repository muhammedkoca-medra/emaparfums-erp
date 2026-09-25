import path from "node:path";
import { createPrismaClient } from "@atelier/db";
import { maskDeep } from "@atelier/shared";
import { config as loadEnv } from "dotenv";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { startEventWorker } from "./event-worker.js";
import { handlers } from "./handlers/index.js";
import { startDispatcher } from "./outbox-dispatcher.js";
import { createQueues, redisConnection } from "./queues.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const config = loadConfig();
const log = pino({
  level: config.LOG_LEVEL,
  base: { service: "worker" },
  formatters: { log: (obj) => maskDeep(obj) },
  ...(config.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { singleLine: true, translateTime: "HH:MM:ss" } } }
    : {}),
});

const prisma = createPrismaClient(config.DATABASE_URL);
const connection = redisConnection(config.REDIS_URL);
const queues = createQueues(connection, config.QUEUE_PREFIX);

const worker = startEventWorker({
  connection,
  prefix: config.QUEUE_PREFIX,
  prisma,
  log,
  dlq: queues.dlq,
  handlers,
});
const dispatcher = startDispatcher(prisma, queues.events, log, {
  batchSize: config.OUTBOX_BATCH_SIZE,
  maxAttempts: config.OUTBOX_MAX_ATTEMPTS,
  jobAttempts: config.EVENT_JOB_ATTEMPTS,
  jobBackoffMs: config.EVENT_JOB_BACKOFF_MS,
  pollMs: config.OUTBOX_POLL_MS,
});

log.info({ pollMs: config.OUTBOX_POLL_MS }, "worker hazır · outbox-dispatcher ve olay işleyici çalışıyor");

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info({ signal }, "worker kapanıyor");
  await dispatcher.stop();
  await worker.close();
  await Promise.all([queues.events.close(), queues.dlq.close()]);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
