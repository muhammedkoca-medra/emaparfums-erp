import { maskDeep } from "@atelier/shared";
import { IntegrationError, type IntegrationContext } from "./adapter.js";

/**
 * Dış sistem çağrılarının ortak sarmalayıcısı (docs/04-entegrasyonlar.md §Ortak gereksinimler):
 *  - her deneme ctx.log ile IntegrationLog'a yazılır (istek/yanıt maskelenmiş),
 *  - geçici hatalar (IntegrationError.retryable) üstel geri çekilmeyle en fazla 6 kez denenir,
 *  - kalıcı hata ilk seferde yukarı fırlatılır.
 *
 * Adaptör içinde kullanım:
 *   return invoke(ctx, "orders.pull", () => http.get(...), { request: { since } });
 */

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 6, baseDelayMs: 500, maxDelayMs: 60_000 };

/** Üstel geri çekilme + tam rastgele sapma (aynı anda yeniden deneme yığılmasını önler). */
export function backoffDelay(attempt: number, policy: RetryPolicy, random = Math.random): number {
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * cap);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface InvokeOptions<T> {
  request?: unknown;
  retry?: Partial<RetryPolicy>;
  /** Yanıttan loga yazılacak özet (varsayılan: yanıtın kendisi). */
  summarize?: (result: T) => unknown;
  /** Testlerde beklemeyi atlamak için. */
  delay?: (ms: number) => Promise<void>;
}

export async function invoke<T>(
  ctx: Pick<IntegrationContext, "log">,
  operation: string,
  fn: () => Promise<T>,
  opts: InvokeOptions<T> = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY, ...opts.retry };
  const wait = opts.delay ?? sleep;

  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const result = await fn();
      await ctx.log({
        operation,
        status: "OK",
        request: opts.request,
        response: opts.summarize ? opts.summarize(result) : result,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (err) {
      const e = err instanceof IntegrationError ? err : new IntegrationError(String(err), false);
      const willRetry = e.retryable && attempt < policy.maxAttempts;
      await ctx.log({
        operation,
        status: willRetry ? "RETRY" : "ERROR",
        request: opts.request,
        response: { error: e.message, providerCode: e.providerCode, attempt },
        durationMs: Date.now() - started,
      });
      if (!willRetry) throw e;
      await wait(backoffDelay(attempt, policy));
    }
  }
}

/** IntegrationLog satırı (kalıcı hedefe yazılan biçim). */
export interface IntegrationLogEntry {
  integrationId: string;
  direction: "IN" | "OUT";
  operation: string;
  status: "OK" | "ERROR" | "RETRY";
  request?: unknown;
  response?: unknown;
  durationMs?: number;
}

/** Log hedefi. Veritabanı uygulaması: `@atelier/db` → `integrationLogSink(prisma)`. */
export interface IntegrationLogSink {
  write(entry: IntegrationLogEntry): Promise<void>;
}

/** Testler ve anahtarsız geliştirme için bellek içi hedef. */
export class MemoryLogSink implements IntegrationLogSink {
  readonly entries: IntegrationLogEntry[] = [];
  async write(entry: IntegrationLogEntry) {
    this.entries.push(entry);
  }
}

/**
 * Adaptöre verilecek bağlamı kurar. Log'a giden istek ve yanıt burada maskelenir; kimlik bilgileri
 * hiçbir koşulda loga yazılmaz.
 */
export function buildContext(input: {
  integrationId: string;
  credentials: Record<string, string>;
  settings?: Record<string, unknown>;
  sink: IntegrationLogSink;
  direction?: "IN" | "OUT";
}): IntegrationContext {
  return {
    integrationId: input.integrationId,
    credentials: input.credentials,
    settings: input.settings ?? {},
    log: (entry) =>
      input.sink.write({
        integrationId: input.integrationId,
        direction: input.direction ?? "OUT",
        operation: entry.operation,
        status: entry.status,
        request: maskDeep(entry.request),
        response: maskDeep(entry.response),
        durationMs: entry.durationMs,
      }),
  };
}
