import { Decimal } from "decimal.js";
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
    // KDV oranı koda yazılmaz (kural 4): istemci TaxRule'daki oranlardan seçip satıra kopyalar.
    .array(z.object({ itemId: z.string().min(1), qty, unitPrice: price, kdvRate: rate }))
    .min(1, "En az bir satır")
    .max(200),
  /** MRP'den aktarılan satın alma talepleri; sipariş oluşunca bu siparişe bağlanır. */
  requisitionIds: z.array(z.string().min(1)).max(200).optional(),
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

/**
 * SAT-07 tedarikçi karnesi — gerçek veriden, şeffaf formülle:
 *  - Zamanında teslim %: mal kabul tarihi siparişin beklenen tarihinden sonra değilse (beklenen tarih yoksa) zamanında.
 *  - Kalite reddi %: (reddedilen lotların miktarı + hasarlı kabul) ÷ toplam kabul.
 *  - Ortalama teslim süresi: sipariş tarihinden ilk mal kabule gün (sipariş başına bir kez).
 *  - Puan: zamanında teslim % ile kalite % (100 − ret %) ortalaması, tam sayı.
 * Kabul verisi yoksa tüm göstergeler null (uydurma puan yok).
 */
export interface SupplierReceiptFact {
  poId: string;
  poCreatedAt: Date;
  expectedAt: Date | null;
  receivedAt: Date;
  qty: string;
  rejectedQty: string;
}

export function supplierScore(facts: SupplierReceiptFact[]): {
  receipts: number;
  onTimePct: number | null;
  qualityRejectPct: number | null;
  avgLeadDays: number | null;
  score: number | null;
} {
  if (facts.length === 0) return { receipts: 0, onTimePct: null, qualityRejectPct: null, avgLeadDays: null, score: null };
  const onTime = facts.filter((f) => !f.expectedAt || f.receivedAt.getTime() <= f.expectedAt.getTime() + 86_400_000 - 1).length;
  const total = facts.reduce((a, f) => a.plus(f.qty), new Decimal(0));
  const rejected = facts.reduce((a, f) => a.plus(f.rejectedQty), new Decimal(0));
  const firstByPo = new Map<string, SupplierReceiptFact>();
  for (const f of facts) {
    const cur = firstByPo.get(f.poId);
    if (!cur || f.receivedAt < cur.receivedAt) firstByPo.set(f.poId, f);
  }
  const leads = [...firstByPo.values()].map((f) => (f.receivedAt.getTime() - f.poCreatedAt.getTime()) / 86_400_000);
  const onTimePct = Math.round((onTime / facts.length) * 100);
  const qualityRejectPct = total.greaterThan(0) ? rejected.dividedBy(total).times(100).toDecimalPlaces(1).toNumber() : 0;
  const avgLeadDays = Math.round((leads.reduce((a, d) => a + d, 0) / leads.length) * 10) / 10;
  const score = Math.round((onTimePct + (100 - qualityRejectPct)) / 2);
  return { receipts: facts.length, onTimePct, qualityRejectPct, avgLeadDays, score };
}
