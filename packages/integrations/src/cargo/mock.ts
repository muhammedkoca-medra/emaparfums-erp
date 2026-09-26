import { type CargoCapabilities, type IntegrationAdapter, type IntegrationContext } from "../adapter.js";
import { invoke } from "../invoke.js";

/** Sahte kargo adaptörü: takip no üretir, durum ilerletir. Ağa çıkmaz. */
export class CargoMockAdapter implements IntegrationAdapter, CargoCapabilities {
  readonly kind = "CARGO" as const;
  constructor(readonly code: string) {}

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }

  createShipment(ctx: IntegrationContext, _req: unknown) {
    return invoke(
      ctx,
      "cargo.create_shipment",
      async () => {
        const trackingNo = `${this.code.replace(/^CARGO_/, "").slice(0, 3)}${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 100)}`;
        const label = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 160]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 90>>stream\nBT /F1 12 Tf 14 130 Td (EMA Parfums Kargo Etiketi) Tj 0 -20 Td (${trackingNo}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
        return { trackingNo, labelPdf: new TextEncoder().encode(label) };
      },
      { delay: async () => {} },
    );
  }

  track(ctx: IntegrationContext, trackingNo: string) {
    return invoke(
      ctx,
      "cargo.track",
      async () => ({
        status: "IN_TRANSIT",
        events: [{ status: "IN_TRANSIT", occurredAt: new Date().toISOString(), location: "Transfer Merkezi", ref: trackingNo }],
      }),
      { delay: async () => {} },
    );
  }

  cancel(ctx: IntegrationContext, _trackingNo: string) {
    return invoke(ctx, "cargo.cancel", async () => undefined, { delay: async () => {} });
  }
}
