import { z } from "zod";

/** Satış siparişi (F2-02 · docs/03-moduller/satis.md SAL-01…07). */

export const ORDER_STATUSES = [
  "NEW",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "IN_PRODUCTION",
  "PICKING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Durum makinesi (SAL-07): izinli geçişler. İptal SHIPPED'den önce (SAL-06). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["PAYMENT_PENDING", "CONFIRMED", "CANCELLED"],
  PAYMENT_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PRODUCTION", "PICKING", "CANCELLED"],
  IN_PRODUCTION: ["PICKING", "CANCELLED"],
  PICKING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["COMPLETED", "RETURNED"],
  COMPLETED: [],
  CANCELLED: [],
  RETURNED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => ORDER_TRANSITIONS[from]?.includes(to) ?? false;

/** Kanal kodu → sipariş numarası öneki (SAL-01). */
export const CHANNEL_PREFIX: Record<string, string> = {
  WEB: "WB",
  TRENDYOL: "TY",
  HEPSIBURADA: "HB",
  AMAZON_TR: "AZ",
  N11: "N11",
  CICEKSEPETI: "CS",
  B2B: "B2B",
  STORE: "MG",
  EXPORT: "EX",
  SUBSCRIPTION: "SB",
};

const money = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,2})?$/, "Tutar sayı olmalı (en fazla 2 ondalık)");

export const orderCreateSchema = z.object({
  channelId: z.string().min(1),
  customerId: z.string().min(1),
  paymentTermsDays: z.number().int().min(0).max(365).nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(100_000),
        unitPriceGross: money,
        discount: money.optional(),
      }),
    )
    .min(1, "En az bir satır gerekli")
    .max(200),
});
export type OrderCreateRequest = z.infer<typeof orderCreateSchema>;

export const orderTransitionSchema = z.object({
  to: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(300).optional(),
});
export type OrderTransitionRequest = z.infer<typeof orderTransitionSchema>;

export const orderQuerySchema = z.object({
  channel: z.string().trim().max(40).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;
