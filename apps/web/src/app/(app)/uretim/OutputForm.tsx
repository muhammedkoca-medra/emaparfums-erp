"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** URT-05: dolum çıktısı. FILLING aşamasında üretilen/fire adedi girilir; mamul lotu QUARANTINE açılır. */
export function OutputForm({ batchId, plannedQty }: { batchId: string; plannedQty: number }) {
  const t = useTranslations("production.output");
  const router = useRouter();
  const [producedQty, setProducedQty] = useState(String(plannedQty));
  const [scrapQty, setScrapQty] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost<{ lotNo: string }>(`/production/batches/${batchId}/output`, {
        producedQty: Number(producedQty),
        scrapQty: Number(scrapQty),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setMsg({ ok: true, text: t("done", { lot: res.lotNo }) });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("submit")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <div>
        <h3 className="m-0 font-display text-[16px] font-semibold">{t("title")}</h3>
        <p className="m-0 text-[12px] text-muted">{t("subtitle")}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            {t("produced")}
            <input className={`${inputCls} num`} type="number" min={1} value={producedQty} onChange={(e) => setProducedQty(e.target.value)} required />
          </label>
          <label className={labelCls}>
            {t("scrap")}
            <input className={`${inputCls} num`} type="number" min={0} value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} />
          </label>
        </div>
        <label className={labelCls}>
          {t("note")}
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
          {t("submit")}
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}
