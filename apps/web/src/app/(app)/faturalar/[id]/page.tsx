import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { InvoiceActions } from "./InvoiceActions";
import { InvoiceStatusPill } from "../InvoiceStatusPill";

interface Invoice {
  id: string;
  number: string | null;
  ettn: string | null;
  type: string;
  direction: string;
  status: string;
  issueDate: string;
  currency: string;
  customer: { fullName: string } | null;
  order: { number: string } | null;
  errorMessage: string | null;
  netTotal: string;
  otvTotal: string;
  kdvTotal: string;
  grandTotal: string;
  lines: { id: string; description: string; qty: string; unitPrice: string; netAmount: string; otvAmount: string; kdvAmount: string }[];
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("invoices");
  const me = await getMe();
  let inv: Invoice;
  try {
    inv = await apiGet<Invoice>(`/invoices/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar
        heading={inv.number ?? t(`type.${inv.type}`)}
        sub={`${t(`type.${inv.type}`)} · ${inv.customer?.fullName ?? ""} · ${fmtDate(inv.issueDate)}`}
        action={<InvoiceStatusPill status={inv.status} />}
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/faturalar" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        {inv.errorMessage && inv.status === "ERROR" && (
          <p className="m-0 rounded-[10px] bg-bad-bg px-4 py-2.5 text-[13px] text-bad">
            {t("errorLabel")}: {inv.errorMessage}
          </p>
        )}

        <InvoiceActions
          id={inv.id}
          status={inv.status}
          ettn={inv.ettn}
          type={inv.type}
          canEdit={me.permissions.includes("invoicing:EDIT")}
          canApprove={me.permissions.includes("invoicing:APPROVE")}
          canCreate={me.permissions.includes("invoicing:CREATE")}
        />

        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-3 font-display text-[17px] font-semibold">{t("section.lines")}</h2>
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>{t("line.desc")}</th>
                <th className={`${th} text-right`}>{t("line.qty")}</th>
                <th className={`${th} text-right`}>{t("line.unit")}</th>
                <th className={`${th} text-right`}>{t("line.net")}</th>
                <th className={`${th} text-right`}>{t("line.otv")}</th>
                <th className={`${th} text-right`}>{t("line.kdv")}</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <td className={td}>{l.description}</td>
                  <td className={`${td} num text-right`}>{Number(l.qty)}</td>
                  <td className={`${td} num text-right`}>{fmtMoney(l.unitPrice)}</td>
                  <td className={`${td} num text-right text-text-2`}>{fmtMoney(l.netAmount)}</td>
                  <td className={`${td} num text-right text-text-2`}>{fmtMoney(l.otvAmount)}</td>
                  <td className={`${td} num text-right text-text-2`}>{fmtMoney(l.kdvAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="flex flex-col gap-1 self-start rounded-[16px] border border-line bg-surface p-5 text-[13px] sm:min-w-[280px]">
          <h2 className="m-0 mb-1 font-display text-[17px] font-semibold">{t("section.totals")}</h2>
          {(
            [
              ["net", inv.netTotal],
              ["otv", inv.otvTotal],
              ["kdv", inv.kdvTotal],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between border-t border-line-soft py-1.5 first:border-t-0">
              <span>{t(`totals.${k}`)}</span>
              <span className="num">{fmtMoney(v)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line py-2 font-bold">
            <span>{t("totals.grand")}</span>
            <span className="num">{fmtMoney(inv.grandTotal)}</span>
          </div>
        </section>
      </div>
    </>
  );
}
