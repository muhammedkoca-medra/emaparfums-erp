import { z } from "zod";

/** Abonelik (F5-05/06 · SDK-04…07, ODM-08). Kart verisi tutulmaz; yalnızca sağlayıcı token'ı. */

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const subscribeSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().min(1),
  /** Sağlayıcıdaki kayıtlı kart referansı (kart verisi ASLA gönderilmez). */
  paymentToken: z.string().trim().max(200).nullable().optional(),
});
export type SubscribeRequest = z.infer<typeof subscribeSchema>;

/** ODM-08: başarısız tahsilat yeniden deneme günleri; ardından PAST_DUE. */
export const BILLING_RETRY_DAYS = [1, 3, 7] as const;

/** Bir tarihe ay ekler (UTC). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Dönem etiketi (YYYY-MM, UTC). */
export function periodLabel(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * SDK-06: basit ayrılma riski (0–1). Son etkinlikten geçen gün + geciken ödeme + düşük memnuniyet.
 *  - 90+ gün etkinlik yok → yüksek risk. PAST_DUE → +0.3. Ortalama puan düşük → +0.2.
 */
export function computeChurnRisk(input: { daysSinceLastActivity: number; pastDue: boolean; avgRating?: number | null }): number {
  let risk = Math.min(1, input.daysSinceLastActivity / 90) * 0.5;
  if (input.pastDue) risk += 0.3;
  if (input.avgRating != null && input.avgRating > 0 && input.avgRating < 3) risk += 0.2;
  return Math.max(0, Math.min(1, Number(risk.toFixed(4))));
}
