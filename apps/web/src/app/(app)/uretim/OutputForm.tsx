"use client";

import { fillingBalance } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtQty } from "@/lib/format";

interface OutputResult {
  lotNo: string | null;
  producedQty: number;
  tester: { lotNo: string; ml: string } | null;
  warnings: string[];
}

/**
 * URT-05: dolum dağılımı. Satılabilir stoğa giden adet + ayrı (satılamaz) tester stoğuna giden ml + fire ml.
 * Lotlar karantinada açılır; satış kalite onayından sonra açılır. Partinin hacmiyle anlık mutabakat gösterilir.
 */
export function OutputForm({
  batchId,
  plannedQty,
  plannedMl,
  volumeMl,
}: {
  batchId: string;
  plannedQty: number;
  plannedMl: string | null;
  volumeMl: number;
}) {
  const t = useTranslations("production.output");
  const router = useRouter();
  const [producedQty, setProducedQty] = useState(String(plannedQty));
  const [testerMl, setTesterMl] = useState("0");
  const [scrapMl, setScrapMl] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; warnings?: string[] } | null>(null);

  const num = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? v.trim() : "0");
  const units = Number.isInteger(Number(producedQty)) && Number(producedQty) >= 0 ? Number(producedQty) : 0;
  const balance = plannedMl
    ? fillingBalance({ plannedMl, volumeMl, producedQty: units, testerMl: num(testerMl), scrapMl: num(scrapMl) })
    : null;
  const diff = balance ? Number(balance.differenceMl) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost<OutputResult>(`/production/batches/${batchId}/output`, {
        producedQty: units,
        testerMl: num(testerMl),
        scrapMl: num(scrapMl),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const parts = [
        res.lotNo ? t("doneStock", { lot: res.lotNo, qty: res.producedQty }) : null,
        res.tester ? t("doneTester", { lot: res.tester.lotNo, ml: fmtQty(res.tester.ml) }) : null,
      ].filter(Boolean);
      setMsg({ ok: true, text: `${parts.join(" ")} ${t("doneQc")}`, warnings: res.warnings });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("submit")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-line bg-surface p-5">
      <div>
        <h3 className="m-0 font-display text-[16px] font-semibold">{t("title")}</h3>
        <p className="m-0 text-[12px] text-muted">{t("subtitle")}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelCls}>
            <span>
              {t("toStock")} <span className="font-normal text-muted">({t("unitPcs")})</span>
            </span>
            <input className={`${inputCls} num`} type="number" min={0} step={1} value={producedQty} onChange={(e) => setProducedQty(e.target.value)} required />
            <span className="text-[11px] font-normal text-muted">{t("toStockHint", { vol: volumeMl })}</span>
          </label>
          <label className={labelCls}>
            <span>
              {t("tester")} <span className="font-normal text-muted">(ml)</span>
            </span>
            <input className={`${inputCls} num`} type="number" min={0} step="0.01" value={testerMl} onChange={(e) => setTesterMl(e.target.value)} />
            <span className="text-[11px] font-normal text-muted">{t("testerHint")}</span>
          </label>
          <label className={labelCls}>
            <span>
              {t("scrap")} <span className="font-normal text-muted">(ml)</span>
            </span>
            <input className={`${inputCls} num`} type="number" min={0} step="0.01" value={scrapMl} onChange={(e) => setScrapMl(e.target.value)} />
            <span className="text-[11px] font-normal text-muted">{t("scrapHint")}</span>
          </label>
        </div>

        {balance && (
          <div
            className={`flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[12px] px-4 py-3 text-[12.5px] ${
              diff === 0 ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
            }`}
          >
            <span className="num">
              {t("batchVolume")}: <strong>{fmtQty(plannedMl!)} ml</strong>
            </span>
            <span className="num">
              {t("distributed")}: <strong>{fmtQty(balance.distributedMl)} ml</strong>
            </span>
            <span className="num font-semibold">
              {diff === 0 ? t("balanced") : diff > 0 ? t("unaccounted", { ml: fmtQty(balance.differenceMl) }) : t("over", { ml: fmtQty(String(Math.abs(diff))) })}
            </span>
          </div>
        )}

        <label className={labelCls}>
          {t("note")}
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
        <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
          {t("submit")}
        </button>
        {msg && (
          <div role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
            {msg.text}
            {msg.warnings?.map((w) => (
              <p key={w} className="m-0 mt-1 text-warn">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
