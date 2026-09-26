import { createHmac } from "node:crypto";
import { type PaymentWebhookPayload } from "../payment.js";

/** Webhook imzası: HMAC-SHA256(kanonik yük, gizli anahtar). İki taraf aynı kanonik biçimi üretir (ODM-04). */
export function paymentWebhookSignature(secret: string, payload: PaymentWebhookPayload): string {
  const canonical = `${payload.externalTxId}|${payload.outcome}|${payload.failureCode ?? ""}`;
  return createHmac("sha256", secret).update(canonical).digest("hex");
}
