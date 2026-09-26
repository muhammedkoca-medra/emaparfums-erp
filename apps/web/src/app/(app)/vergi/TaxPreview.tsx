"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, secondaryBtn } from "@/components/ui";
import { apiGetClient, errorText } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";

interface Preview {
  net: string;
  otv: string;
  kdvBase: string;
  kdv: string;
  gross: string;
  otvRate: string;
  kdvRate: string;
}

/** Hesap API'de (packages/shared/src/tax.ts); burada yalnızca gösterim. */
export function TaxPreview({ categories }: { categories: string[] }) {
  const t = useTranslations("tax.preview");
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const q = new URLSearchParams({
      category: String(d.get("category") ?? ""),
      gross: String(d.get("gross") ?? "").replace(",", "."),
    });
    const date = String(d.get("date") ?? "");
    if (date) q.set("date", date);
    setBusy(true);
    setError(null);
    try {
      setResult(await apiGetClient<Preview>(`/tax/preview?${q}`));
    } catch (err) {
      setResult(null);
      setError(errorText(err, t("calc")));
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between gap-3 border-t border-line-soft py-1.5 ${strong ? "font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="num m-0">{fmtMoney(v)}</dd>
    </div>
  );

  return (
    <section className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("title")}</h2>
      <p className="m-0 text-xs text-muted">{t("hint")}</p>
      <form onSubmit={onSubmit} aria-label={t("title")} className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className={labelCls}>
          {t("category")}
          <select name="category" required className={inputCls} defaultValue={categories[0]}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("gross")}
          <input name="gross" inputMode="decimal" required className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("date")}
          <input name="date" type="date" className={inputCls} />
        </label>
        <button type="submit" disabled={busy} className={secondaryBtn}>
          {t("calc")}
        </button>
      </form>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      {result && (
        <dl className="m-0 text-[13px]" aria-label={t("title")}>
          {row(t("net"), result.net)}
          {row(t("otv"), result.otv)}
          {row(t("kdvBase"), result.kdvBase)}
          {row(t("kdv"), result.kdv)}
          {row(t("gross2"), result.gross, true)}
        </dl>
      )}
    </section>
  );
}
