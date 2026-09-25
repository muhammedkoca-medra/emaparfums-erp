"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, ClientApiError } from "@/lib/api-client";

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  userCount: number;
}
export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  twoFactorOn: boolean;
  lastLoginAt: string | null;
  roles: { code: string; name: string }[];
}

const errText = (err: unknown, fallback: string) => {
  if (!(err instanceof ClientApiError)) return fallback;
  const issue = (err.body as { issues?: { path: string; message: string }[] }).issues?.[0];
  return issue ? `${issue.path}: ${issue.message}` : err.message || fallback;
};

function RolePicker({ roles, selected, name }: { roles: AdminRole[]; selected: string[]; name: string }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {roles.map((r) => (
        <label key={r.code} className="flex min-h-9 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            name={name}
            value={r.code}
            defaultChecked={selected.includes(r.code)}
            className="h-4 w-4 accent-[#1c1815]"
          />
          {r.name}
        </label>
      ))}
    </div>
  );
}

/** Kullanıcı ekleme, rol düzenleme, devre dışı bırakma (yetki.md · admin izni). */
export function UserAdmin({
  users,
  roles,
  currentUserId,
  canCreate,
  canEdit,
}: {
  users: AdminUser[];
  roles: AdminRole[];
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      router.refresh();
    } catch (err) {
      setError(errText(err, t("genericError")));
    } finally {
      setBusy(false);
    }
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const roleCodes = d.getAll("roleCodes").map(String);
    if (roleCodes.length === 0) return setError(t("noRole"));
    void run(
      () =>
        apiPost("/admin/users", {
          fullName: d.get("fullName"),
          email: d.get("email"),
          password: d.get("password"),
          roleCodes,
          isExternal: d.get("isExternal") === "on",
        }),
      () => setAdding(false),
    );
  }

  function onRoles(e: FormEvent<HTMLFormElement>, userId: string) {
    e.preventDefault();
    const roleCodes = new FormData(e.currentTarget).getAll("roleCodes").map(String);
    if (roleCodes.length === 0) return setError(t("noRole"));
    void run(
      () => apiPost(`/admin/users/${userId}/roles`, { roleCodes }),
      () => setEditing(null),
    );
  }

  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5 align-top";

  return (
    <section className="flex flex-col gap-3 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 font-display text-[19px] font-semibold">{t("usersTitle")}</h2>
        {canCreate && !adding && (
          <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
            {t("addUser")}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}

      {adding && (
        <form
          onSubmit={onCreate}
          aria-label={t("addUserTitle")}
          className="flex flex-col gap-3 rounded-[12px] border border-line-soft bg-surface-soft p-4"
        >
          <h3 className="m-0 text-[15px] font-bold">{t("addUserTitle")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              {t("fullName")}
              <input name="fullName" required minLength={2} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("email")}
              <input name="email" type="email" required className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              {t("password")}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                className={inputCls}
              />
              <span className="text-xs font-normal text-muted">{t("passwordHint")}</span>
            </label>
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[13px] font-semibold">{t("roles")}</legend>
            <RolePicker roles={roles} selected={[]} name="roleCodes" />
          </fieldset>
          <label className="flex min-h-9 items-center gap-2 text-[13px]">
            <input type="checkbox" name="isExternal" className="h-4 w-4 accent-[#1c1815]" />
            {t("external")}
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={primaryBtn}>
              {busy ? t("creating") : t("create")}
            </button>
            <button type="button" className={secondaryBtn} onClick={() => setAdding(false)}>
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={th}>{t("colName")}</th>
            <th className={th}>{t("colEmail")}</th>
            <th className={th}>{t("colRoles")}</th>
            <th className={th}>{t("colStatus")}</th>
            <th className={th}>{t("colLastLogin")}</th>
            {canEdit && <th className={th}>{t("colActions")}</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
              <td className={`${td} font-semibold`}>{u.fullName}</td>
              <td className={td}>{u.email}</td>
              <td className={td}>
                {editing === u.id ? (
                  <form onSubmit={(e) => onRoles(e, u.id)} className="flex min-w-[260px] flex-col gap-2">
                    <RolePicker roles={roles} selected={u.roles.map((r) => r.code)} name="roleCodes" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className={primaryBtn}>
                        {t("saveRoles")}
                      </button>
                      <button type="button" className={secondaryBtn} onClick={() => setEditing(null)}>
                        {t("cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  u.roles.map((r) => r.name).join(", ")
                )}
              </td>
              <td className={td}>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.isActive ? "bg-ok-bg text-ok" : "bg-neu-bg text-neu"}`}
                >
                  {u.isActive ? t("active") : t("inactive")}
                </span>
              </td>
              <td className={`${td} num text-text-2`}>
                {u.lastLoginAt
                  ? format.dateTime(new Date(u.lastLoginAt), { dateStyle: "short", timeStyle: "short" })
                  : tc("never")}
              </td>
              {canEdit && (
                <td className={td}>
                  {u.id !== currentUserId && editing !== u.id && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={secondaryBtn}
                        onClick={() => setEditing(u.id)}
                        aria-label={`${t("editRoles")} · ${u.fullName}`}
                      >
                        {t("editRoles")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={secondaryBtn}
                        aria-label={`${u.isActive ? t("deactivate") : t("activate")} · ${u.fullName}`}
                        onClick={() => {
                          if (u.isActive && !window.confirm(t("confirmDeactivate", { name: u.fullName })))
                            return;
                          void run(() => apiPost(`/admin/users/${u.id}/status`, { isActive: !u.isActive }));
                        }}
                      >
                        {u.isActive ? t("deactivate") : t("activate")}
                      </button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
