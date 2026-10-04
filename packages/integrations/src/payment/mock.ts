import { randomUUID } from "node:crypto";
import { type IntegrationAdapter, type IntegrationContext, type PaymentCapabilities } from "../adapter.js";
import { invoke } from "../invoke.js";

/**
 * Sahte ödeme adaptörü (iyzico/PayTR/Stripe/sanal POS): ağa çıkmaz, kart verisi görmez (kural 9).
 * Gerçek adaptör sağlayıcı sözleşmesi ve anahtarlarla gelene kadar tahsilat/iade yerelde sentezlenir.
 */
export class PaymentMockAdapter implements IntegrationAdapter, PaymentCapabilities {
  readonly kind = "PAYMENT" as const;
  constructor(readonly code: string) {}

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }
  charge(ctx: IntegrationContext, _req: unknown) {
    return invoke(ctx, "payment.charge", async () => ({ externalTxId: `${this.code.toLowerCase()}_${randomUUID().slice(0, 12)}`, status: "CAPTURED" }), {
      delay: async () => {},
    });
  }
  refund(ctx: IntegrationContext, externalTxId: string, amount: string) {
    return invoke(ctx, "payment.refund", async () => undefined, { delay: async () => {}, request: { externalTxId, amount } });
  }
  installmentOptions(ctx: IntegrationContext, _bin: string, _amount: string) {
    return invoke(ctx, "payment.installments", async () => [] as unknown[], { delay: async () => {} });
  }
}
