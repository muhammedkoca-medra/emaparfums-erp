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

/** İade (F3-12 · KRG-06). */
export const RETURN_STATUSES = ["REQUESTED", "IN_TRANSIT", "INSPECTING", "APPROVED", "REJECTED", "REFUNDED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const returnCreateSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(2).max(300),
  lines: z.array(z.object({ orderLineId: z.string().min(1), qty: z.number().int().positive() })).min(1),
});
export type ReturnCreateRequest = z.infer<typeof returnCreateSchema>;

/** İade paketi muayenesi (KRG-06): hasarlıysa fire, değilse karantinaya stok girişi. */
export const returnInspectSchema = z.object({
  damaged: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type ReturnInspectRequest = z.infer<typeof returnInspectSchema>;

/** e-İrsaliye (FTR-07). */
export const dispatchNoteCreateSchema = z.object({
  orderId: z.string().min(1).nullable().optional(),
  shipmentId: z.string().min(1).nullable().optional(),
  lines: z.array(z.object({ productId: z.string().min(1), lotNo: z.string().trim().min(1).max(40), qty: z.number().int().positive() })).min(1),
});
export type DispatchNoteCreateRequest = z.infer<typeof dispatchNoteCreateSchema>;
