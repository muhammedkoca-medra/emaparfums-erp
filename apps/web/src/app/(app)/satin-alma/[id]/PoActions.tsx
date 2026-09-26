"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

interface Line {
  id: string;
  item: { code: string; name: string; uom: string };
  qty: string;
  receivedQty: string;
}

/** Sipariş aksiyonları: gönder, onayla, mal kabul. */
export function PoActions({
  id,
  status,
  lines,
  canCreate,
  canApprove,
}: {
  id: string;
  status: string;
  lines: Line[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("purchasing");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rcv, setRcv] = useState<Record<string, string>>({});

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

  const canReceive = ["ORDERED", "IN_TRANSIT", "RECEIVING"].includes(status) && canCreate;

  async function submitReceipt() {
    const rows = lines
      .map((l) => ({ poLineId: l.id, qty: (rcv[l.id] ?? "").replace(",", ".") }))
      .filter((r) => r.qty && Number(r.qty) > 0);
    if (rows.length === 0) return;
    await run(() => apiPost(`/purchasing/orders/${id}/receipts`, { lines: rows }), t("received"));
    setRcv({});
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "REQUESTED" && canCreate && (
          <button type="button" disabled={busy} className={primaryBtn} onClick={() => run(() => apiPost(`/purchasing/orders/${id}/submit`), t("submitted"))}>
            {t("submit")}
          </button>
        )}
        {status === "PENDING_APPROVAL" && canApprove && (
          <button type="button" disabled={busy} className={primaryBtn} onClick={() => run(() => apiPost(`/purchasing/orders/${id}/approve`), t("approved"))}>
            {t("approve")}
          </button>
        )}
        {["RECEIVING", "CLOSED"].includes(status) && canCreate && (
          <button type="button" disabled={busy} className={secondaryBtn} onClick={() => run(() => apiPost(`/purchasing/orders/${id}/invoice`), t("invoiced"))}>
            {t("incomingInvoice")}
          </button>
        )}
      </div>

      {canReceive && (
        <section className="flex flex-col gap-2 rounded-[12px] border border-line-soft p-3">
          <h3 className="m-0 text-[14px] font-bold">{t("section.receive")}</h3>
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 text-[13px]">
              <span>
                {l.item.code} · {l.item.name}{" "}
                <span className="text-muted">
                  ({Number(l.receivedQty)}/{Number(l.qty)})
                </span>
              </span>
              <input
                aria-label={`${t("receiveQty")} ${l.item.code}`}
                inputMode="decimal"
                value={rcv[l.id] ?? ""}
                onChange={(e) => setRcv({ ...rcv, [l.id]: e.target.value })}
                placeholder={t("receiveQty")}
                className={inputCls}
              />
            </div>
          ))}
          <button type="button" disabled={busy} className={`${secondaryBtn} self-start`} onClick={submitReceipt}>
            {t("receiveBtn")}
          </button>
        </section>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
