import { z } from "zod";

/** Vergi kuralı istekleri (docs/03-moduller/vergi.md VRG-02). Oran 0–1 arası ondalık metin: "0.20" = %20. */
const rate = z
  .string()
  .trim()
  .regex(/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/, "Oran 0 ile 1 arasında olmalı (ör. 0.20 = %20)");

export const taxRuleCreateSchema = z.object({
  category: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z_]{2,40}$/, "Kategori büyük harf ve alt çizgi (ör. PERFUME)"),
  gtipPrefix: z
    .string()
    .trim()
    .regex(/^\d{2,12}$/, "GTİP öneki yalnızca rakam")
    .nullable()
    .optional(),
  kdvRate: rate,
  otvRate: rate,
  otvList: z.string().trim().max(10).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  validFrom: z.coerce.date(),
});
export type TaxRuleCreateRequest = z.infer<typeof taxRuleCreateSchema>;

export const taxPreviewQuerySchema = z.object({
  category: z.string().trim().toUpperCase().min(2).max(40),
  gross: z
    .string()
    .trim()
    .regex(/^\d{1,14}(\.\d{1,2})?$/, "Tutar sayı olmalı"),
  date: z.coerce.date().optional(),
});
export type TaxPreviewQuery = z.infer<typeof taxPreviewQuerySchema>;
