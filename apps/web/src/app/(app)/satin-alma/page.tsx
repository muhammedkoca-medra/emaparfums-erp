import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { canView } from "@/lib/modules";
import { NewPoForm, type PoPrefill } from "./NewPoForm";
import { NewSupplierForm } from "./NewSupplierForm";
import { PoStatusPill } from "./PoStatusPill";

interface Sug {
  itemId: string;
  code: string;
  name: string;
  uom: string;
  available: string;
  minStock: string;
  suggestedQty: string;
  supplier: { id: string; name: string; price?: string } | null;
  requisition: { id: string; qty: string; neededBy: string } | null;
}
interface Order {
  id: string;
  number: string;
  status: string;
  total: string;
  currency: string;
  supplier: { name: string };
  lineCount: number;
  createdAt: string;
}

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<{ aktar?: string }> }) {
  const { aktar } = await searchParams;
  const t = await getTranslations("purchasing");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "purchasing")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const canCreate = me.permissions.includes("purchasing:CREATE");
  const [suggestions, orders, suppliers, items, kdvRates] = await Promise.all([
    apiGet<Sug[]>("/purchasing/suggestions"),
    apiGet<Order[]>("/purchasing/orders"),
    canCreate ? apiGet<{ id: string; name: string }[]>("/purchasing/suppliers") : Promise.resolve([]),
    canCreate ? apiGet<{ id: string; code: string; name: string; type: string }[]>("/catalog/items") : Promise.resolve([]),
    canCreate ? apiGet<string[]>("/purchasing/kdv-rates").catch(() => []) : Promise.resolve([]),
  ]);
  // "Siparişe aktar": öneri/talep satırından sipariş formunu doldurur (talep varsa onun miktarı).
  const picked = aktar ? suggestions.find((s) => s.itemId === aktar) : undefined;
  const prefill: PoPrefill | null = picked
    ? {
        supplierId: picked.supplier?.id ?? null,
        itemId: picked.itemId,
        qty: picked.requisition?.qty ?? picked.suggestedQty,
        unitPrice: picked.supplier?.price ?? null,
        requisitionId: picked.requisition?.id ?? null,
      }
    : null;
  const supplierRefs = suppliers.map((s) => ({ id: s.id, label: s.name }));
  const itemRefs = items.filter((i) => ["RAW_MATERIAL", "PACKAGING", "SEMI_FINISHED"].includes(i.type)).map((i) => ({ id: i.id, label: `${i.code} · ${i.name}` }));
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-2 font-display text-[17px] font-semibold">{t("suggestions")}</h2>
          {suggestions.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">{t("noSuggestions")}</p>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={th}>{t("supCol.item")}</th>
                  <th className={`${th} text-right`}>{t("supCol.available")}</th>
                  <th className={`${th} text-right`}>{t("supCol.min")}</th>
                  <th className={`${th} text-right`}>{t("supCol.suggested")}</th>
                  <th className={th}>{t("supCol.supplier")}</th>
                  {canCreate && <th className={th} />}
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.itemId}>
                    <td className={td}>
                      {s.code} · {s.name}
                    </td>
                    <td className={`${td} num text-right text-bad`}>{fmtQty(s.available)}</td>
                    <td className={`${td} num text-right text-text-2`}>{fmtQty(s.minStock)}</td>
                    <td className={`${td} num text-right font-semibold`}>{fmtQty(s.suggestedQty)}</td>
                    <td className={td}>
                      {s.supplier?.name ?? "—"}
                      {s.requisition && (
                        <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-[10.5px] font-semibold text-warn">
                          {t("requisitionOpen", { qty: fmtQty(s.requisition.qty) })}
                        </span>
                      )}
                    </td>
                    {canCreate && (
                      <td className={`${td} text-right`}>
                        <Link href={`/satin-alma?aktar=${s.itemId}#yeni-siparis`} className="text-[12.5px] font-semibold whitespace-nowrap text-gold-text">
                          {t("toOrder")} →
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex flex-col gap-3 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 font-display text-[17px] font-semibold">{t("ordersTitle")}</h2>
              <span className="text-xs text-muted">{t("count", { count: orders.length })}</span>
            </div>
            {orders.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
            ) : (
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={th}>{t("col.number")}</th>
                    <th className={th}>{t("col.supplier")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={`${th} text-right`}>{t("col.total")}</th>
                    <th className={th}>{t("col.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-surface-soft">
                      <td className={`${td} num font-bold`}>
                        <Link href={`/satin-alma/${o.id}`}>{o.number}</Link>
                      </td>
                      <td className={td}>{o.supplier.name}</td>
                      <td className={td}>
                        <PoStatusPill status={o.status} />
                      </td>
                      <td className={`${td} num text-right font-semibold`}>{fmtMoney(o.total)}</td>
                      <td className={`${td} num text-text-2`}>{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {canCreate && (
            <div className="flex flex-col gap-3">
              <NewPoForm key={prefill?.itemId ?? "new"} suppliers={supplierRefs} items={itemRefs} kdvRates={kdvRates} prefill={prefill} />
              <NewSupplierForm />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
