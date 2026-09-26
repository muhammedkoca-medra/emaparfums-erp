"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** Fatura aksiyonları: PDF, yeniden gönder (hata), iptal, iade. Yetkiye göre. */
export function InvoiceActions({
  id,
  status,
  ettn,
  type,
  canEdit,
  canApprove,
  canCreate,
}: {
  id: string;
  status: string;
  ettn: string | null;
  type: string;
  canEdit: boolean;
  canApprove: boolean;
  canCreate: boolean;
}) {
  const t = useTranslations("invoices");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, ok) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {ettn && (
          <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className={`${secondaryBtn} no-underline`}>
            {t("pdf")}
          </a>
        )}
        {status === "ERROR" && canEdit && (
          <button type="button" disabled={busy} className={primaryBtn} onClick={() => run(() => apiPost(`/invoices/${id}/retry`), t("retried"))}>
            {t("retry")}
          </button>
        )}
        {status !== "CANCELLED" && type !== "RETURN" && canCreate && (
          <button type="button" disabled={busy} className={secondaryBtn} onClick={() => run(() => apiPost(`/invoices/${id}/return`), t("returned"))}>
            {t("return")}
          </button>
        )}
        {status !== "CANCELLED" && canApprove && (
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() => {
              const reason = window.prompt(t("cancelReason"));
              if (reason) void run(() => apiPost(`/invoices/${id}/cancel`, { reason }), t("cancelled"));
            }}
          >
            {t("cancel")}
          </button>
        )}
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
