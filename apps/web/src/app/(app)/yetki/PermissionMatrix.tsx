"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export interface MatrixData {
  modules: string[];
  actions: string[];
  pendingCells: string[];
  roles: { id: string; code: string; name: string; userCount: number; permissions: string[] }[];
}

/** Rol × modül × işlem matrisi (F1-09). Tıklama doğrudan değiştirmez; onaya giden talep açar. */
export function PermissionMatrix({ data, canEdit }: { data: MatrixData; canEdit: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [roleId, setRoleId] = useState(data.roles[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const role = data.roles.find((r) => r.id === roleId);
  if (!role) return null;
  const has = new Set(role.permissions);
  const pending = new Set(data.pendingCells);
  const modLabel = (m: string) => (t.has(`modules.${m}`) ? t(`modules.${m}`) : m);
  const actLabel = (a: string) => (t.has(`permAction.${a}`) ? t(`permAction.${a}`) : a);

  async function toggle(module: string, action: string) {
    const grant = !has.has(`${module}:${action}`);
    const vars = { role: role!.name, module: modLabel(module), action: actLabel(action) };
    if (!window.confirm(grant ? t("requestGrant", vars) : t("requestRevoke", vars))) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/admin/permission-changes", { roleId, module, action, grant });
      setMsg({ ok: true, text: t("requested") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("genericError")) });
    } finally {
      setBusy(false);
    }
  }

  const th = "px-2 py-2 text-center text-[11px] font-bold tracking-[0.06em] text-muted uppercase";
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-[19px] font-semibold">{t("matrixTitle")}</h2>
        <span className="text-xs text-muted">{canEdit ? t("matrixHint") : ""}</span>
      </div>
      <div role="tablist" aria-label={t("role")} className="flex flex-wrap gap-1.5">
        {data.roles.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={r.id === roleId}
            onClick={() => setRoleId(r.id)}
            className={`min-h-9 rounded-full border px-3 text-[13px] font-semibold ${
              r.id === roleId ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-text-2 hover:border-gold-2"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[13px]" aria-label={`${t("matrixTitle")} · ${role.name}`}>
          <thead>
            <tr>
              <th className={`${th} text-left`}>{t("module")}</th>
              {data.actions.map((a) => (
                <th key={a} className={th}>
                  {actLabel(a)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.modules.map((m) => (
              <tr key={m}>
                <td className="border-t border-line-soft px-2 py-1.5 font-semibold">{modLabel(m)}</td>
                {data.actions.map((a) => {
                  const on = has.has(`${m}:${a}`);
                  const wait = pending.has(`${role.id}:${m}:${a}`);
                  const label = `${modLabel(m)} · ${actLabel(a)}`;
                  return (
                    <td key={a} className="border-t border-line-soft px-2 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={!canEdit || busy || wait}
                        onClick={() => toggle(m, a)}
                        aria-label={label}
                        aria-pressed={on}
                        title={wait ? t("pending") : label}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-[7px] border text-xs font-bold ${
                          wait
                            ? "border-warn bg-warn-bg text-warn"
                            : on
                              ? "border-ok bg-ok-bg text-ok"
                              : "border-line bg-surface text-muted"
                        } ${canEdit && !wait ? "hover:border-gold-2" : ""}`}
                      >
                        {wait ? "…" : on ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
