"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

const CONCENTRATIONS = ["EXTRAIT", "EDP", "EDT", "EDC", "COLOGNE", "OTHER"] as const;

/** Mamul kalemden ürün kartı açar (ticari bilgi: SKU, barkod, GTİP, vergi kategorisi). */
export function NewProductForm({
  items,
  categories,
}: {
  items: { id: string; label: string; name: string }[];
  categories: string[];
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const barcode = String(d.get("barcode") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/catalog/products", {
        itemId: d.get("itemId"),
        sku: d.get("sku"),
        name: d.get("name"),
        concentration: d.get("concentration"),
        volumeMl: Number(d.get("volumeMl")),
        gtip: d.get("gtip"),
        taxCategory: d.get("taxCategory"),
        ...(barcode ? { barcode } : {}),
      });
      router.push(`/urunler/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("newProduct")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("newProduct")}</h2>
      {items.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t("form.noFreeItems")}</p>
      ) : (
        <>
          <label className={labelCls}>
            {t("form.item")}
            <select
              name="itemId"
              required
              className={inputCls}
              defaultValue=""
              onChange={(e) => setName(items.find((i) => i.id === e.target.value)?.name ?? "")}
            >
              <option value="">{t("form.choose")}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("form.name")}
            <input name="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              {t("form.sku")}
              <input name="sku" required className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.volume")}
              <input name="volumeMl" type="number" min={1} max={5000} required className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.concentration")}
              <select name="concentration" className={inputCls} defaultValue="EDP">
                {CONCENTRATIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`concentration.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {t("form.taxCategory")}
              <select name="taxCategory" className={inputCls} required>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={labelCls}>
            {t("form.gtip")}
            <input name="gtip" required defaultValue="3303.00" className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.barcode")}
            <input name="barcode" inputMode="numeric" maxLength={13} className={inputCls} />
          </label>
          {error && (
            <p role="alert" className={alertErr}>
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {busy ? t("form.saving") : t("form.save")}
          </button>
        </>
      )}
    </form>
  );
}
