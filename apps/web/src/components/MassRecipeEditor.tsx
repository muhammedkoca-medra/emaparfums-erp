"use client";

import { gramsForPercents, isFullRecipe, mlForGrams, percentsForGrams, type RecipeRole, sumPct, totalGramsFor } from "@atelier/shared";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export interface RecipeRow {
  key: string;
  role: RecipeRole;
  /** Satırın görünen adı (kalem adı ya da rol adı). */
  label: string;
  pct: string;
  grams: string;
}

export interface RecipeState {
  ml: string;
  density: string;
  totalGr: string;
  rows: RecipeRow[];
}

const NUM = /^\d+(\.\d+)?$/;
const ok = (v: string) => NUM.test(v.trim()) && Number(v) >= 0;
/** Gösterim: gereksiz sıfırları at (23.0000 → 23). */
const trim = (v: string) => (NUM.test(v) ? String(Number(v)) : v);

/** Hacim + yoğunluk + yüzdelerden toplam gram ve bileşen gramları. */
export function recipeFromPercents(ml: string, density: string, rows: RecipeRow[]): RecipeState {
  if (!ok(ml) || !ok(density) || rows.some((r) => !ok(r.pct))) return { ml, density, totalGr: "", rows };
  const totalGr = totalGramsFor(ml, density);
  const grams = gramsForPercents(totalGr, rows.map((r) => r.pct));
  return { ml, density, totalGr, rows: rows.map((r, i) => ({ ...r, grams: grams[i]! })) };
}

/**
 * Kütlesel reçete düzenleyici. Yüzde değişince gram, gram değişince yüzde (ve toplam/hacim) güncellenir:
 *  - Yüzde / hacim / yoğunluk / toplam gram → gramlar = toplam × yüzde.
 *  - Gram → toplam = gramların toplamı, yüzde = gram ÷ toplam, hacim = toplam ÷ yoğunluk.
 * Hesap sunucuyla aynı fonksiyonlardan (@atelier/shared) yapılır.
 */
