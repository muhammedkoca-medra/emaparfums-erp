import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";
import { type ApprovalRow, Approvals } from "./Approvals";
import { type MatrixData, PermissionMatrix } from "./PermissionMatrix";
import { type AdminRole, type AdminUser, UserAdmin } from "./UserAdmin";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  before: unknown;
  after: unknown;
  user: { fullName: string } | null;
}

type Tab = "users" | "matrix" | "audit";
type Search = { tab?: string; entity?: string; action?: string; from?: string; to?: string; cursor?: string };

const ENTITIES = ["User", "Role", "ApprovalRequest", "Lot", "StockMovement", "CycleCount", "Item", "Product", "Formula", "TaxRule", "SystemSetting"];

/** Yetki & kayıtlar (prototip 17 · F1-09): kullanıcılar, yetki matrisi + onaylar, filtreli işlem geçmişi. */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const t = await getTranslations();
  const format = await getFormatter();
  const me = await getMe();
  if (!canView(me.permissions, "admin")) {
    return (
      <>
        <Topbar heading={t("nav.modules.admin")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {t("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const sp = await searchParams;
  const tab: Tab = sp.tab === "matrix" || sp.tab === "audit" ? sp.tab : "users";
  const perms = new Set(me.permissions);

  const tabs: Tab[] = ["users", "matrix", "audit"];
  const tabNav = (
    <nav aria-label={t("nav.modules.admin")} className="flex flex-wrap gap-2">
      {tabs.map((k) => (
        <Link
          key={k}
          href={k === "users" ? "/yetki" : `/yetki?tab=${k}`}
          aria-current={k === tab ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold no-underline ${
            k === tab ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-text-2 hover:border-gold-2"
          }`}
        >
          {t(`admin.tabs.${k}`)}
        </Link>
      ))}
    </nav>
  );

  let body: React.ReactNode;
  if (tab === "users") {
    const [roles, users] = await Promise.all([apiGet<AdminRole[]>("/admin/roles"), apiGet<AdminUser[]>("/admin/users")]);
    body = (
      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
        <section className="flex flex-col gap-1 self-start rounded-[16px] border border-line bg-surface px-3.5 py-4">
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
        <UserAdmin
          users={users}
          roles={roles}
          currentUserId={me.id}
          canCreate={perms.has("admin:CREATE")}
          canEdit={perms.has("admin:EDIT")}
        />
      </div>
    );
  } else if (tab === "matrix") {
    const [matrix, approvals] = await Promise.all([
      apiGet<MatrixData>("/admin/permission-matrix"),
      apiGet<ApprovalRow[]>("/approvals"),
    ]);
    const roleNames = Object.fromEntries(matrix.roles.map((r) => [r.code, r.name]));
    body = (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <PermissionMatrix data={matrix} canEdit={perms.has("admin:EDIT")} />
        <Approvals rows={approvals} roleNames={roleNames} canApprove={perms.has("admin:APPROVE")} />
      </div>
    );
  } else {
    const q = new URLSearchParams({ limit: "50" });
    for (const k of ["entity", "action", "cursor"] as const) if (sp[k]) q.set(k, sp[k]!);
    if (sp.from) q.set("from", `${sp.from}T00:00:00`);
    if (sp.to) q.set("to", `${sp.to}T23:59:59`);
    const audit = await apiGet<{ items: AuditRow[]; nextCursor: string | null }>(`/admin/audit?${q}`);
    const actionLabel = (a: string) => {
      const key = `admin.actions.${a.replaceAll(".", "_")}`;
      return t.has(key) ? t(key) : a;
    };
    const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });
    const more = new URLSearchParams();
    for (const k of ["entity", "action", "from", "to"] as const) if (sp[k]) more.set(k, sp[k]!);
    more.set("tab", "audit");
    if (audit.nextCursor) more.set("cursor", audit.nextCursor);
    const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
    const td = "border-t border-line-soft px-2 py-2.5 align-top";
    const json = (v: unknown) => (v == null ? "—" : JSON.stringify(v, null, 2));
    body = (
      <section className="flex flex-col gap-3 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="m-0 font-display text-[19px] font-semibold">{t("admin.auditTitle")}</h2>
          <span className="text-xs text-muted">{t("admin.auditNote")}</span>
        </div>
        <form method="get" action="/yetki" className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto] sm:items-end">
          <input type="hidden" name="tab" value="audit" />
          <label className={labelCls}>
            {t("admin.filter.entity")}
            <select name="entity" defaultValue={sp.entity ?? ""} className={inputCls}>
              <option value="">{t("admin.filter.all")}</option>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("admin.filter.action")}
            <input name="action" defaultValue={sp.action ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("admin.filter.from")}
            <input name="from" type="date" defaultValue={sp.from ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("admin.filter.to")}
            <input name="to" type="date" defaultValue={sp.to ?? ""} className={inputCls} />
          </label>
          <button type="submit" className={primaryBtn}>
            {t("admin.filter.apply")}
          </button>
          <Link href="/yetki?tab=audit" className={`${secondaryBtn} no-underline`}>
            {t("admin.filter.clear")}
          </Link>
        </form>
        {audit.items.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">{t("common.empty")}</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-[13px]" aria-label={t("admin.auditTitle")}>
            <thead>
              <tr>
                <th className={th}>{t("admin.colTime")}</th>
                <th className={th}>{t("admin.colUser")}</th>
                <th className={th}>{t("admin.colAction")}</th>
                <th className={th}>{t("admin.colEntity")}</th>
                <th className={th}>{t("admin.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {audit.items.map((a) => (
                <tr key={a.id}>
                  <td className={`${td} num whitespace-nowrap text-muted`}>{when(a.createdAt)}</td>
                  <td className={`${td} font-semibold`}>{a.user?.fullName ?? t("admin.system")}</td>
                  <td className={td}>{actionLabel(a.action)}</td>
                  <td className={`${td} text-text-2`}>{a.entity}</td>
                  <td className={td}>
                    {a.before == null && a.after == null ? (
                      "—"
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold">{t("admin.detail")}</summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <div className="text-[11px] font-bold text-muted uppercase">{t("admin.before")}</div>
                            <pre className="m-0 max-h-60 overflow-auto rounded-[8px] bg-surface-soft p-2 text-[11px]">{json(a.before)}</pre>
                          </div>
                          <div>
                            <div className="text-[11px] font-bold text-muted uppercase">{t("admin.after")}</div>
                            <pre className="m-0 max-h-60 overflow-auto rounded-[8px] bg-surface-soft p-2 text-[11px]">{json(a.after)}</pre>
                          </div>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {audit.nextCursor && (
          <Link href={`/yetki?${more}`} className={`${secondaryBtn} self-start no-underline`}>
            {t("admin.loadMore")}
          </Link>
        )}
      </section>
    );
  }

  return (
    <>
      <Topbar heading={t("nav.modules.admin")} sub={t("admin.subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        {tabNav}
        {body}
      </div>
    </>
  );
}
