import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { type BalanceRow, type WarehouseRow } from "@/lib/stock-types";
import { ReceiptForm } from "./ReceiptForm";

export default async function StockReceiptPage() {
  const t = await getTranslations("stock");
  const tn = await getTranslations();
  const me = await getMe();
  if (!me.permissions.includes("stock:CREATE")) {
    return (
      <>
        <Topbar heading={t("receiptTitle")} />
        <p
          role="alert"
          className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8"
        >
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const [rows, whs] = await Promise.all([
    apiGet<BalanceRow[]>("/stock/balances"),
    apiGet<WarehouseRow[]>("/stock/warehouses"),
  ]);
  const items = [
    ...new Map(
      rows.map((r) => [r.itemId, { id: r.itemId, code: r.code, name: r.name, uom: r.uom }]),
    ).values(),
  ];
  const lots = rows
    .filter((r) => r.lotId)
    .map((r) => ({ itemId: r.itemId, id: r.lotId!, lotNo: r.lotNo! }))
    .filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i);
  const locations = whs.flatMap((w) =>
    w.locations.map((l) => ({ id: l.id, label: `${w.name} · ${l.code}` })),
  );
  return (
    <>
      <Topbar heading={t("receiptTitle")} sub={t("receiptSubtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        <ReceiptForm items={items} lots={lots} locations={locations} />
      </div>
    </>
  );
}