export function MassRecipeEditor({
  value,
  onChange,
  itemCell,
  onRemove,
  showVolume = true,
  caption,
}: {
  value: RecipeState;
  onChange: (v: RecipeState) => void;
  /** Satır başına ek alan (ör. kurulumda kalem seçimi). */
  itemCell?: (row: RecipeRow, index: number) => ReactNode;
  onRemove?: (index: number) => void;
  showVolume?: boolean;
  caption?: string;
}) {
  const t = useTranslations("production.recipe");
  const { ml, density, totalGr, rows } = value;

  const setMl = (v: string) => onChange(recipeFromPercents(v, density, rows));
  const setDensity = (v: string) => onChange(recipeFromPercents(ml, v, rows));
  const setTotal = (v: string) => {
    if (!ok(v) || !ok(density) || Number(density) <= 0) return onChange({ ...value, totalGr: v });
    const nextMl = mlForGrams(v, density);
    const grams = rows.every((r) => ok(r.pct)) ? gramsForPercents(v, rows.map((r) => r.pct)) : rows.map((r) => r.grams);
    onChange({ ml: trim(nextMl), density, totalGr: v, rows: rows.map((r, i) => ({ ...r, grams: grams[i]! })) });
  };
  const setPct = (i: number, v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, pct: v } : r));
    if (!ok(v) || !ok(totalGr)) return onChange({ ...value, rows: next });
    const grams = gramsForPercents(totalGr, next.map((r) => (ok(r.pct) ? r.pct : "0")));
    onChange({ ...value, rows: next.map((r, j) => ({ ...r, grams: grams[j]! })) });
  };
  const setGrams = (i: number, v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, grams: v } : r));
    if (!ok(v) || next.some((r) => !ok(r.grams))) return onChange({ ...value, rows: next });
    const { totalGr: total, pcts } = percentsForGrams(next.map((r) => r.grams));
    const nextMl = ok(density) && Number(density) > 0 ? trim(mlForGrams(total, density)) : ml;
    onChange({ ml: nextMl, density, totalGr: total, rows: next.map((r, j) => ({ ...r, pct: trim(pcts[j]!) })) });
  };

  const pctTotal = sumPct(rows.map((r) => (ok(r.pct) ? r.pct : "0")));
  const full = isFullRecipe(rows.map((r) => (ok(r.pct) ? r.pct : "0")));
  const gramTotal = rows.reduce((s, r) => s + (ok(r.grams) ? Number(r.grams) : 0), 0);
  const field = "min-h-10 w-full rounded-[8px] border border-line bg-surface px-2.5 text-right text-[14px] outline-none focus:border-gold-2";

  return (
    <div className="flex flex-col gap-3">
      {showVolume && (
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-[12px] font-semibold">
            {t("ml")}
            <input type="number" min={0} step="any" inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value)} className={`${field} num`} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold">
            {t("density")}
            <input type="number" min={0.5} max={1.5} step="0.001" inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} className={`${field} num`} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold">
            {t("totalGr")}
            <input type="number" min={0} step="0.01" inputMode="decimal" value={totalGr} onChange={(e) => setTotal(e.target.value)} className={`${field} num font-bold`} />
          </label>
        </div>
      )}

      <div className="overflow-hidden rounded-[12px] border border-line">
        {caption && <div className="border-b border-line-soft bg-surface-soft px-3 py-2 font-display text-[15px] font-semibold">{caption}</div>}
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-b border-line-soft px-3 py-2 text-[11px] font-bold tracking-[0.06em] text-muted uppercase sm:grid">
          <span>{t("component")}</span>
          <span className="text-right">{t("pct")}</span>
          <span className="text-right">{t("grams")}</span>
          <span className="w-7" />
        </div>
        <ul className="m-0 list-none p-0">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="grid grid-cols-2 items-center gap-2 border-b border-line-soft px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.role === "ESSENCE" ? "bg-gold" : "bg-line"}`} aria-hidden />
                  <span className="truncate">{r.label || t(`role.${r.role}`)}</span>
                </span>
                {itemCell?.(r, i)}
              </div>
              <label className="flex items-center gap-1">
                <span className="text-[12px] text-muted sm:hidden">%</span>
                <span className="hidden text-[13px] text-muted sm:inline">%</span>
                <input
                  aria-label={`${t("pct")} · ${r.label || t(`role.${r.role}`)}`}
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  inputMode="decimal"
                  value={r.pct}
                  onChange={(e) => setPct(i, e.target.value)}
                  className={`${field} num`}
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  aria-label={`${t("grams")} · ${r.label || t(`role.${r.role}`)}`}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={r.grams}
                  onChange={(e) => setGrams(i, e.target.value)}
                  className={`${field} num ${r.role === "ESSENCE" ? "font-bold text-gold-text" : ""}`}
                />
                <span className="text-[13px] text-muted">g</span>
              </label>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={t("remove")}
                  className="col-span-2 justify-self-end rounded-[8px] px-2 py-1 text-[13px] text-muted hover:bg-bad-bg hover:text-bad sm:col-span-1"
                >
                  ✕
                </button>
              ) : (
                <span className="hidden w-7 sm:block" />
              )}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 items-center gap-2 bg-surface-soft px-3 py-2.5 text-[13.5px] font-bold sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <span className="col-span-2 tracking-[0.06em] uppercase sm:col-span-1">{t("total")}</span>
          <span className={`num text-right ${full ? "" : "text-bad"}`}>%{trim(pctTotal)}</span>
          <span className="num text-right">{gramTotal.toFixed(2)} g</span>
          <span className="hidden w-7 sm:block" />
        </div>
      </div>
      {!full && (
        <p role="alert" className="m-0 rounded-[9px] bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
          {t("notFull", { sum: trim(pctTotal) })}
        </p>
      )}
      <p className="m-0 text-[11.5px] text-muted">{t("hint")}</p>
    </div>
  );
}
