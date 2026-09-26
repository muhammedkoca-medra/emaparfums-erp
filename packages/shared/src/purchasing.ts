import { z } from "zod";

/** Satın alma (F2-14/15 · docs/03-moduller/satin-alma.md). */

export const PO_STATUSES = ["REQUESTED", "PENDING_APPROVAL", "ORDERED", "IN_TRANSIT", "RECEIVING", "CLOSED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

/** SAT-03 onay eşiği (₺). ApprovalRule yoksa varsayılan. */
export const PO_APPROVAL_THRESHOLD = "50000.00";
/** SAT-05: kabulde aşım toleransları. */
export const RECEIPT_WARN_PCT = 5;
export const RECEIPT_BLOCK_PCT = 10;

const qty = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, "Miktar sayı olmalı")
  .refine((v) => Number(v) > 0, "Miktar 0'dan büyük olmalı");
const price = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,4})?$/, "Fiyat sayı olmalı");
const rate = z
  .string()
  .trim()
  .regex(/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/, "Oran 0-1 arası");

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  taxNo: z.string().trim().regex(/^\d{10,11}$/, "VKN/TCKN").nullable().optional(),
  taxOffice: z.string().trim().max(80).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("TRY"),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  isEInvoice: z.boolean().default(false),
});
export type SupplierCreateRequest = z.infer<typeof supplierCreateSchema>;

export const poCreateSchema = z.object({
  supplierId: z.string().min(1),
  currency: z.string().trim().length(3).toUpperCase().default("TRY"),
  expectedAt: z.coerce.date().nullable().optional(),
  lines: z
    .array(z.object({ itemId: z.string().min(1), qty, unitPrice: price, kdvRate: rate.default("0.20") }))
    .min(1, "En az bir satır")
    .max(200),
});
export type PoCreateRequest = z.infer<typeof poCreateSchema>;

export const receiptCreateSchema = z.object({
  lines: z
    .array(
      z.object({
        poLineId: z.string().min(1),
        qty,
        damagedQty: qty.optional(),
        lotNo: z.string().trim().max(40).optional(),
        expiryDate: z.coerce.date().nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type ReceiptCreateRequest = z.infer<typeof receiptCreateSchema>;

/** SAT-06: 3'lü eşleştirme toleransları. */
export const MATCH_QTY_TOLERANCE_PCT = 0;
export const MATCH_PRICE_TOLERANCE_PCT = 1;

/** Gelen alış faturası (entegratör teslim eder; yerelde simülasyon). Satır verilmezse siparişten alınır. */
export const incomingInvoiceSchema = z.object({
  lines: z
    .array(z.object({ poLineId: z.string().min(1), qty, unitPrice: price }))
    .max(200)
    .optional(),
});
export type IncomingInvoiceRequest = z.infer<typeof incomingInvoiceSchema>;
