"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { type InspectionDetail } from "./page";

type Decision = "pass" | "fail" | "none";

export function InspectionForm({ inspection, canEdit, canApprove }: { inspection: InspectionDetail; canEdit: boolean; canApprove: boolean }) {
  const t = useTranslations("quality");
  const router = useRouter();
  const [rows, setRows] = useState(
    inspection.tests.map((x) => ({ testId: x.testId, code: x.code, name: x.name, value: x.value ?? "", decision: (x.passed === true ? "pass" : x.passed === false ? "fail" : "none") as Decision })),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const locked = inspection.status === "PASSED" || inspection.lot.qcStatus === "RELEASED";

  async function record() {
    const results = rows.filter((r) => r.decision !== "none").map((r) => ({ testId: r.testId, passed: r.decision === "pass", value: r.value.trim() || undefined }));
    if (results.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost(`/quality/inspections/${inspection.id}/results`, { results });
      setMsg({ ok: true, text: t("recorded") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("recordResults")) });
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPost(`/quality/inspections/${inspection.id}/release`, {});
      setMsg({ ok: true, text: t("released") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("releaseBlocked")) });
    } finally {
      setBusy(false);
    }
  }

  const pill: Record<string, string> = { QUARANTINE: "bg-warn-bg text-warn", RELEASED: "bg-ok-bg text-ok", REJECTED: "bg-bad-bg text-bad" };

  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="m-0 font-display text-[17px] font-semibold">{t("tests")}</h2>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${pill[inspection.lot.qcStatus] ?? "bg-surface-soft"}`}>{t(`lotQc.${inspection.lot.qcStatus}`)}</span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r, i) => (
          <li key={r.testId} className="flex flex-wrap items-center gap-2 border-t border-line-soft py-2 first:border-t-0">
            <span className="min-w-40 flex-1 text-[14px] font-semibold">
              <span className="num mr-2 text-muted">{r.code}</span>
              {r.name}
            </span>
            <input className={`${inputCls} h-9 w-32`} placeholder={t("value")} value={r.value} disabled={locked || !canEdit} onChange={(e) => set(i, { value: e.target.value })} />
            <div className="flex gap-1">
              <button type="button" disabled={locked || !canEdit} onClick={() => set(i, { decision: r.decision === "pass" ? "none" : "pass" })} className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold ${r.decision === "pass" ? "bg-ok text-on-ink" : "bg-surface-soft text-muted"}`}>
                {t("test.pass")}
              </button>
              <button type="button" disabled={locked || !canEdit} onClick={() => set(i, { decision: r.decision === "fail" ? "none" : "fail" })} className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold ${r.decision === "fail" ? "bg-bad text-on-ink" : "bg-surface-soft text-muted"}`}>
                {t("test.fail")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!locked && (
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" disabled={busy} onClick={record} className={secondaryBtn}>
              {t("recordResults")}
            </button>
          )}
          {canApprove && (
            <button type="button" disabled={busy} onClick={release} className={primaryBtn}>
              {t("release")}
            </button>
          )}
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
