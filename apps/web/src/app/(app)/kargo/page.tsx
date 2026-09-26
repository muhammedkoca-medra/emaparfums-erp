import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { canView } from "@/lib/modules";
import { NewShipmentForm } from "./NewShipmentForm";
import { ShipStatusPill } from "./ShipStatusPill";

interface Row {
  id: string;
  trackingNo: string | null;
  status: string;
  cost: string | null;
  carrier: { code: string; name: string };
  order: { number: string } | null;
  createdAt: string;
}

export default async function ShippingPage() {
  const t = await getTranslations("shipping");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "shipping")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const canCreate = me.permissions.includes("shipping:CREATE");
  const [rows, carriers, orders] = await Promise.all([
    apiGet<Row[]>("/shipping/shipments"),
    canCreate ? apiGet<{ id: string; name: string }[]>("/shipping/carriers") : Promise.resolve([]),
    canCreate && canView(me.permissions, "sales") ? apiGet<{ id: string; number: string; status: string }[]>("/sales/orders") : Promise.resolve([]),
  ]);
  const orderRefs = orders.filter((o) => ["CONFIRMED", "IN_PRODUCTION", "PICKING", "SHIPPED"].includes(o.status)).map((o) => ({ id: o.id, label: o.number }));
  const carrierRefs = carriers.map((c) => ({ id: c.id, label: c.name }));
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <span className="text-xs text-muted">{t("count", { count: rows.length })}</span>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            {rows.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label={t("title")}>
                <thead>
                  <tr>
                    <th className={th}>{t("col.tracking")}</th>
                    <th className={th}>{t("col.carrier")}</th>
                    <th className={th}>{t("col.order")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={`${th} text-right`}>{t("col.cost")}</th>
                    <th className={th}>{t("col.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-soft">
                      <td className={`${td} num font-bold`}>
                        <Link href={`/kargo/${r.id}`}>{r.trackingNo ?? "—"}</Link>
                      </td>
                      <td className={td}>{r.carrier.name}</td>
                      <td className={`${td} num text-text-2`}>{r.order?.number ?? "—"}</td>
                      <td className={td}>
                        <ShipStatusPill status={r.status} />
                      </td>
                      <td className={`${td} num text-right`}>{r.cost ? fmtMoney(r.cost) : "—"}</td>
                      <td className={`${td} num text-text-2`}>{fmtDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {canCreate && <NewShipmentForm orders={orderRefs} carriers={carrierRefs} />}
        </div>
      </div>
    </>
  );
}
