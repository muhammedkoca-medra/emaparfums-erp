"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPatch, apiPost, errorText } from "@/lib/api-client";
import { fmtQty } from "@/lib/format";

export interface CountLine {
  id: string;
  item: { code: string; name: string; uom: string };
  lotNo: string;
  locationCode: string;
  systemQty: string | null;
  countedQty: string | null;
  diff: string | null;
}

/** Sayım satırları: sayılan miktar girişi, gönderme, onay/ret. */
export function CountEditor({
  id,
  status,
  lines,
  systemHidden,
  canEdit,
  canApprove,
  thresholdLabel,
}: {
  id: string;
  status: "OPEN" | "SUBMITTED" | "APPROVED";
  lines: CountLine[];
  systemHidden: boolean;
  canEdit: boolean;
  canApprove: boolean;
  thresholdLabel: string;
}) {
  const t = useTranslations("stock");
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.id, l.countedQty ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = status === "OPEN" && canEdit;

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("form.genericError")) });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    apiPatch(`/stock/counts/${id}/lines`, {
      lines: Object.entries(values)
        .filter(([, v]) => v.trim() !== "")
        .map(([lineId, v]) => ({ lineId, countedQty: v.trim().replace(",", ".") })),
    });

  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2 align-middle";

  return (
    <section className="flex flex-col gap-3 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
      <table className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={th}>{t("col.location")}</th>
            <th className={th}>{t("col.item")}</th>
            <th className={th}>{t("col.lot")}</th>
            <th className={`${th} text-right`}>{t("counts.system")}</th>
            <th className={`${th} text-right`}>{t("counts.counted")}</th>
            <th className={`${th} text-right`}>{t("counts.diff")}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const uom = t.has(`uom.${l.item.uom}`) ? t(`uom.${l.item.uom}`) : l.item.uom;
            const diff = l.diff === null ? null : Number(l.diff);
            return (
              <tr key={l.id}>
                <td className={`${td} num font-semibold`}>{l.locationCode}</td>
                <td className={td}>
                  {l.item.code} · {l.item.name}
                </td>
                <td className={`${td} num`}>{l.lotNo}</td>
                <td className={`${td} num text-right text-text-2`}>
                  {systemHidden ? t("counts.hidden") : `${fmtQty(l.systemQty)} ${uom}`}
                </td>
                <td className={`${td} text-right`}>
                  {editable ? (
                    <input
                      aria-label={`${t("counts.counted")} · ${l.item.code} · ${l.lotNo}`}
                      inputMode="decimal"
                      value={values[l.id] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
                      className={`${inputCls} num max-w-[120px] text-right`}
                    />
                  ) : (
                    <span className="num font-semibold">
                      {l.countedQty === null ? "—" : `${fmtQty(l.countedQty)} ${uom}`}
                    </span>
                  )}
                </td>
                <td
                  className={`${td} num text-right font-semibold ${diff === null || diff === 0 ? "text-text-2" : diff > 0 ? "text-ok" : "text-bad"}`}
                >
                  {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmtQty(l.diff)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editable && (
        <>
          <p className="m-0 text-xs text-muted">{t("counts.submitHint", { threshold: thresholdLabel })}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={secondaryBtn}
              onClick={() => run(save, t("form.saved"))}
            >
              {t("counts.saveLines")}
            </button>
            <button
              type="button"
              disabled={busy}
              className={primaryBtn}
              onClick={() =>
                run(async () => {
                  await save();
                  await apiPost(`/stock/counts/${id}/submit`);
                }, t("form.saved"))
              }
            >
              {t("counts.submit")}
            </button>
          </div>
        </>
      )}

      {status === "SUBMITTED" && canApprove && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className={primaryBtn}
            onClick={() =>
              run(() => apiPost(`/stock/counts/${id}/decide`, { decision: "APPROVE" }), t("counts.done"))
            }
          >
            {t("counts.approve")}
          </button>
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() =>
              run(() => apiPost(`/stock/counts/${id}/decide`, { decision: "REJECT" }), t("form.saved"))
            }
          >
            {t("counts.reject")}
          </button>
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
