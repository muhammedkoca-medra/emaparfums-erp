import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { canView } from "@/lib/modules";
import { InvoiceStatusPill } from "./InvoiceStatusPill";

interface Row {
  id: string;
  number: string | null;
  type: string;
  direction: string;
  status: string;
  issueDate: string;
  grandTotal: string;
  errorMessage: string | null;
  customer: { fullName: string } | null;
  order: { number: string } | null;
}

export default async function InvoicesPage() {
  const t = await getTranslations("invoices");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "invoicing")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const rows = await apiGet<Row[]>("/invoices");
  const errors = rows.filter((r) => r.status === "ERROR");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";
  const table = (list: Row[]) => (
    <table className="w-full min-w-[720px] border-collapse text-[13px]" aria-label={t("title")}>
      <thead>
        <tr>
          <th className={th}>{t("col.number")}</th>
          <th className={th}>{t("col.type")}</th>
          <th className={th}>{t("col.customer")}</th>
          <th className={th}>{t("col.order")}</th>
          <th className={th}>{t("col.status")}</th>
          <th className={`${th} text-right`}>{t("col.total")}</th>
          <th className={th}>{t("col.date")}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id} className="hover:bg-surface-soft">
            <td className={`${td} num font-bold`}>
              <Link href={`/faturalar/${r.id}`}>{r.number ?? "—"}</Link>
            </td>
            <td className={td}>{t(`type.${r.type}`)}</td>
            <td className={td}>{r.customer?.fullName ?? "—"}</td>
            <td className={`${td} num text-text-2`}>{r.order?.number ?? "—"}</td>
            <td className={td}>
              <InvoiceStatusPill status={r.status} />
            </td>
            <td className={`${td} num text-right font-semibold`}>{fmtMoney(r.grandTotal)}</td>
            <td className={`${td} num text-text-2`}>{fmtDate(r.issueDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        {errors.length > 0 && (
          <section className="overflow-x-auto rounded-[16px] border border-bad bg-bad-bg/40 p-5">
            <h2 className="m-0 mb-2 font-display text-[17px] font-semibold text-bad">
              {t("errorQueue")} · {errors.length}
            </h2>
            {table(errors)}
          </section>
        )}
        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          <span className="mb-2 block text-xs text-muted">{t("count", { count: rows.length })}</span>
          {rows.length === 0 ? <p className="m-0 text-[13px] text-muted">{t("empty")}</p> : table(rows)}
        </section>
      </div>
    </>
  );
}
