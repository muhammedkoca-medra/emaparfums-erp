import { z } from "zod";

/** E-ticaret / pazaryeri (F2-11/12/13 · docs/03-moduller/e-ticaret.md). */

export const LISTING_STATUSES = ["NOT_LISTED", "PENDING_APPROVAL", "ACTIVE", "PAUSED", "ERROR"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const listingUpsertSchema = z.object({
  channelId: z.string().min(1),
  productId: z.string().min(1),
});
export type ListingUpsertRequest = z.infer<typeof listingUpsertSchema>;

/** Pazaryeri sipariş çekme (yerel simülasyon): tek sipariş sentezler; externalOrderNo ile idempotent (SAL-01). */
export const syncOrderSchema = z.object({
  externalOrderNo: z.string().trim().min(1).max(60),
  sku: z.string().trim().min(1).max(40),
  qty: z.number().int().min(1).max(1000),
  unitPriceGross: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "Tutar sayı olmalı"),
});
export type SyncOrderRequest = z.infer<typeof syncOrderSchema>;
