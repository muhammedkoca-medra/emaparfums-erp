/**
 * Kimlik bilgisi çözümleyici. Veritabanında yalnızca `Integration.credentialsRef` durur
 * (CLAUDE.md kural 8). Yerel geliştirmede referans ortam değişkenlerine işaret eder:
 *
 *   credentialsRef = "env:TRENDYOL"
 *   .env: INTEGRATION_TRENDYOL_API_KEY=… , INTEGRATION_TRENDYOL_API_SECRET=…
 *   → { apiKey: "…", apiSecret: "…" }
 *
 * Üretimde "vault:<yol>" gibi başka kaynaklar eklenecek (ADR-0002 barındırma kararıyla).
 */
export function resolveCredentials(
  credentialsRef: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (!credentialsRef) return {};
  const [scheme, name] = credentialsRef.split(":", 2);
  if (scheme !== "env" || !name || !/^[A-Z0-9_]+$/.test(name)) {
    throw new Error(`Desteklenmeyen kimlik bilgisi referansı: ${credentialsRef}`);
  }
  const prefix = `INTEGRATION_${name}_`;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix) || !value) continue;
    // API_KEY → apiKey
    const field = key
      .slice(prefix.length)
      .toLowerCase()
      .replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    out[field] = value;
  }
  return out;
}
