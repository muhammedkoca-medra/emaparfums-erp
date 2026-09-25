import { Decimal } from "decimal.js";
import { z } from "zod";
import { UOMS } from "./stock.js";

/** Formül ve reçete (F1-02 · docs/03-moduller/uretim.md URT-09, docs/02 §Formül sürümü). */

const pct = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, "Yüzde en fazla 4 ondalıklı sayı olmalı")
  .refine((v) => Number(v) > 0 && Number(v) <= 100, "Yüzde 0'dan büyük, 100'den küçük ya da eşit olmalı");

export const formulaCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^F-[A-Z0-9-]{2,20}$/, "Formül kodu biçimi: F-NA-03"),
  name: z.string().trim().min(2).max(120),
  concentrationPct: pct,
  ifraCategory: z.string().trim().max(10).nullable().optional(),
});
export type FormulaCreateRequest = z.infer<typeof formulaCreateSchema>;

export const formulaDraftSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  concentrationPct: pct.optional(),
  ifraCategory: z.string().trim().max(10).nullable().optional(),
  lines: z.array(z.object({ itemId: z.string().min(1), percentage: pct })).max(200),
  allergens: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        /** Son üründeki oran (%): 0.12 = %0,12 */
        pctInFinal: z
          .string()
          .trim()
          .regex(/^\d{1,3}(\.\d{1,6})?$/, "Oran sayı olmalı"),
        mustLabel: z.boolean(),
      }),
    )
    .max(100),
});
export type FormulaDraftRequest = z.infer<typeof formulaDraftSchema>;

export const formulaDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});
export type FormulaDecisionRequest = z.infer<typeof formulaDecisionSchema>;

export const bomUpdateSchema = z.object({
  batchSize: z.number().int().min(1).max(1_000_000),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z
          .string()
          .trim()
          .regex(/^\d{1,14}(\.\d{1,4})?$/, "Miktar sayı olmalı"),
        uom: z.enum(UOMS),
        scrapPct: z
          .string()
          .trim()
          .regex(/^\d{1,3}(\.\d{1,4})?$/)
          .default("0"),
      }),
    )
    .min(1)
    .max(200),
});
export type BomUpdateRequest = z.infer<typeof bomUpdateSchema>;

/**
 * Onaya gönderilebilirlik: en az bir satır, aynı kalem iki kez yok, toplam tam %100
 * (Decimal ile; kayan nokta yuvarlaması kabul edilmez).
 */
export function validateFormulaLines(lines: { itemId: string; percentage: string }[]): string[] {
  const errors: string[] = [];
  if (lines.length === 0) errors.push("Formülde en az bir satır olmalı");
  const ids = lines.map((l) => l.itemId);
  if (new Set(ids).size !== ids.length) errors.push("Aynı kalem formülde birden fazla kez yer alamaz");
  const total = lines.reduce((a, l) => a.plus(l.percentage), new Decimal(0));
  if (lines.length > 0 && !total.equals(100))
    errors.push(`Satır yüzdelerinin toplamı %100 olmalı (şu an %${total.toString()})`);
  return errors;
}
