"use client";

import { BOTTLE_MODELS } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPatch, errorText } from "@/lib/api-client";

const CONCENTRATIONS = ["EXTRAIT", "EDP", "EDT", "EDC", "COLOGNE", "OTHER"] as const;
const STATUSES = ["DRAFT", "ACTIVE", "SALES_LOCKED", "DISCONTINUED"] as const;

/** Ticari kart düzenleme; değişiklik denetim kaydı ve product.updated olayı üretir. */
export function ProductForm({
  product,
  categories,
  canEdit,
}: {
  product: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
    concentration: string;
    volumeMl: number;
    gtip: string;
    taxCategory: string;
    status: string;
    bottleModel: string | null;
  };
  categories: string[];
  canEdit: boolean;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const next: Record<string, unknown> = {
      sku: d.get("sku"),
      name: d.get("name"),
      concentration: d.get("concentration"),
      volumeMl: Number(d.get("volumeMl")),
      gtip: d.get("gtip"),
      taxCategory: d.get("taxCategory"),
      status: d.get("status"),
      barcode: String(d.get("barcode") ?? "").trim() || null,
      bottleModel: String(d.get("bottleModel") ?? "").trim() || null,
    };
    // Yalnızca değişen alanlar gönderilir (olay ve denetim kaydı gerçek değişikliği gösterir)
    const changed = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => (product as Record<string, unknown>)[k] !== v),
    );
    if (Object.keys(changed).length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPatch<{ warnings: string[] }>(`/catalog/products/${product.id}`, changed);
      setMsg({ ok: true, text: res.warnings.length ? `${t("form.saved")} ${t("form.warnings")}: ${res.warnings.join("; ")}` : t("form.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("form.saved")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <fieldset disabled={!canEdit} className="m-0 flex flex-col gap-3 border-0 p-0">
        <label className={labelCls}>
          {t("form.name")}
          <input name="name" defaultValue={product.name} required minLength={2} className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            {t("form.sku")}
            <input name="sku" defaultValue={product.sku} required className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.volume")}
            <input name="volumeMl" type="number" min={1} defaultValue={product.volumeMl} required className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.concentration")}
            <select name="concentration" defaultValue={product.concentration} className={inputCls}>
              {CONCENTRATIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`concentration.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("form.status")}
            <select name="status" defaultValue={product.status} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("form.gtip")}
            <input name="gtip" defaultValue={product.gtip} required className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.taxCategory")}
            <select name="taxCategory" defaultValue={product.taxCategory} className={inputCls}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={labelCls}>
          {t("form.barcode")}
          <input name="barcode" defaultValue={product.barcode ?? ""} inputMode="numeric" maxLength={13} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.bottleModel")}
          <select name="bottleModel" defaultValue={product.bottleModel ?? ""} className={inputCls}>
            <option value="">{t("form.bottleNone")}</option>
            {BOTTLE_MODELS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {busy ? t("form.saving") : t("form.save")}
          </button>
        )}
      </fieldset>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
