import { type FxCapabilities, type IntegrationAdapter, type IntegrationContext } from "../adapter.js";
import { invoke } from "../invoke.js";

/** Sahte TCMB kur adaptörü: ağa çıkmaz, gün içi küçük oynamayla kur döner. */
export class FxMockAdapter implements IntegrationAdapter, FxCapabilities {
  readonly code = "FX_TCMB";
  readonly kind = "FX" as const;

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }

  latestRates(ctx: IntegrationContext) {
    return invoke(
      ctx,
      "fx.latest",
      async () => {
        const jitter = () => 1 + (Math.random() - 0.5) * 0.01; // ±%0.5
        return {
          USD: (34.0 * jitter()).toFixed(4),
          EUR: (37.0 * jitter()).toFixed(4),
          GBP: (43.0 * jitter()).toFixed(4),
        } as Record<string, string>;
      },
      { delay: async () => {} },
    );
  }
}
