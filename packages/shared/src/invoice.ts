import { z } from "zod";

/** Fatura (F2-05/06 · docs/03-moduller/fatura.md). Numara/ETTN entegratörden gelir (FTR-10). */

export const INVOICE_DIRECTIONS = ["SALES", "PURCHASE"] as const;
export const INVOICE_TYPES = ["E_ARSIV", "E_FATURA", "E_IHRACAT", "RETURN"] as const;
export const INVOICE_STATUSES = ["DRAFT", "SENT", "DELIVERED", "AWAITING_RESPONSE", "ACCEPTED", "REJECTED", "ERROR", "CANCELLED", "POSTED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoiceQuerySchema = z.object({
  direction: z.enum(INVOICE_DIRECTIONS).optional(),
  type: z.enum(INVOICE_TYPES).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

export const invoiceCancelSchema = z.object({ reason: z.string().trim().min(2).max(300) });
export type InvoiceCancelRequest = z.infer<typeof invoiceCancelSchema>;

/** e-Belge webhook'u (mock): durum güncellemesi, ETTN ile eşlenir. */
export const einvoiceWebhookSchema = z.object({
  ettn: z.string().min(1).max(120),
  status: z.enum(INVOICE_STATUSES),
});
export type EInvoiceWebhookPayload = z.infer<typeof einvoiceWebhookSchema>;
