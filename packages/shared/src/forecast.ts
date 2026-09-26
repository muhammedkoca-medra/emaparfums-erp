/** Talep tahmini ve AI önerileri (F5-07 · PNL-03/04). Yerelde basit istatistik; ML ağa çıkışta. */

/** Son `window` değerin ortalaması (yoksa tüm seri). */
export function movingAverage(values: number[], window = 3): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * PNL-04: aylık miktar serisinden sonraki dönem tahmini ve eğilim.
 * Tahmin = son 3 ayın hareketli ortalaması; eğilim = son ay − önceki ay ortalaması.
 */
export function forecastNextMonth(monthlyQty: number[]): { forecast: number; trend: "up" | "down" | "flat" } {
  const forecast = Math.round(movingAverage(monthlyQty, 3));
  if (monthlyQty.length < 2) return { forecast, trend: "flat" };
  const last = monthlyQty[monthlyQty.length - 1]!;
  const prevAvg = movingAverage(monthlyQty.slice(0, -1), 3);
  const trend = last > prevAvg * 1.05 ? "up" : last < prevAvg * 0.95 ? "down" : "flat";
  return { forecast, trend };
}
