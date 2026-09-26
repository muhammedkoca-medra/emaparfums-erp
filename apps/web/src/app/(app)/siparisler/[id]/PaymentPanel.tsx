"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Pill, type Tone } from "@/components/Pill";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";

interface Payment {
  id: string;
  status: string;
  amount: string;
  currency: string;
  installments: number;
  provider: { code: string; name: string };
  failureCode: string | null;
  createdAt: string;
}

const TONE: Record<string, Tone> = { PENDING: "warn", AUTHORIZED: "info", CAPTURED: "ok", FAILED: "bad", REFUNDED: "neu", PARTIALLY_REFUNDED: "warn" };

/** Ödeme paneli: checkout başlat + sağlayıcı sonucu simülasyonu (yerel). Kart bilgisi alınmaz (ODM-01). */
export function PaymentPanel({ orderId, orderStatus, canPay, payments }: { orderId: string; orderStatus: string; canPay: boolean; payments: Payment[] }) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [installments, setInstallments] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pending = payments.find((p) => p.status === "PENDING");
  const captured = payments.some((p) => p.status === "CAPTURED");
  const canStart = canPay && !captured && (orderStatus === "NEW" || orderStatus === "PAYMENT_PENDING");

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("error")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[17px] font-semibold">{t("title")}</h2>

      {payments.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t("none")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 border-t border-line-soft py-2 first:border-t-0">
              <span className="flex flex-col">
                <span className="font-semibold">{p.provider.name}</span>
                <span className="text-xs text-muted">
                  {t("installments")}: {p.installments} · {p.failureCode ?? ""}
                </span>
              </span>
              <span className="num">{fmtMoney(p.amount)}</span>
              <Pill tone={TONE[p.status] ?? "neu"}>{t(`status.${p.status}`)}</Pill>
            </li>
          ))}
        </ul>
      )}

      {canStart && !pending && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("installments")}
            <select value={installments} onChange={(e) => setInstallments(e.target.value)} className={inputCls}>
              {[1, 2, 3, 6, 9, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} className={primaryBtn} onClick={() => run(() => apiPost("/payments/checkout", { orderId, installments: Number(installments) }), t("started"))}>
            {t("start")}
          </button>
        </div>
      )}

      {pending && canPay && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-surface-soft p-3">
          <span className="text-[12px] font-semibold text-muted">{t("simulate")}</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className={primaryBtn} onClick={() => run(() => apiPost(`/payments/${pending.id}/simulate`, { outcome: "CAPTURED" }), t("captured"))}>
              {t("simSuccess")}
            </button>
            <button type="button" disabled={busy} className={secondaryBtn} onClick={() => run(() => apiPost(`/payments/${pending.id}/simulate`, { outcome: "FAILED", failureCode: "declined" }), t("failed"))}>
              {t("simFail")}
            </button>
          </div>
        </div>
      )}

      <p className="m-0 text-[11px] text-muted">{t("noCard")}</p>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
