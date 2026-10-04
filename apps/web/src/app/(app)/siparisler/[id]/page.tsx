import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { OrderStatus } from "@atelier/shared";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { OrderStatusPill } from "../OrderStatusPill";
import { StockStatusBadge } from "../StockStatusBadge";
import { CancellationActions, type PendingActions } from "./CancellationActions";
import { OrderTransition } from "./OrderTransition";
import { PaymentPanel } from "./PaymentPanel";

interface Payment {
  id: string;
  status: string;
  amount: string;
  currency: string;
  installments: number;
  provider: { code: string; name: string };
  failureCode: string | null;
  createdAt: string;
}

interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  currency: string;
  paymentTermsDays: number | null;
  createdAt: string;
  channel: { code: string; name: string };
  customer: { id: string; fullName: string };
  netTotal: string;
  otvTotal: string;
  kdvTotal: string;
  grandTotal: string;
  stockStatus: string | null;
  pendingActions: PendingActions | null;
  lines: {
    id: string;
    product: { id: string; sku: string; name: string };
    qty: number;
    reservedQty: string;
    shippedQty: string;
    shortageQty: string;
    unitPriceGross: string;
    discount: string;
    otvRate: string;
    kdvRate: string;
    netAmount: string;
    otvAmount: string;
    kdvAmount: string;
  }[];
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("orders");
  const me = await getMe();
  let o: Order;
  try {
    o = await apiGet<Order>(`/sales/orders/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const canEdit = me.permissions.includes("sales:EDIT");
  const payments = await apiGet<Payment[]>(`/payments/order/${encodeURIComponent(o.id)}`).catch(() => []);
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";
  const money = (v: string) => fmtMoney(v);

  return (
    <>
      <Topbar
        heading={`${o.number}`}
        sub={`${o.customer.fullName} · ${o.channel.name} · ${fmtDate(o.createdAt)}`}
        action={
          <span className="flex items-center gap-2">
            <StockStatusBadge status={o.stockStatus} />
            <OrderStatusPill status={o.status} />
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/siparisler" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-3 font-display text-[17px] font-semibold">{t("section.lines")}</h2>
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>{t("line.product")}</th>
                <th className={`${th} text-right`}>{t("line.qty")}</th>
                <th className={th}>{t("line.stock")}</th>
                <th className={`${th} text-right`}>{t("line.unit")}</th>
                <th className={`${th} text-right`}>{t("line.net")}</th>
                <th className={`${th} text-right`}>{t("line.otv")}</th>
                <th className={`${th} text-right`}>{t("line.kdv")}</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id}>
                  <td className={td}>
                    <Link href={`/urunler/${l.product.id}`} className="font-semibold">
                      {l.product.name}
                    </Link>
                    <span className="num ml-2 text-[11.5px] text-muted">{l.product.sku}</span>
                  </td>
                  <td className={`${td} num text-right`}>{l.qty}</td>
                  <td className={`${td} text-[12px]`}>
                    {Number(l.shippedQty) > 0 && <span className="mr-2 font-semibold text-ok">{t("stock.shippedN", { n: l.shippedQty })}</span>}
                    {Number(l.reservedQty) > 0 && <span className="mr-2 text-text-2">{t("stock.reservedN", { n: l.reservedQty })}</span>}
                    {Number(l.shortageQty) > 0 && <span className="font-semibold text-bad">{t("stock.shortN", { n: l.shortageQty })}</span>}
                    {Number(l.shippedQty) + Number(l.reservedQty) + Number(l.shortageQty) === 0 && <span className="text-muted">—</span>}
                  </td>
                  <td className={`${td} num text-right`}>{money(l.unitPriceGross)}</td>
                  <td className={`${td} num text-right text-text-2`}>{money(l.netAmount)}</td>
                  <td className={`${td} num text-right text-text-2`}>{money(l.otvAmount)}</td>
                  <td className={`${td} num text-right text-text-2`}>{money(l.kdvAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.totals")}</h2>
            <dl className="m-0 flex flex-col gap-1 text-[13px]">
              {(
                [
                  ["net", o.netTotal],
                  ["otv", o.otvTotal],
                  ["kdv", o.kdvTotal],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between border-t border-line-soft py-1.5 first:border-t-0">
                  <dt>{t(`totals.${k}`)}</dt>
                  <dd className="num m-0">{money(v)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line py-2 font-bold">
                <dt>{t("totals.grand")}</dt>
                <dd className="num m-0">{money(o.grandTotal)}</dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.flow")}</h2>
            <OrderStatusPill status={o.status} />
            {canEdit ? (
              <OrderTransition orderId={o.id} status={o.status} />
            ) : (
              <p className="m-0 text-[13px] text-muted">—</p>
            )}
          </section>
        </div>

        {o.pendingActions && (
          <CancellationActions
            actions={o.pendingActions}
            canRefund={me.permissions.includes("sales:APPROVE")}
            canCancelInvoice={me.permissions.includes("invoicing:APPROVE")}
          />
        )}

        {Number(o.lines.reduce((a, l) => a + Number(l.shortageQty), 0)) > 0 && (
          <p className="m-0 rounded-[12px] bg-warn-bg px-4 py-3 text-[13px] text-warn">{t("stock.waitingHelp")}</p>
        )}

        <PaymentPanel orderId={o.id} orderStatus={o.status} canPay={me.permissions.includes("sales:CREATE")} payments={payments} />
      </div>
    </>
  );
}
