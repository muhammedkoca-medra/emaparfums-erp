import Decimal from "decimal.js";

/**
 * Vergi hesabının TEK kaynağı. Oranlar TaxRule tablosundan gelir, burada sabit oran yoktur.
 *
 * Sıra: net (vergisiz) → ÖTV = net × ötvOranı → KDV matrahı = net + ÖTV → KDV = matrah × kdvOranı.
 * Kanal fiyatları KDV dahil (brüt) tutulduğu için genelde brütten geriye hesaplanır.
 * Yuvarlama: satır bazında 2 hane, yarım yukarı. Kuruş farkı net tutara yazılır ki
 * net + ÖTV + KDV her zaman brüte eşit olsun.
 */

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export interface TaxRates {
  /** 0.20 = %20 */
  otvRate: Decimal.Value;
  kdvRate: Decimal.Value;
}

export interface TaxBreakdown {
  net: Decimal;
  otv: Decimal;
  kdvBase: Decimal;
  kdv: Decimal;
  gross: Decimal;
}

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** KDV dahil tutardan (satır toplamı) vergileri ayırır. */
export function fromGross(gross: Decimal.Value, rates: TaxRates): TaxBreakdown {
  const g = r2(new Decimal(gross));
  const o = new Decimal(rates.otvRate);
  const k = new Decimal(rates.kdvRate);
  if (g.isNegative() || o.isNegative() || k.isNegative()) throw new Error("negatif değer");

  const netRaw = g.div(o.plus(1).mul(k.plus(1)));
  const otv = r2(netRaw.mul(o));
  const kdv = r2(netRaw.plus(netRaw.mul(o)).mul(k));
  const net = g.minus(otv).minus(kdv); // kuruş farkı nette kalır
  return { net, otv, kdvBase: net.plus(otv), kdv, gross: g };
}

/** Vergisiz tutardan brüte gider (B2B teklif, alış faturası). */
export function fromNet(net: Decimal.Value, rates: TaxRates): TaxBreakdown {
  const n = r2(new Decimal(net));
  const otv = r2(n.mul(rates.otvRate));
  const kdvBase = n.plus(otv);
  const kdv = r2(kdvBase.mul(rates.kdvRate));
  return { net: n, otv, kdvBase, kdv, gross: kdvBase.plus(kdv) };
}

/** Satır: birim brüt fiyat × adet − indirim (brüt). */
export function lineFromGrossUnit(
  unitGross: Decimal.Value,
  qty: number,
  rates: TaxRates,
  discountGross: Decimal.Value = 0,
): TaxBreakdown {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("adet pozitif tam sayı olmalı");
  return fromGross(new Decimal(unitGross).mul(qty).minus(discountGross), rates);
}

/** Belge toplamı: satırların toplamı (belge seviyesinde yeniden yuvarlama yapılmaz). */
export function sumBreakdowns(lines: TaxBreakdown[]): TaxBreakdown {
  const z = new Decimal(0);
  return lines.reduce(
    (a, l) => ({
      net: a.net.plus(l.net),
      otv: a.otv.plus(l.otv),
      kdvBase: a.kdvBase.plus(l.kdvBase),
      kdv: a.kdv.plus(l.kdv),
      gross: a.gross.plus(l.gross),
    }),
    { net: z, otv: z, kdvBase: z, kdv: z, gross: z },
  );
}
