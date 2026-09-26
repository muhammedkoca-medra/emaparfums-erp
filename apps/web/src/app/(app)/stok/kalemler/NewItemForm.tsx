"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

const TYPES = ["RAW_MATERIAL", "PACKAGING", "SEMI_FINISHED", "FINISHED_GOOD", "SAMPLE"] as const;
const UOMS = ["KG", "G", "L", "ML", "PCS"] as const;

export function NewItemForm() {
  const t = useTranslations("catalog");
  const ts = useTranslations("stock");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const opt = (k: string) => {
      const v = String(d.get(k) ?? "").trim().replace(",", ".");
      return v === "" ? undefined : v;
    };
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/catalog/items", {
        code: d.get("code"),
        name: d.get("name"),
        type: d.get("type"),
        uom: d.get("uom"),
        minStock: opt("minStock"),
        shelfLifeDays: opt("shelfLifeDays") ? Number(opt("shelfLifeDays")) : undefined,
        storageNote: opt("storageNote"),
        isHazardous: d.get("isHazardous") === "on",
      });
      router.push(`/stok/kalem/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("newItem")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("newItem")}</h2>
      <label className={labelCls}>
        {t("form.code")}
        <input name="code" required className={inputCls} />
      </label>
      <label className={labelCls}>
        {t("form.itemName")}
        <input name="name" required minLength={2} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.type")}
          <select name="type" className={inputCls} defaultValue="RAW_MATERIAL">
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {ts(`type.${x}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("form.uom")}
          <select name="uom" className={inputCls} defaultValue="KG">
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {ts(`uom.${u}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("form.minStock")}
          <input name="minStock" inputMode="decimal" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.shelfLife")}
          <input name="shelfLifeDays" type="number" min={1} className={inputCls} />
        </label>
      </div>
      <label className={labelCls}>
        {t("form.storage")}
        <input name="storageNote" maxLength={200} className={inputCls} />
      </label>
      <label className="flex min-h-9 items-center gap-2 text-[13px]">
        <input type="checkbox" name="isHazardous" className="h-4 w-4 accent-[#1c1815]" />
        {t("form.hazardous")}
      </label>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {busy ? t("form.saving") : t("form.save")}
      </button>
    </form>
  );
}
