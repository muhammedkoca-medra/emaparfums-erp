import { createHash } from "node:crypto";
import { type EmbeddingsCapabilities, type IntegrationAdapter, type IntegrationContext } from "../adapter.js";
import { invoke } from "../invoke.js";

/** Sahte gömme (embeddings) adaptörü: ağa çıkmaz, metinden deterministik yerel vektör üretir (F5-09). */
export class EmbeddingsMockAdapter implements IntegrationAdapter, EmbeddingsCapabilities {
  readonly kind = "AI" as const;
  readonly code = "EMBEDDINGS";

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }
  embed(ctx: IntegrationContext, text: string) {
    return invoke(
      ctx,
      "ai.embed",
      async () => {
        // Deterministik 16 boyutlu vektör: metnin hash baytlarından 0–1 arası.
        const h = createHash("sha256").update(text).digest();
        return Array.from({ length: 16 }, (_, i) => h[i]! / 255);
      },
      { delay: async () => {} },
    );
  }
}
