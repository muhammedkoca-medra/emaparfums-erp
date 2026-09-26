"use client";

import { essencePct } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** Yeni üretim partisi: parfüm + esans/baz gramajı + demlenme + şişe. Konsantrasyon canlı hesaplanır. */
export function NewBatchForm({ products }: { products: { id: string; label: string }[] }) {
  const t = useTranslations("production");
  const router = useRouter();
  const [essence, setEssence] = useState("");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e = Number(essence.replace(",", ".")) || 0;
  const b = Number(base.replace(",", ".")) || 0;
  const pct = e + b > 0 ? essencePct(e, b).toFixed(1) : "0";

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/production/batches", {
        productId: d.get("productId"),
        plannedQty: Number(d.get("plannedQty")),
        essenceGr: essence.replace(",", "."),
        baseGr: base.replace(",", "."),
        macerationDays: Number(d.get("macerationDays")),
        macerationPlace: String(d.get("macerationPlace") ?? "").trim() || undefined,
        bottleType: d.get("bottleType"),
      });
      router.push(`/uretim/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  if (products.length === 0) {
    return (
      <section className="self-start rounded-[16px] border border-line bg-surface p-5">
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">{t("new")}</h2>
        <p className="m-0 text-[13px] text-muted">{t("form.noFormula")}</p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("new")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("new")}</h2>
      <label className={labelCls}>
        {t("form.product")}
        <select name="productId" required className={inputCls} defaultValue="">
          <option value="" disabled>
            {t("form.choose")}
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        {t("form.qty")}
        <input name="plannedQty" type="number" min={1} required className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.essenceGr")}
          <input name="essenceGr" inputMode="decimal" required value={essence} onChange={(ev) => setEssence(ev.target.value)} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.baseGr")}
          <input name="baseGr" inputMode="decimal" required value={base} onChange={(ev) => setBase(ev.target.value)} className={inputCls} />
        </label>
      </div>
      <p className="m-0 text-[12px] font-semibold text-gold-text">{t("form.concentrationHint", { pct })}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.macerationDays")}
          <input name="macerationDays" type="number" min={0} max={120} required defaultValue={14} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.bottleType")}
          <select name="bottleType" required className={inputCls} defaultValue="AMBER">
            <option value="AMBER">{t("bottle.AMBER")}</option>
            <option value="METAL">{t("bottle.METAL")}</option>
          </select>
        </label>
      </div>
      <label className={labelCls}>
        {t("form.macerationPlace")}
        <input name="macerationPlace" maxLength={80} className={inputCls} />
      </label>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {t("form.create")}
      </button>
    </form>
  );
}
