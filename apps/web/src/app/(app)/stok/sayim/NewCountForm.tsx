"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export function NewCountForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const t = useTranslations("stock");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const zone = String(d.get("zone") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/stock/counts", {
        warehouseId: d.get("warehouseId"),
        isBlind: d.get("isBlind") === "on",
        ...(zone ? { zone } : {}),
      });
      router.push(`/stok/sayim/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.genericError")));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={t("counts.new")}
      className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5"
    >
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("counts.new")}</h2>
      <label className={labelCls}>
        {t("counts.warehouse")}
        <select name="warehouseId" required className={inputCls}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        {t("counts.zone")}
        <input name="zone" maxLength={20} className={inputCls} />
      </label>
      <label className="flex min-h-9 items-center gap-2 text-[13px]">
        <input type="checkbox" name="isBlind" defaultChecked className="h-4 w-4 accent-[#1c1815]" />
        {t("counts.blind")}
      </label>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {t("counts.create")}
      </button>
    </form>
  );
}
