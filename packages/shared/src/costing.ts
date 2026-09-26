import { Decimal } from "decimal.js";

/** Maliyet (F4-01/02 · docs/03-moduller/maliyet.md). Para hesabı Decimal ile (kural 5). */

/** Toplam üretim saati (aşama loglarının süreleri toplamı, saat). */
export function productionHours(stages: { startedAt: Date; endedAt: Date | null }[], now = new Date()): string {
  let ms = 0;
  for (const s of stages) ms += (s.endedAt ?? now).getTime() - s.startedAt.getTime();
  return new Decimal(Math.max(ms, 0)).div(3_600_000).toDecimalPlaces(4).toString();
}

/** Saat × oran (TRY). */
export function hourlyCost(hours: string | number, ratePerHour: string | number): string {
  return new Decimal(hours).times(ratePerHour).toDecimalPlaces(4).toString();
}

/** Birim maliyet = toplam ÷ iyi adet (MLY-03). */
export function unitCost(total: string | number, goodQty: number): string {
  if (goodQty <= 0) return new Decimal(total).toDecimalPlaces(4).toString();
  return new Decimal(total).div(goodQty).toDecimalPlaces(4).toString();
}

export interface CostComponentRow {
  component: string;
  standard: string;
  actual: string;
}

/** Bileşen bazında sapma (gerçek − standart) ve sapma yüzdesi; eşik aşımı işaretlenir (MLY-04). */
export function costVariance(rows: CostComponentRow[], warnPct: number) {
  return rows.map((r) => {
    const std = new Decimal(r.standard);
    const act = new Decimal(r.actual);
    const diff = act.minus(std);
    const pct = std.isZero() ? (act.isZero() ? new Decimal(0) : new Decimal(100)) : diff.div(std).times(100);
    return {
      component: r.component,
      standard: std.toDecimalPlaces(4).toString(),
      actual: act.toDecimalPlaces(4).toString(),
      variance: diff.toDecimalPlaces(4).toString(),
      variancePct: pct.toDecimalPlaces(2).toString(),
      warn: pct.abs().greaterThan(warnPct),
    };
  });
}

export interface ScenarioInput {
  /** Bileşen başına mevcut birim maliyet (standart/gerçek). */
  baseComponents: { component: string; unit: string }[];
  /** Esans fiyat çarpanı (1 = değişmez). */
  essenceFactor?: number;
  /** Döviz kuru çarpanı (ithal girdilere; burada esans+alkol'e uygulanır). */
  fxFactor?: number;
  /** Parti büyüklüğü çarpanı (sabit giderleri adet başına seyreltir): işçilik+genel gider. */
  batchSizeFactor?: number;
  /** Ortalama net satış (birim, TRY) — marj için. */
  avgNetSale?: string | number;
}

/**
 * MLY-05: "Ne olursa?" senaryosu. Kaydetmez; yeni birim maliyet, marj ve önerilen fiyatı döndürür.
 *  - Esans/alkol bileşenleri essenceFactor × fxFactor ile ölçeklenir.
 *  - İşçilik ve genel gider batchSizeFactor ile bölünür (daha büyük parti → adet başına düşer).
 */
export function simulateUnitCost(input: ScenarioInput) {
  const ess = new Decimal(input.essenceFactor ?? 1);
  const fx = new Decimal(input.fxFactor ?? 1);
  const size = new Decimal(input.batchSizeFactor ?? 1);
  let total = new Decimal(0);
  const rows = input.baseComponents.map((c) => {
    let unitv = new Decimal(c.unit);
    if (c.component === "ESSENCE") unitv = unitv.times(ess).times(fx);
    else if (c.component === "ALCOHOL_WATER") unitv = unitv.times(fx);
    else if (c.component === "DIRECT_LABOR" || c.component === "OVERHEAD") unitv = size.isZero() ? unitv : unitv.div(size);
    total = total.plus(unitv);
    return { component: c.component, unit: unitv.toDecimalPlaces(4).toString() };
  });
  const newUnit = total.toDecimalPlaces(4);
  const out: { components: { component: string; unit: string }[]; unitCost: string; margin?: string; marginPct?: string } = {
    components: rows,
    unitCost: newUnit.toString(),
  };
  if (input.avgNetSale != null) {
    const sale = new Decimal(input.avgNetSale);
    const margin = sale.minus(newUnit);
    out.margin = margin.toDecimalPlaces(4).toString();
    out.marginPct = sale.isZero() ? "0" : margin.div(sale).times(100).toDecimalPlaces(2).toString();
  }
  return out;
}
