import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Outbox tarama aralığı (ms). */
  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  /** Kuyruğa aktarılamayan olay bu kadar denemeden sonra FAILED olur. */
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
  /** Olay işleyicisi deneme sayısı; sonra ölü mektup kuyruğu (docs/04: en fazla 6). */
  EVENT_JOB_ATTEMPTS: z.coerce.number().int().positive().default(6),
  EVENT_JOB_BACKOFF_MS: z.coerce.number().int().nonnegative().default(1000),
  /** Kuyruk adı öneki (testler kendi önekini kullanır). */
  QUEUE_PREFIX: z.string().default("atelier"),
  /** Verilirse GET /health yanıtlayan küçük bir HTTP sunucusu açılır (izleme, e2e testleri). */
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().optional(),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Worker yapılandırması geçersiz (pnpm bootstrap):\n${lines}`);
  }
  return parsed.data;
}
