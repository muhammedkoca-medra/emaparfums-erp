"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";

export interface ApprovalRow {
  id: string;
  entity: string;
  note: string | null;
  createdAt: string;
  requestedById: string;
  requestedBy: string | null;
  payload: { roleCode?: string; module?: string; action?: string; grant?: boolean } | null;
}

/** Bekleyen onaylar. Talep eden kendi talebini onaylayamaz (API dört göz kuralı). */
export function Approvals({
  rows,
  roleNames,
  canApprove,
}: {
  rows: ApprovalRow[];
  roleNames: Record<string, string>;
  canApprove: boolean;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/approvals/${id}/decide`, { decision });
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("genericError")));
    } finally {
      setBusy(null);
    }
  }

  const describe = (r: ApprovalRow) => {
    const p = r.payload ?? {};
    if (!p.module || !p.action) return r.entity;
    const mod = t.has(`modules.${p.module}`) ? t(`modules.${p.module}`) : p.module;
    const act = t.has(`permAction.${p.action}`) ? t(`permAction.${p.action}`) : p.action;
    const role = (p.roleCode && roleNames[p.roleCode]) ?? p.roleCode ?? "";
    return `${role} · ${mod} · ${act} → ${p.grant ? t("grant") : t("revoke")}`;
  };

  return (
    <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("approvalsTitle")}</h2>
      {rows.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t("noApprovals")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={t("approvalsTitle")}>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line-soft px-3 py-2.5 text-[13px]">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{describe(r)}</span>
                <span className="text-xs text-muted">
                  {t("requestedBy")}: {r.requestedBy ?? "—"} · <span className="num">{fmtDateTime(r.createdAt)}</span>
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </div>
              {canApprove && (
                <div className="flex gap-2">
                  <button type="button" disabled={busy !== null} className={`${primaryBtn} min-h-8 px-3 text-xs`} onClick={() => decide(r.id, "APPROVE")}>
                    {t("approve")}
                  </button>
                  <button type="button" disabled={busy !== null} className={`${secondaryBtn} min-h-8 px-3 text-xs`} onClick={() => decide(r.id, "REJECT")}>
                    {t("reject")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </section>
  );
}
