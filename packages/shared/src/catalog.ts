import { z } from "zod";
import { ITEM_TYPES, UOMS } from "./stock.js";

/** Kalem ve ürün kartları (F1-01 · docs/02 §Item / Product ayrımı). */

const optionalQty = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, "Miktar sayı olmalı")
  .nullable()
  .optional();

export const itemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}-[A-Z0-9]{2,10}$/, "Kod biçimi: HM-0104, AM-0510, MM-1003");

export const itemCreateSchema = z.object({
  code: itemCodeSchema,
  name: z.string().trim().min(2).max(120),
  type: z.enum(ITEM_TYPES),
  uom: z.enum(UOMS),
  minStock: optionalQty,
  reorderQty: optionalQty,
  shelfLifeDays: z.number().int().min(1).max(3650).nullable().optional(),
  storageNote: z.string().trim().max(200).nullable().optional(),
  isHazardous: z.boolean().default(false),
});
export type ItemCreateRequest = z.infer<typeof itemCreateSchema>;

/** Kod ve tür sonradan değişmez (lot/hareket geçmişi bağlı). */
export const itemUpdateSchema = itemCreateSchema.omit({ code: true, type: true, uom: true }).partial();
export type ItemUpdateRequest = z.infer<typeof itemUpdateSchema>;

export const CONCENTRATIONS = ["EXTRAIT", "EDP", "EDT", "EDC", "COLOGNE", "OTHER"] as const;
export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "SALES_LOCKED", "DISCONTINUED"] as const;

/** GTIN-13 (EAN-13) kontrol hanesi. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((a, d, i) => a + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export const barcodeSchema = z
  .string()
  .trim()
  .refine(isValidEan13, "Barkod geçerli bir EAN-13 olmalı (13 hane, kontrol hanesi doğru)");

/** GTİP: 4 haneli fasıl + noktalı alt kırılımlar (ör. 3303.00 veya 3303.00.90.00.00). */
export const gtipSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(\.\d{2}){0,4}$/, "GTİP biçimi: 3303.00 veya 3303.00.90.00.00");

export const productCreateSchema = z.object({
  itemId: z.string().min(1),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,30}$/, "SKU yalnızca harf, rakam ve tire içerebilir"),
  barcode: barcodeSchema.nullable().optional(),
  name: z.string().trim().min(2).max(120),
  concentration: z.enum(CONCENTRATIONS),
  volumeMl: z.number().int().min(1).max(5000),
  gtip: gtipSchema,
  taxCategory: z.string().trim().toUpperCase().min(2).max(40),
});
export type ProductCreateRequest = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = productCreateSchema
  .omit({ itemId: true })
  .partial()
  .extend({ status: z.enum(PRODUCT_STATUSES).optional() });
export type ProductUpdateRequest = z.infer<typeof productUpdateSchema>;

export const NOTE_TIERS = ["TOP", "HEART", "BASE"] as const;
export const ACCORDS = ["amber", "woody", "spicy", "floral", "fresh", "sweet"] as const;
export const NOTE_FAMILIES = [
  "citrus",
  "floral",
  "woody",
  "amber",
  "spicy",
  "gourmand",
  "musky",
  "fresh",
] as const;

export const productScentSchema = z.object({
  notes: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(60),
        family: z.enum(NOTE_FAMILIES),
        tier: z.enum(NOTE_TIERS),
      }),
    )
    .max(40),
  accords: z.partialRecord(z.enum(ACCORDS), z.number().int().min(0).max(100)),
});
export type ProductScentRequest = z.infer<typeof productScentSchema>;

export const catalogQuerySchema = z.object({
  type: z.enum(ITEM_TYPES).optional(),
  search: z.string().trim().max(60).optional(),
});
