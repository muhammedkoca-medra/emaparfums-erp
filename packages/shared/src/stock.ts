import { z } from "zod";

/** Stok modülü istek şemaları (docs/03-moduller/stok.md §API uçları). */

export const ITEM_TYPES = ["RAW_MATERIAL", "PACKAGING", "SEMI_FINISHED", "FINISHED_GOOD", "SAMPLE"] as const;
export type ItemTypeCode = (typeof ITEM_TYPES)[number];
export const UOMS = ["KG", "G", "L", "ML", "PCS"] as const;
export type UomCode = (typeof UOMS)[number];

/** Miktar: pozitif, en fazla 4 ondalık (Decimal(18,4)). Metin olarak taşınır, number'a çevrilmez. */
export const qtySchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, "Miktar sayı olmalı (en fazla 4 ondalık)")
  .refine((v) => Number(v) > 0, "Miktar sıfırdan büyük olmalı");

/** Tutar: en fazla 4 ondalık (birim maliyet). */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, "Tutar sayı olmalı");

const id = z.string().min(1).max(60);
const note = z.string().trim().min(3, "Gerekçe en az 3 karakter olmalı").max(500);

export const newLotSchema = z.object({
  lotNo: z.string().trim().min(1).max(40),
  expiryDate: z.coerce.date().optional(),
  mfgDate: z.coerce.date().optional(),
  supplierLotNo: z.string().trim().max(60).optional(),
});

/** Elle stok hareketi: giriş (açılış/elle kabul), düzeltme, transfer. Satış/üretim hareketleri kendi modüllerinden gelir. */
export const movementRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RECEIPT"),
    itemId: id,
    locationId: id,
    qty: qtySchema,
    unitCost: moneySchema.optional(),
    lotId: id.optional(),
    newLot: newLotSchema.optional(),
    note: note.optional(),
  }),
  z.object({
    type: z.literal("ADJUSTMENT"),
    itemId: id,
    lotId: id,
    locationId: id,
    direction: z.enum(["INCREASE", "DECREASE"]),
    qty: qtySchema,
    note,
  }),
  z.object({
    type: z.literal("TRANSFER"),
    itemId: id,
    lotId: id,
    fromLocationId: id,
    toLocationId: id,
    qty: qtySchema,
    note: note.optional(),
  }),
]);
export type MovementRequest = z.infer<typeof movementRequestSchema>;

export const reservationRequestSchema = z.object({
  itemId: id,
  qty: qtySchema,
  warehouseId: id.optional(),
  note,
});
export type ReservationRequest = z.infer<typeof reservationRequestSchema>;

export const lotQcRequestSchema = z.object({
  status: z.enum(["QUARANTINE", "RELEASED", "REJECTED"]),
  reason: note,
});
export type LotQcRequest = z.infer<typeof lotQcRequestSchema>;

export const balancesQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  search: z.string().trim().max(60).optional(),
  warehouseId: id.optional(),
});
export type BalancesQuery = z.infer<typeof balancesQuerySchema>;

export const expiringQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(3650).optional() });

export const movementsQuerySchema = z.object({
  itemId: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

// ---- Sayım (STK-09) ----

export const countCreateSchema = z.object({
  warehouseId: id,
  /** Lokasyon kodu öneki (ör. "B4"); boşsa tüm depo. */
  zone: z.string().trim().max(20).optional(),
  isBlind: z.boolean().default(true),
});
export type CountCreateRequest = z.infer<typeof countCreateSchema>;

export const countLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: id,
        countedQty: z
          .string()
          .trim()
          .regex(/^\d{1,14}(\.\d{1,4})?$/, "Sayılan miktar sayı olmalı (0 olabilir)"),
      }),
    )
    .min(1)
    .max(2000),
});
export type CountLinesRequest = z.infer<typeof countLinesSchema>;

export const countDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});
export type CountDecisionRequest = z.infer<typeof countDecisionSchema>;

/** Liste satırı durumu (arayüz etiketi messages/tr.json → stock.status.*). */
export type StockRowStatus =
  "QUARANTINE" | "REJECTED" | "CRITICAL" | "EXPIRING" | "IN_PROCESS" | "OK" | "EMPTY";
