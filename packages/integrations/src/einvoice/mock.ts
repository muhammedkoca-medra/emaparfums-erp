import { randomUUID } from "node:crypto";
import { type EInvoiceCapabilities, type IntegrationAdapter, type IntegrationContext } from "../adapter.js";
import { invoke } from "../invoke.js";
import { EINVOICE_CODE } from "./index.js";

/**
 * Sahte e-belge entegratörü: ağa çıkmaz, numara/ETTN üretir (FTR-10 gerçek entegratörü taklit eder).
 * Mükellef sorgusu: 10 haneli VKN → e-Fatura mükellefi; 11 haneli TCKN veya boş → değil (e-Arşiv).
 */
export class EInvoiceMockAdapter implements IntegrationAdapter, EInvoiceCapabilities {
  readonly code = EINVOICE_CODE;
  readonly kind = "EINVOICE" as const;

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }

  isEInvoiceUser(ctx: IntegrationContext, taxNo: string) {
    return invoke(
      ctx,
      "einvoice.taxpayer_query",
      async () => /^\d{10}$/.test((taxNo ?? "").replace(/\D/g, "")),
      { delay: async () => {} },
    );
  }

  send(ctx: IntegrationContext, _doc: unknown) {
    return invoke(
      ctx,
      "einvoice.send",
      async () => {
        // Benzersiz numara (mock): yıl + zaman/rastgele tabanlı 9 hane. Gerçek entegratör kendi seri no'sunu verir.
        const serial = (Date.now() % 1_000_000) * 1000 + Math.floor(Math.random() * 1000);
        const number = `EMA${new Date().getFullYear()}${String(serial).padStart(9, "0").slice(-9)}`;
        return { number, ettn: randomUUID() };
      },
      { delay: async () => {} },
    );
  }

  status(ctx: IntegrationContext, _ettn: string) {
    return invoke(ctx, "einvoice.status", async () => "DELIVERED", { delay: async () => {} });
  }

  pullIncoming(ctx: IntegrationContext, _since: Date) {
    return invoke(ctx, "einvoice.pull_incoming", async () => [] as unknown[], { delay: async () => {} });
  }

  cancel(ctx: IntegrationContext, _ettn: string, _reason: string) {
    return invoke(ctx, "einvoice.cancel", async () => undefined, { delay: async () => {} });
  }

  pdf(ctx: IntegrationContext, ettn: string) {
    return invoke(
      ctx,
      "einvoice.pdf",
      async () => {
        // Küçük, geçerli bir PDF iskeleti (mock). Gerçek entegratör imzalı PDF döner.
        const text = `EMA Parfums e-Belge (mock)\nETTN: ${ettn}`;
        const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${text.length + 40}>>stream\nBT /F1 10 Tf 12 90 Td (${text.split("\n")[0]}) Tj 0 -16 Td (${text.split("\n")[1]}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
        return new TextEncoder().encode(pdf);
      },
      { delay: async () => {} },
    );
  }
}
