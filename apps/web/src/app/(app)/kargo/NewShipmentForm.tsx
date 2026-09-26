"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

interface Ref {
  id: string;
  label: string;
}

export function NewShipmentForm({ orders, carriers }: { orders: Ref[]; carriers: Ref[] }) {
  const t = useTranslations("shipping");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/shipping/shipments", {
        orderId: d.get("orderId"),
        carrierId: d.get("carrierId"),
        desi: String(d.get("desi") ?? "").trim() || undefined,
        isDangerousGoods: d.get("isDangerousGoods") === "on",
      });
      router.push(`/kargo/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  if (orders.length === 0) {
    return (
      <section className="self-start rounded-[16px] border border-line bg-surface p-5">
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">{t("new")}</h2>
        <p className="m-0 text-[13px] text-muted">{t("form.noOrders")}</p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("new")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("new")}</h2>
      <label className={labelCls}>
        {t("form.order")}
        <select name="orderId" required className={inputCls} defaultValue="">
          <option value="" disabled>
            {t("form.choose")}
          </option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.carrier")}
          <select name="carrierId" required className={inputCls} defaultValue="">
            <option value="" disabled>
              {t("form.choose")}
            </option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("form.desi")}
          <input name="desi" inputMode="decimal" defaultValue="1" className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="isDangerousGoods" className="h-4 w-4 accent-[#1c1815]" />
        {t("form.dangerous")}
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
