"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPatch, errorText } from "@/lib/api-client";

/** Kalem kartı düzenleme (min. stok, raf ömrü, saklama). Kod, tür ve birim değişmez. */
export function ItemEditForm({
  item,
}: {
  item: {
    id: string;
    name: string;
    minStock: string | null;
    reorderQty?: string | null;
    shelfLifeDays: number | null;
    storageNote: string | null;
    isHazardous: boolean;
  };
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const opt = (k: string) => {
      const v = String(d.get(k) ?? "").trim().replace(",", ".");
      return v === "" ? null : v;
    };
    setBusy(true);
    setMsg(null);
    try {
      await apiPatch(`/catalog/items/${item.id}`, {
        name: d.get("name"),
        minStock: opt("minStock"),
        shelfLifeDays: opt("shelfLifeDays") ? Number(opt("shelfLifeDays")) : null,
        storageNote: opt("storageNote"),
        isHazardous: d.get("isHazardous") === "on",
      });
      setMsg({ ok: true, text: t("form.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("form.saved")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("form.edit")} className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("form.edit")}</h2>
      <label className={labelCls}>
        {t("form.itemName")}
        <input name="name" defaultValue={item.name} required minLength={2} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.minStock")}
          <input name="minStock" defaultValue={item.minStock ? String(Number(item.minStock)) : ""} inputMode="decimal" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.shelfLife")}
          <input name="shelfLifeDays" type="number" min={1} defaultValue={item.shelfLifeDays ?? ""} className={inputCls} />
        </label>
      </div>
      <label className={labelCls}>
        {t("form.storage")}
        <input name="storageNote" defaultValue={item.storageNote ?? ""} maxLength={200} className={inputCls} />
      </label>
      <label className="flex min-h-9 items-center gap-2 text-[13px]">
        <input type="checkbox" name="isHazardous" defaultChecked={item.isHazardous} className="h-4 w-4 accent-[#1c1815]" />
        {t("form.hazardous")}
      </label>
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {busy ? t("form.saving") : t("form.save")}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
