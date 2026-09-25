import { z } from "zod";

/** Ortam değişkenleri tek yerde doğrulanır; eksik/hatalı değerde uygulama açılmaz. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(8),
  DEVICE_SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  TOTP_ISSUER: z.string().default("Atelier"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET en az 32 karakter olmalı"),
  PII_ENC_KEYS: z.string().min(1),
  PII_ENC_ACTIVE_KEY: z.string().min(1),
  PII_HASH_KEY: z.string().min(1),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ortam yapılandırması geçersiz (pnpm bootstrap):\n${lines}`);
  }
  return parsed.data;
}

/** DI belirteci: `constructor(@Inject(APP_CONFIG) cfg: AppConfig)`. */
export const APP_CONFIG = Symbol("APP_CONFIG");
