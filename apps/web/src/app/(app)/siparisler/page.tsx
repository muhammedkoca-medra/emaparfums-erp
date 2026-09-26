import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { canView } from "@/lib/modules";
import { NewOrderForm } from "./NewOrderForm";
import { OrderStatusPill } from "./OrderStatusPill";

interface OrderRow {
  id: string;
  number: string;
  status: string;
  grandTotal: string;
  currency: string;
  createdAt: string;
  channel: { code: string; name: string };
  customer: { id: string; fullName: string };
  lineCount: number;
}

interface Ref {
  id: string;
  label: string;
}

/** Satış siparişleri (F2-02). */
export default async function OrdersPage() {
  const t = await getTranslations("orders");
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
  const canCreate = me.permissions.includes("sales:CREATE");
  const [orders, customers, products, channels] = await Promise.all([
    apiGet<OrderRow[]>("/sales/orders"),
    canCreate ? apiGet<{ id: string; fullName: string }[]>("/customers") : Promise.resolve([]),
    canCreate ? apiGet<{ id: string; sku: string; name: string; status: string }[]>("/catalog/products") : Promise.resolve([]),
    canCreate ? apiGet<{ id: string; code: string; name: string }[]>("/sales/channels").catch(() => []) : Promise.resolve([]),
  ]);
  const customerRefs: Ref[] = customers.map((c) => ({ id: c.id, label: c.fullName }));
  const productRefs = products.filter((p) => p.status === "ACTIVE").map((p) => ({ id: p.id, label: `${p.name} · ${p.sku}` }));
  const channelRefs: Ref[] = channels.map((c) => ({ id: c.id, label: c.name }));

  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <span className="text-xs text-muted">{t("count", { count: orders.length })}</span>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            {orders.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label={t("title")}>
                <thead>
                  <tr>
                    <th className={th}>{t("col.number")}</th>
                    <th className={th}>{t("col.customer")}</th>
                    <th className={th}>{t("col.channel")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={`${th} text-right`}>{t("col.total")}</th>
                    <th className={th}>{t("col.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-soft">
                      <td className={`${td} num font-bold`}>
                        <Link href={`/siparisler/${o.id}`}>{o.number}</Link>
                      </td>
                      <td className={td}>{o.customer.fullName}</td>
                      <td className={`${td} text-text-2`}>{o.channel.name}</td>
                      <td className={td}>
                        <OrderStatusPill status={o.status} />
                      </td>
                      <td className={`${td} num text-right font-semibold`}>{fmtMoney(o.grandTotal)}</td>
                      <td className={`${td} num text-text-2`}>{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {canCreate && <NewOrderForm customers={customerRefs} products={productRefs} channels={channelRefs} />}
        </div>
      </div>
    </>
  );
}
