import { createHmac, timingSafeEqual } from "node:crypto";
import { type EInvoiceWebhookPayload } from "../invoice.js";

/**
 * e-Belge webhook imzası: HMAC-SHA256(kanonik yük, gizli anahtar) (FTR, mevzuat-denetçisi bulgusu #1).
 * Ödeme webhook'u ile aynı desen: entegratör ve API aynı kanonik biçimi üretir, imzasız/yanlış imzalı
 * istek reddedilir; böylece ETTN'i bilen biri fatura durumunu (CANCELLED/ACCEPTED…) sahtelenemez.
 */
export function einvoiceWebhookSignature(secret: string, payload: EInvoiceWebhookPayload): string {
  const canonical = `${payload.ettn}|${payload.status}`;
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

/** Sabit zamanlı imza karşılaştırması (zamanlama sızıntısına karşı). */
export function verifyEinvoiceSignature(secret: string, payload: EInvoiceWebhookPayload, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = einvoiceWebhookSignature(secret, payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
