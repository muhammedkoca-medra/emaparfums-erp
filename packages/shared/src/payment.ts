import { Decimal } from "decimal.js";
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

/** ODM-06: açıklanamayan hakediş farkı bu tutarı (TRY) aşarsa görev açılır. */
export const SETTLEMENT_DIFF_THRESHOLD = 100;

export const SETTLEMENT_LINE_KINDS = ["SALE", "COMMISSION", "RETURN", "SHIPPING", "PENALTY"] as const;
export type SettlementLineKind = (typeof SETTLEMENT_LINE_KINDS)[number];

/** ODM-06: hakediş ekstresi içe aktarma (pazaryeri dönem ekstresi; mock). */
export const settlementImportSchema = z.object({
  channelId: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  received: z.string().regex(/^-?\d+(\.\d{1,2})?$/).optional(),
  lines: z
    .array(
      z.object({
        kind: z.enum(SETTLEMENT_LINE_KINDS),
        orderNo: z.string().trim().max(40).nullable().optional(),
        amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
      }),
    )
    .min(1),
});
export type SettlementImportRequest = z.infer<typeof settlementImportSchema>;

/** Beklenen ödeme (net hakediş) = satış − (komisyon + iade + kargo + ceza). Decimal string döner. */
export function settlementExpected(lines: { kind: string; amount: string }[]): string {
  return lines
    .reduce((acc, l) => {
      const a = new Decimal(l.amount);
      return l.kind === "SALE" ? acc.plus(a) : acc.minus(a);
    }, new Decimal(0))
    .toDecimalPlaces(2)
    .toString();
}

/** ODM-07: banka hareketi içe aktarma (mock ekstre). */
export const bankImportSchema = z.object({
  transactions: z
    .array(
      z.object({
        bankCode: z.string().trim().min(1).max(20),
        iban: z.string().trim().min(5).max(40),
        valueDate: z.coerce.date(),
        amount: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
        description: z.string().trim().max(300),
      }),
    )
    .min(1),
});
export type BankImportRequest = z.infer<typeof bankImportSchema>;

export const bankMatchSchema = z.object({
  matchedType: z.enum(["Payment", "Settlement", "Invoice", "Order"]),
  matchedId: z.string().min(1),
});
export type BankMatchRequest = z.infer<typeof bankMatchSchema>;

/** Açıklamada geçen olası sipariş numaralarını çıkarır (harf-rakam-tire dizileri, 4–40). */
export function extractOrderTokens(description: string): string[] {
  return [...new Set((description.toUpperCase().match(/[A-Z0-9][A-Z0-9-]{3,39}/g) ?? []))];
}

/** Yerel simülasyon (webhook yerine, oturumlu). */
export const paymentSimulateSchema = z.object({
  outcome: z.enum(["CAPTURED", "FAILED"]),
  failureCode: z.string().trim().max(60).optional(),
});
export type PaymentSimulateRequest = z.infer<typeof paymentSimulateSchema>;

