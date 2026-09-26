import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pill } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate } from "@/lib/format";
import { canView } from "@/lib/modules";
import { NewCustomerForm } from "./NewCustomerForm";

interface CustomerRow {
  id: string;
  type: "INDIVIDUAL" | "CORPORATE";
  fullName: string;
  email: string | null;
  phone: string | null;
  taxNo: string | null;
  kvkkConsentAt: string | null;
  marketingConsentAt: string | null;
  createdAt: string;
}

/** Müşteriler (F2-01). İletişim bilgisi yalnızca customer_pii yetkisiyle açık görünür. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getTranslations("customers");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "sales")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const { q } = await searchParams;
  const rows = await apiGet<CustomerRow[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const canPii = me.permissions.includes("customer_pii:VIEW");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        {!canPii && <p className="m-0 rounded-[10px] bg-warn-bg px-4 py-2 text-[13px] text-warn">{t("piiHidden")}</p>}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex flex-col gap-3 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            <form method="get" className="flex gap-2">
              <input
                name="q"
                defaultValue={q ?? ""}
                placeholder={t("search")}
                aria-label={t("search")}
                className="min-h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[14px] outline-none focus:border-gold-2"
              />
            </form>
            <span className="text-xs text-muted">{t("count", { count: rows.length })}</span>
            {rows.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label={t("title")}>
                <thead>
                  <tr>
                    <th className={th}>{t("col.name")}</th>
                    <th className={th}>{t("col.type")}</th>
                    <th className={th}>{t("col.email")}</th>
                    <th className={th}>{t("col.phone")}</th>
                    <th className={th}>{t("col.consent")}</th>
                    <th className={th}>{t("col.created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-soft">
                      <td className={`${td} font-semibold`}>
                        <Link href={`/musteriler/${c.id}`}>{c.fullName}</Link>
                      </td>
                      <td className={td}>{t(`type.${c.type}`)}</td>
                      <td className={`${td} text-text-2`}>{c.email ?? "—"}</td>
                      <td className={`${td} num text-text-2`}>{c.phone ?? "—"}</td>
                      <td className={td}>
                        <span className="flex gap-1">
                          <Pill tone={c.kvkkConsentAt ? "ok" : "neu"}>{t("consent.kvkk")}</Pill>
                          <Pill tone={c.marketingConsentAt ? "ok" : "neu"}>{t("consent.marketing")}</Pill>
                        </span>
                      </td>
                      <td className={`${td} num text-text-2`}>{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {me.permissions.includes("sales:CREATE") && <NewCustomerForm />}
        </div>
      </div>
    </>
  );
}
