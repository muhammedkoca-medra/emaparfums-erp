import { getFormatter, getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";

interface Role {
  id: string;
  code: string;
  name: string;
  userCount: number;
}
interface User {
  id: string;
  email: string;
  fullName: string;
  twoFactorOn: boolean;
  lastLoginAt: string | null;
  roles: { code: string; name: string }[];
}
interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  user: { fullName: string } | null;
}

/** Yetki & kayıtlar (prototip 17) · Faz 0: salt okunur görünüm. Matris düzenleme F1-09'da. */
export default async function AdminPage() {
  const t = await getTranslations();
  const format = await getFormatter();
  const me = await getMe();
  if (!canView(me.permissions, "admin")) {
    return (
      <>
        <Topbar heading={t("nav.modules.admin")} />
        <p
          role="alert"
          className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8"
        >
          {t("placeholder.noAccess")}
        </p>
      </>
    );
  }

  const [roles, users, audit] = await Promise.all([
    apiGet<Role[]>("/admin/roles"),
    apiGet<User[]>("/admin/users"),
    apiGet<{ items: AuditRow[] }>("/admin/audit?limit=50"),
  ]);
  const actionLabel = (a: string) => {
    const key = `admin.actions.${a.replaceAll(".", "_")}`;
    return t.has(key) ? t(key) : a;
  };
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5 align-top";

  return (
    <>
      <Topbar heading={t("nav.modules.admin")} sub={t("admin.subtitle")} />
      <div className="grid gap-4 px-4 py-5 sm:px-8 xl:grid-cols-[270px_minmax(0,1fr)]">
        <section className="flex flex-col gap-1 rounded-[16px] border border-line bg-surface px-3.5 py-4">
          <h2 className="m-0 px-1.5 pb-2 font-display text-[19px] font-semibold">{t("admin.rolesTitle")}</h2>
          <ul className="m-0 list-none p-0">
            {roles.map((r) => (
              <li key={r.id} className="flex min-h-10 items-center gap-2 rounded-[9px] px-2.5 text-[13px]">
                <span className="flex-1">{r.name}</span>
                <span className="num text-xs text-muted">{t("admin.userCount", { count: r.userCount })}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-2 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[19px] font-semibold">{t("admin.usersTitle")}</h2>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={th}>{t("admin.colName")}</th>
                  <th className={th}>{t("admin.colEmail")}</th>
                  <th className={th}>{t("admin.colRoles")}</th>
                  <th className={th}>{t("admin.col2fa")}</th>
                  <th className={th}>{t("admin.colLastLogin")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className={`${td} font-semibold`}>{u.fullName}</td>
                    <td className={td}>{u.email}</td>
                    <td className={td}>{u.roles.map((r) => r.name).join(", ")}</td>
                    <td className={td}>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.twoFactorOn ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}
                      >
                        {u.twoFactorOn ? t("common.yes") : t("common.no")}
                      </span>
                    </td>
                    <td className={`${td} num text-text-2`}>
                      {u.lastLoginAt ? when(u.lastLoginAt) : t("common.never")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="flex flex-col gap-2 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("admin.auditTitle")}</h2>
              <span className="text-xs text-muted">{t("admin.auditNote")}</span>
            </div>
            {audit.items.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("common.empty")}</p>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={th}>{t("admin.colTime")}</th>
                    <th className={th}>{t("admin.colUser")}</th>
                    <th className={th}>{t("admin.colAction")}</th>
                    <th className={th}>{t("admin.colEntity")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.items.map((a) => (
                    <tr key={a.id}>
                      <td className={`${td} num whitespace-nowrap text-muted`}>{when(a.createdAt)}</td>
                      <td className={`${td} font-semibold`}>{a.user?.fullName ?? t("admin.system")}</td>
                      <td className={td}>{actionLabel(a.action)}</td>
                      <td className={`${td} text-text-2`}>{a.entity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
