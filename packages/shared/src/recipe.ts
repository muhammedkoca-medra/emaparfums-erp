import { Decimal } from "decimal.js";
import { z } from "zod";

/**
 * Kütlesel reçete (EMA üretim formülü). Son ürün bileşenleri kütle yüzdesiyle tanımlanır; parti için
 * toplam gram = hacim (mL) × karışım yoğunluğu (g/mL), her bileşenin gramı = toplam × yüzde.
 * Ters yön: gram girilirse toplam = gramların toplamı, yüzde = gram ÷ toplam.
 * ör. 470 mL · 0,854 g/mL → 401,38 g; Esans %23 → 92,32 g.
 */
export const RECIPE_ROLES = ["ESSENCE", "ALCOHOL", "WATER", "GLYCERIN", "OTHER"] as const;
export type RecipeRole = (typeof RECIPE_ROLES)[number];

/** Yüzde toplamında kabul edilen sapma (yuvarlama payı). */
export const PCT_TOLERANCE = "0.01";

const D = (v: Decimal.Value) => new Decimal(v);

/** Toplam gram = mL × yoğunluk (2 ondalık, yarım yukarı). */
export function totalGramsFor(ml: Decimal.Value, densityGPerMl: Decimal.Value): string {
  return D(ml).times(densityGPerMl).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Hacim = toplam gram ÷ yoğunluk (2 ondalık). */
export function mlForGrams(totalGr: Decimal.Value, densityGPerMl: Decimal.Value): string {
  const d = D(densityGPerMl);
  if (d.lessThanOrEqualTo(0)) return "0.00";
  return D(totalGr).dividedBy(d).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Yüzdelerin toplamı (4 ondalık). */
export function sumPct(pcts: Decimal.Value[]): string {
  return pcts.reduce<Decimal>((s, p) => s.plus(p || 0), D(0)).toDecimalPlaces(4).toString();
}

/** Yüzde toplamı 100 mü (± PCT_TOLERANCE). */
export function isFullRecipe(pcts: Decimal.Value[]): boolean {
  return D(sumPct(pcts)).minus(100).abs().lessThanOrEqualTo(PCT_TOLERANCE);
}

/**
 * Yüzdeden gram: her satır 2 ondalık yarım yukarı. Yüzdeler tam (%100) ise yuvarlama farkı en büyük
 * paya (genelde alkol) yazılır; gramların toplamı tam olarak hedef toplamı verir (terazide şaşmaz).
 */
export function gramsForPercents(totalGr: Decimal.Value, pcts: Decimal.Value[]): string[] {
  const total = D(totalGr);
  const grams = pcts.map((p) => total.times(p || 0).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  if (grams.length > 0 && isFullRecipe(pcts)) {
    let big = 0;
    pcts.forEach((p, i) => {
      if (D(p || 0).greaterThan(pcts[big] || 0)) big = i;
    });
    const others = grams.reduce<Decimal>((s, g, i) => (i === big ? s : s.plus(g)), D(0));
    grams[big] = total.minus(others);
  }
  return grams.map((g) => g.toFixed(2));
}

/** Gramdan yüzde: toplam = gramların toplamı, yüzde = gram ÷ toplam × 100 (4 ondalık). */
export function percentsForGrams(grams: Decimal.Value[]): { totalGr: string; pcts: string[] } {
  const total = grams.reduce<Decimal>((s, g) => s.plus(g || 0), D(0));
  if (total.lessThanOrEqualTo(0)) return { totalGr: "0.00", pcts: grams.map(() => "0") };
  return {
    totalGr: total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    pcts: grams.map((g) => D(g || 0).times(100).dividedBy(total).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toString()),
  };
}

/** Reçete satırı miktarı, kalemin kütle biriminde (KG ya da G), 4 ondalık. */
export function gramsToUom(grams: Decimal.Value, uom: "KG" | "G"): string {
  const g = D(grams);
  return (uom === "KG" ? g.dividedBy(1000) : g).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

/**
 * Kurulum reçetesi (BOM, `batchSize` adet) için bileşen miktarı, kütle biriminde.
 * = şişe mL × adet × yoğunluk × yüzde ÷ 100 gram.
 */
export function recipeBomQty(volumeMl: number, densityGPerMl: Decimal.Value, pct: Decimal.Value, uom: "KG" | "G", batchSize: number): string {
  const grams = D(volumeMl).times(batchSize).times(densityGPerMl).times(pct).dividedBy(100);
  return gramsToUom(grams, uom);
}

const pctStr = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, "Yüzde (ör. 23 ya da 72.5)")
  .refine((v) => Number(v) > 0 && Number(v) <= 100, "Yüzde 0'dan büyük, en fazla 100 olmalı");
export const densityStr = z
  .string()
  .trim()
  .regex(/^\d(\.\d{1,4})?$/, "Yoğunluk g/mL (ör. 0.854)")
  .refine((v) => Number(v) >= 0.5 && Number(v) <= 1.5, "Yoğunluk 0,5–1,5 g/mL arasında olmalı");
export const gramsStr = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Gram (en fazla 2 ondalık)")
  .refine((v) => Number(v) > 0, "Gram 0'dan büyük olmalı");

/** Varsayılan reçete şablonu (Otomatik kurallar ekranından değiştirilebilir). */
export const recipeTemplateSchema = z.object({
  densityGPerMl: densityStr,
  lines: z
    .array(z.object({ role: z.enum(RECIPE_ROLES), pct: pctStr }))
    .min(1)
    .max(8)
    .refine((ls) => isFullRecipe(ls.map((l) => l.pct)), "Şablon yüzdelerinin toplamı %100 olmalı"),
});
export type RecipeTemplate = z.infer<typeof recipeTemplateSchema>;

/** EMA standart reçetesi (470 mL kütlesel reçete tablosundan). */
export const DEFAULT_RECIPE_TEMPLATE: RecipeTemplate = {
  densityGPerMl: "0.854",
  lines: [
    { role: "ESSENCE", pct: "23" },
    { role: "ALCOHOL", pct: "72.5" },
    { role: "WATER", pct: "4" },
    { role: "GLYCERIN", pct: "0.5" },
  ],
};

export { pctStr as recipePctStr };
