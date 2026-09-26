import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { canView } from "@/lib/modules";

interface Summary {
  orders: number;
  revenue: string;
  avg: string;
  customers: number;
  byStatus: { status: string; count: number }[];
  recent: { id: string; number: string; status: string; grandTotal: string; createdAt: string; customer: string }[];
}

/** Satış raporu (F2 hazırlığı, salt okunur). Ürün vitrininden "Satış raporu" butonu buraya yönlendirir. */
export default async function SalesReportPage() {
  const t = await getTranslations("salesReport");
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
  const s = await apiGet<Summary>("/sales/analytics/summary");
  const kpis: { key: string; value: string }[] = [
    { key: "orders", value: String(s.orders) },
    { key: "revenue", value: `${fmtMoney(s.revenue)}` },
    { key: "avg", value: `${fmtMoney(s.avg)}` },
    { key: "customers", value: String(s.customers) },
  ];
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <li key={k.key} className="flex flex-col gap-1 rounded-[16px] border border-line bg-surface p-5">
              <span className="text-[12px] font-semibold text-text-2">{t(`kpi.${k.key}`)}</span>
              <span className="num font-display text-[28px] leading-none font-semibold">{k.value}</span>
            </li>
          ))}
        </ul>

        {s.orders === 0 ? (
          <p className="m-0 rounded-[16px] border border-line bg-surface p-6 text-center text-[13px] text-muted">{t("empty")}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
              <h2 className="m-0 font-display text-[17px] font-semibold">{t("byStatus")}</h2>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {s.byStatus.map((b) => (
                  <li key={b.status} className="flex items-center justify-between gap-2 border-t border-line-soft py-1.5 first:border-t-0">
                    <span>{b.status}</span>
                    <span className="num font-semibold">{b.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-2 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
              <h2 className="m-0 font-display text-[17px] font-semibold">{t("recent")}</h2>
              <table className="w-full min-w-[480px] border-collapse text-[13px]">
                <tbody>
                  {s.recent.map((o) => (
                    <tr key={o.id} className="first:*:border-t-0">
                      <td className={`${td} num font-semibold`}>{o.number}</td>
                      <td className={td}>{o.customer}</td>
                      <td className={`${td} text-text-2`}>{o.status}</td>
                      <td className={`${td} num text-right`}>{fmtMoney(o.grandTotal)}</td>
                      <td className={`${td} num text-muted`}>{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}

        <p className="m-0 text-xs text-muted">{t("note")}</p>
        <Link href="/urunler" className="self-start text-[13px] font-semibold">
          ← {tn("catalog.hub.vitrinTitle")}
        </Link>
      </div>
    </>
  );
}
