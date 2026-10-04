"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";

export interface PendingActions {
  refunds: { paymentId: string; amount: string; provider: { code: string; name: string } }[];
  invoices: { invoiceId: string; number: string | null; status: string; type: string }[];
}

/**
 * İptal/iade sonrası onay bekleyen para işlemleri. Stok ve sadakat puanı iptalde otomatik geri alınır;
 * ödeme iadesi ve fatura iptali yanlış iptalde para çıkmasın diye burada tek tıkla, gerekçeyle onaylanır.
 */
export function CancellationActions({
  actions,
  canRefund,
  canCancelInvoice,
}: {
  actions: PendingActions;
  canRefund: boolean;
  canCancelInvoice: boolean;
}) {
  const t = useTranslations("orders.cancellation");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(key: string, path: string, defaultReason: string, ok: string) {
    const reason = window.prompt(t("reasonPrompt"), defaultReason);
    if (!reason || reason.trim().length < 3) return;
    setBusy(key);
    setMsg(null);
    try {
      await apiPost(path, { reason: reason.trim() });
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("failed")) });
    } finally {
      setBusy(null);
    }
  }

  const empty = actions.refunds.length === 0 && actions.invoices.length === 0;

  return (
    <section className={`flex flex-col gap-3 rounded-[16px] border p-5 ${empty ? "border-line bg-surface" : "border-warn/40 bg-warn-bg/40"}`}>
      <div>
        <h2 className="m-0 font-display text-[17px] font-semibold">{t("title")}</h2>
        <p className="m-0 text-[12px] text-muted">{t("subtitle")}</p>
      </div>
      {empty ? (
        <p className={alertOk}>{t("done")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
          {actions.refunds.map((r) => (
            <li key={r.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface px-3 py-2.5">
              <span>
                {t("refundLine", { provider: r.provider.name })} · <strong className="num">{fmtMoney(r.amount)}</strong>
              </span>
              {canRefund ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(r.paymentId, `/payments/${r.paymentId}/refund`, t("refundReason"), t("refunded"))}
                  className="rounded-[8px] bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-ink disabled:opacity-50"
                >
                  {busy === r.paymentId ? t("working") : t("refund")}
                </button>
              ) : (
                <span className="text-[11.5px] text-muted">{t("noPermission")}</span>
              )}
            </li>
          ))}
          {actions.invoices.map((i) => (
            <li key={i.invoiceId} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface px-3 py-2.5">
              <span>
                {t("invoiceLine", { number: i.number ?? "—" })} <span className="text-[11.5px] text-muted">({i.status})</span>
              </span>
              {canCancelInvoice ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(i.invoiceId, `/invoices/${i.invoiceId}/cancel`, t("invoiceReason"), t("invoiceCancelled"))}
                  className="rounded-[8px] border border-bad/40 px-3 py-1.5 text-[12.5px] font-semibold text-bad hover:bg-bad hover:text-white disabled:opacity-50"
                >
                  {busy === i.invoiceId ? t("working") : t("cancelInvoice")}
                </button>
              ) : (
                <span className="text-[11.5px] text-muted">{t("noPermission")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
