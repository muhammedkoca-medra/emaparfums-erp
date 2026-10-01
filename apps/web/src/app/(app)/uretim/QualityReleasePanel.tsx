"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export interface QualityLot {
  lotId: string;
  lotNo: string;
  qcStatus: string;
  item: { code: string; name: string; type: string };
  tests: { id: string; code: string; name: string; passed: boolean }[];
}

/**
 * Kalite kontrol aşamasında tek adım onay. Kullanıcı her testi tek tek "geçti" olarak işaretler;
 * hepsi işaretlenmeden onay düğmesi açılmaz (KAL-02). Onayla lotlar serbest kalır, ürün satışa açılır.
 */
export function QualityReleasePanel({ batchId, lots, canApprove }: { batchId: string; lots: QualityLot[]; canApprove: boolean }) {
  const t = useTranslations("production.quality");
  const router = useRouter();
  const pending = lots.filter((l) => l.qcStatus === "QUARANTINE");
  const allTests = [...new Map(pending.flatMap((l) => l.tests).map((x) => [x.id, x])).values()];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const allChecked = allTests.every((x) => checked.has(x.id));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function release() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost<{ released: string[] }>(`/production/batches/${batchId}/quality-release`, { passedTestIds: [...checked] });
      setMsg({ ok: true, text: t("done", { lots: res.released.join(", ") }) });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("approve")) });
    } finally {
      setBusy(false);
    }
  }

  const statusTone = (s: string) => (s === "RELEASED" ? "bg-ok-bg text-ok" : s === "REJECTED" ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn");

  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-gold-2 bg-surface p-5">
      <div>
        <h3 className="m-0 font-display text-[16px] font-semibold">{t("title")}</h3>
        <p className="m-0 text-[12px] text-muted">{t("subtitle")}</p>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
        {lots.map((l) => (
          <li key={l.lotId} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface-soft px-3 py-2">
            <span>
              <strong className="num">{l.lotNo}</strong> · {l.item.code} · {l.item.name}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(l.qcStatus)}`}>{t(`status.${l.qcStatus}`)}</span>
          </li>
        ))}
      </ul>

      {pending.length === 0 ? (
        <p className={alertOk}>{t("allReleased")}</p>
      ) : !canApprove ? (
        <p className="m-0 text-[12.5px] text-muted">{t("noPermission")}</p>
      ) : (
        <>
          {allTests.length > 0 ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 text-[13px] font-semibold">{t("checklist")}</legend>
              {allTests.map((x) => (
                <label key={x.id} className="flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-line px-3 py-2 text-[13px] hover:border-gold-2">
                  <input type="checkbox" checked={checked.has(x.id)} onChange={() => toggle(x.id)} className="h-4 w-4 accent-[#b8864b]" />
                  <span className="font-medium">{x.name}</span>
                  <span className="num text-[11px] text-muted">{x.code}</span>
                </label>
              ))}
              <button type="button" className={`${secondaryBtn} self-start`} onClick={() => setChecked(new Set(allTests.map((x) => x.id)))}>
                {t("checkAll")}
              </button>
            </fieldset>
          ) : (
            <p className="m-0 text-[12.5px] text-muted">{t("noTests")}</p>
          )}
          <button type="button" disabled={busy || !allChecked} onClick={() => void release()} className={`${primaryBtn} self-start`}>
            {busy ? t("approving") : t("approve")}
          </button>
          {!allChecked && <p className="m-0 text-[11.5px] text-muted">{t("checkAllHint")}</p>}
        </>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
