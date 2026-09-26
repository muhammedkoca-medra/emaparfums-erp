import { z } from "zod";

/** Kargo/sevkiyat (F2-08 · docs/03-moduller/kargo.md). */

export const SHIPMENT_STATUSES = ["CREATED", "LABEL_PRINTED", "HANDED_OVER", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "DELAYED", "RETURNED", "LOST"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const shipmentCreateSchema = z.object({
  orderId: z.string().min(1),
  carrierId: z.string().min(1),
  desi: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,2})?$/, "Desi sayı olmalı")
    .optional(),
  isDangerousGoods: z.boolean().default(false),
});
export type ShipmentCreateRequest = z.infer<typeof shipmentCreateSchema>;

export const shipmentQuerySchema = z.object({ status: z.enum(SHIPMENT_STATUSES).optional() });
export type ShipmentQuery = z.infer<typeof shipmentQuerySchema>;

/** Kargo webhook'u (mock): takip no ile durum + olay. */
export const cargoWebhookSchema = z.object({
  trackingNo: z.string().min(1).max(60),
  status: z.enum(SHIPMENT_STATUSES),
  location: z.string().trim().max(120).optional(),
  message: z.string().trim().max(200).optional(),
});
export type CargoWebhookPayload = z.infer<typeof cargoWebhookSchema>;
