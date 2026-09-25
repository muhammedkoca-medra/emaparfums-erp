import { IntegrationError, type IntegrationAdapter, type IntegrationContext } from "../adapter.js";
import { invoke } from "../invoke.js";
import { TokenBucket } from "../rate-limit.js";

/**
 * ŞABLON — yeni bir entegrasyon eklerken bu klasörü `src/<kod-küçük-harf>/` olarak kopyalayın
 * (`/entegrasyon <KOD>`). Gerçek uç noktaları ve kimlik doğrulamayı sağlayıcının resmi
 * dokümantasyonundan alın; kaynağı README'ye yazın.
 */
export const TEMPLATE_CODE = "TEMPLATE";

/** HTTP durumunu hata sınıfına çevirir: 408/429/5xx geçici, diğer 4xx kalıcı. */
export function classifyHttpError(status: number, body: string): IntegrationError {
  const retryable = status === 408 || status === 429 || status >= 500;
  return new IntegrationError(`HTTP ${status}: ${body.slice(0, 200)}`, retryable, String(status));
}

export class TemplateAdapter implements IntegrationAdapter {
  readonly code = TEMPLATE_CODE;
  readonly kind = "MARKETPLACE" as const;
  // Sağlayıcı limitine göre ayarlanır (ör. saniyede 5 istek).
  private readonly bucket = new TokenBucket(5, 5);

  constructor(private readonly baseUrl = "https://api.example.invalid") {}

  async healthCheck(ctx: IntegrationContext) {
    await this.bucket.take();
    return invoke(ctx, "health.check", async () => {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${ctx.credentials.apiKey ?? ""}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw classifyHttpError(res.status, await res.text());
      return { ok: true };
    });
  }
}
