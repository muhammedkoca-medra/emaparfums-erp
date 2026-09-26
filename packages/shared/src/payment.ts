import { z } from "zod";

/** Ödeme (F2-03 · docs/03-moduller/odeme.md). Kart verisi ASLA sunucuya gelmez (ODM-01). */

export const PAYMENT_STATUSES = ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Checkout isteği: yalnızca sipariş ve taksit. Kart alanı YOK (tokenizasyon sağlayıcıda). */
export const checkoutSchema = z.object({
  orderId: z.string().min(1),
  installments: z.number().int().min(1).max(12).default(1),
  /** Sağlayıcı seçimi (IYZICO/PAYTR…). Verilmezse ilk aktif sağlayıcı. */
  providerId: z.string().min(1).optional(),
});
export type CheckoutRequest = z.infer<typeof checkoutSchema>;

/** Sağlayıcı webhook yükü (sandbox). İmza `x-signature` başlığında; idempotanslık externalTxId ile (ODM-04). */
export const paymentWebhookSchema = z.object({
  externalTxId: z.string().min(1).max(120),
  outcome: z.enum(["CAPTURED", "FAILED"]),
  failureCode: z.string().trim().max(60).optional(),
});
export type PaymentWebhookPayload = z.infer<typeof paymentWebhookSchema>;

/** Yerel simülasyon (webhook yerine, oturumlu). */
export const paymentSimulateSchema = z.object({
  outcome: z.enum(["CAPTURED", "FAILED"]),
  failureCode: z.string().trim().max(60).optional(),
});
export type PaymentSimulateRequest = z.infer<typeof paymentSimulateSchema>;

