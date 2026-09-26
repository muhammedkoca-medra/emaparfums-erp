/** Koku AI (F5-01/02 · KOK). Akor vektörleri ve benzerlik (yerelde; embeddings ağa çıkışta). */

/** Ürün vektörü boyutları (akorlar). ProductAccord.accord bu kümeden gelir. */
export const ACCORD_DIMS = ["amber", "woody", "floral", "spicy", "fresh", "sweet", "citrus", "musky", "gourmand"] as const;
export type AccordDim = (typeof ACCORD_DIMS)[number];

/** KOK-02: akor skorlarından (0–100) normalize vektör (0–1) üretir. */
export function buildAccordVector(accords: { accord: string; score: number }[]): number[] {
  const map = new Map(accords.map((a) => [a.accord.toLowerCase(), a.score]));
  return ACCORD_DIMS.map((d) => Math.max(0, Math.min(100, map.get(d) ?? 0)) / 100);
}

/** İki vektör arası kosinüs benzerliği (0–1). Sıfır vektörde 0 döner. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** KOK-07: bir aramanın "karşılanmamış talep" sayılması için en yüksek eşleşme skoru bu eşiğin altında olmalı. */
export const UNMET_DEMAND_MAX_SCORE = 0.5;
