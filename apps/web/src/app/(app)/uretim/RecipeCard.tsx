import { getTranslations } from "next-intl/server";
import { fmtQty } from "@/lib/format";

/** Gram 2 ondalık (92,32 g), yüzde en az 1 ondalık (%23,0) — üretimdeki kâğıt reçeteyle aynı. */
const g2 = (v: string | number) => Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const p1 = (v: string | number) => Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export interface BatchComponentView {
  itemId: string;
  code: string;
  name: string;
  role: string;
  pct: string;
  grams: string;
}

/**
 * Tartım kartı: kütlesel reçetenin parti için gram karşılığı (terazide tartılacak miktarlar) ve
 * otomatik atanan lot numarası. Tablo düzeni üretimdeki kâğıt reçeteyle aynıdır (Bileşen · % · Gram).
 */
export async function RecipeCard({
  lotNo,
  plannedMl,
  densityGPerMl,
  totalGr,
  components,
}: {
  lotNo: string | null;
  plannedMl: string | null;
  densityGPerMl: string | null;
  totalGr: string | number | null;
  components: BatchComponentView[];
}) {
  const t = await getTranslations("production.recipe");
  const pctSum = components.reduce((s, c) => s + Number(c.pct), 0);
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-gold-2/60 bg-surface p-5" aria-label={t("cardTitle")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 font-display text-[18px] font-semibold">{t("cardTitle")}</h3>
          <p className="m-0 text-[12.5px] text-muted">
            {t("caption", { ml: plannedMl ? fmtQty(plannedMl) : "—" })}
            {densityGPerMl && ` · ${t("densityShort", { d: fmtQty(densityGPerMl) })}`}
          </p>
        </div>
        {lotNo && (
          <span className="flex flex-col items-end">
            <span className="text-[10.5px] font-bold tracking-[0.1em] text-muted uppercase">{t("lotNo")}</span>
            <span className="num font-display text-[20px] font-semibold text-gold-text">{lotNo}</span>
          </span>
        )}
      </div>
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] tracking-[0.06em] text-muted uppercase">
            <th className="py-2 font-bold">{t("component")}</th>
            <th className="py-2 text-right font-bold">{t("pct")}</th>
            <th className="py-2 text-right font-bold">{t("grams")}</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.itemId} className="border-b border-line-soft">
              <td className="py-2.5">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.role === "ESSENCE" ? "bg-gold" : "bg-line"}`} aria-hidden />
                  <span className="flex flex-col">
                    <span className="font-semibold">{c.name}</span>
                    <span className="num text-[11px] text-muted">
                      {c.code} · {t(`role.${c.role}`)}
                    </span>
                  </span>
                </span>
              </td>
              <td className="num py-2.5 text-right">%{p1(c.pct)}</td>
              <td className={`num py-2.5 text-right font-semibold ${c.role === "ESSENCE" ? "text-gold-text" : ""}`}>{g2(c.grams)} g</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-soft font-bold">
            <td className="px-1 py-2.5 tracking-[0.06em] uppercase">{t("total")}</td>
            <td className="num py-2.5 text-right">%{p1(pctSum)}</td>
            <td className="num py-2.5 pr-1 text-right">{totalGr != null ? `${g2(totalGr)} g` : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
