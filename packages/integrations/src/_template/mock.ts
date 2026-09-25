import { IntegrationError, type IntegrationAdapter, type IntegrationContext } from "../adapter.js";
import { invoke } from "../invoke.js";
import { TEMPLATE_CODE } from "./index.js";

/**
 * Sahte adaptör: anahtar yokken ve testlerde kullanılır; ağa çıkmaz.
 * `failures` ile belirli sayıda geçici hata üretip yeniden deneme davranışı test edilebilir.
 */
export class TemplateMockAdapter implements IntegrationAdapter {
  readonly code = TEMPLATE_CODE;
  readonly kind = "MARKETPLACE" as const;
  calls = 0;

  constructor(private failures = 0) {}

  healthCheck(ctx: IntegrationContext) {
    return invoke(
      ctx,
      "health.check",
      async () => {
        this.calls++;
        if (this.failures > 0) {
          this.failures--;
          throw new IntegrationError("sahte zaman aşımı", true, "TIMEOUT");
        }
        return { ok: true, message: "mock" };
      },
      { delay: async () => {} },
    );
  }
}
