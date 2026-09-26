"use client";

import { ORDER_TRANSITIONS, type OrderStatus } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, inputCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** Sipariş durum geçişi (SAL-07): yalnızca izinli hedef durumlar gösterilir. */
export function OrderTransition({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const options = ORDER_TRANSITIONS[status] ?? [];
  const [to, setTo] = useState<OrderStatus | "">(options[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (options.length === 0) return null;

  async function apply() {
    if (!to) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/sales/orders/${orderId}/transition`, { to });
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("transitioned")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("transitionTo")}
          <select value={to} onChange={(e) => setTo(e.target.value as OrderStatus)} className={inputCls}>
            {options.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={apply} className={primaryBtn}>
          {t("transition")}
        </button>
      </div>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </div>
  );
}
