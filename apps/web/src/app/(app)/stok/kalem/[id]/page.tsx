import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pill, QC_TONE } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtDateTime, fmtQty } from "@/lib/format";
import { type MovementRow, movementSign, type WarehouseRow } from "@/lib/stock-types";
import { ItemActions, type LotOption } from "./ItemActions";
import { ItemEditForm } from "./ItemEditForm";
import { ReleaseButton } from "./ReleaseButton";

interface ItemDetail {
  item: {
    id: string;
    code: string;
    name: string;
    type: string;
    uom: string;
    minStock: string | null;
    shelfLifeDays: number | null;
    storageNote: string | null;
    isHazardous: boolean;
    product: { id: string; sku: string; barcode: string | null; status: string } | null;
    lots: {
      id: string;
      lotNo: string;
      expiryDate: string | null;
      qcStatus: string;
      balances: {
        qtyOnHand: string;
        qtyReserved: string;
        location: { id: string; code: string; warehouse: { name: string } };
      }[];
    }[];
  };
  movements: MovementRow[];
  reservations: {
    id: string;
    qty: string;
    refType: string;
    note: string | null;
    createdAt: string;
    lot: { lotNo: string };
    location: { code: string };
  }[];
}

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("stock");
  const me = await getMe();
  let data: ItemDetail;
  try {
    data = await apiGet<ItemDetail>(`/stock/items/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const whs = await apiGet<WarehouseRow[]>("/stock/warehouses");
  const { item, movements, reservations } = data;
  const uom = t.has(`uom.${item.uom}`) ? t(`uom.${item.uom}`) : item.uom;
  const lotsWithStock = item.lots.filter((l) => l.balances.length > 0);
  const totalAvailable = lotsWithStock
    .flatMap((l) => l.balances)
    .reduce((a, b) => a + Number(b.qtyOnHand) - Number(b.qtyReserved), 0);

  const lotOptions: LotOption[] = lotsWithStock.map((l) => ({
    id: l.id,
    lotNo: l.lotNo,
    qcStatus: l.qcStatus,
    locations: l.balances.map((b) => ({ id: b.location.id, code: b.location.code, onHand: b.qtyOnHand })),
  }));
  const allLocations = whs.flatMap((w) =>
    w.locations.map((l) => ({ id: l.id, label: `${w.name} · ${l.code}` })),
  );
  const perms = new Set(me.permissions);

  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5 align-top";

  return (
    <>
      <Topbar heading={`${item.code} · ${item.name}`} sub={t(`type.${item.type}`)} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-2 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="m-0 font-display text-[19px] font-semibold">{t("item.lots")}</h2>
                <span className="text-[13px] text-text-2">
                  {t("item.totalAvailable")}:{" "}
                  <strong className="num">
                    {fmtQty(String(totalAvailable))} {uom}
                  </strong>
                </span>
              </div>
              {lotsWithStock.length === 0 ? (
                <p className="m-0 text-[13px] text-muted">{t("item.noLots")}</p>
              ) : (
                <table
                  className="w-full min-w-[560px] border-collapse text-[13px]"
                  aria-label={t("item.lots")}
                >
                  <thead>
                    <tr>
                      <th className={th}>{t("col.lot")}</th>
                      <th className={th}>{t("col.expiry")}</th>
                      <th className={th}>{t("col.status")}</th>
                      <th className={th}>{t("col.location")}</th>
                      <th className={`${th} text-right`}>{t("col.onHand")}</th>
                      <th className={`${th} text-right`}>{t("col.reserved")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotsWithStock.flatMap((l) =>
                      l.balances.map((b, i) => (
                        <tr key={`${l.id}-${b.location.id}`}>
                          <td className={`${td} num font-semibold`}>{i === 0 ? l.lotNo : ""}</td>
                          <td className={`${td} num`}>{i === 0 ? fmtDate(l.expiryDate) : ""}</td>
                          <td className={td}>
                            {i === 0 && (
                              <Pill tone={QC_TONE[l.qcStatus] ?? "neu"}>{t(`qc.${l.qcStatus}`)}</Pill>
                            )}
                          </td>
                          <td className={`${td} text-text-2`}>
                            {b.location.warehouse.name} · {b.location.code}
                          </td>
                          <td className={`${td} num text-right font-semibold`}>
                            {fmtQty(b.qtyOnHand)} {uom}
                          </td>
                          <td className={`${td} num text-right text-text-2`}>
                            {fmtQty(b.qtyReserved)} {uom}
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              )}
            </section>

            <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("item.reservations")}</h2>
              {reservations.length === 0 ? (
                <p className="m-0 text-[13px] text-muted">{t("item.noReservations")}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {reservations.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface-soft px-3 py-2 text-[13px]"
                    >
                      <span>
                        <strong className="num">
                          {fmtQty(r.qty)} {uom}
                        </strong>{" "}
                        · {r.lot.lotNo} · {r.location.code}
                        {r.note && <span className="text-muted"> · {r.note}</span>}
                      </span>
                      {perms.has("stock:EDIT") && <ReleaseButton id={r.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("item.movements")}</h2>
              {movements.length === 0 ? (
                <p className="m-0 text-[13px] text-muted">{t("noMovements")}</p>
              ) : (
                <table
                  className="w-full min-w-[640px] border-collapse text-[13px]"
                  aria-label={t("item.movements")}
                >
                  <thead>
                    <tr>
                      <th className={th}>{t("col.time")}</th>
                      <th className={th}>{t("col.type")}</th>
                      <th className={th}>{t("col.lot")}</th>
                      <th className={`${th} text-right`}>{t("col.qty")}</th>
                      <th className={th}>{t("col.location")}</th>
                      <th className={th}>{t("col.user")}</th>
                      <th className={th}>{t("col.note")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className={`${td} num whitespace-nowrap text-muted`}>
                          {fmtDateTime(m.createdAt)}
                        </td>
                        <td className={td}>{t(`movementType.${m.type}`)}</td>
                        <td className={`${td} num`}>{m.lotNo}</td>
                        <td className={`${td} num text-right font-semibold`}>
                          {movementSign(m)} {fmtQty(m.qty)} {uom}
                        </td>
                        <td className={`${td} text-text-2`}>{[m.from, m.to].filter(Boolean).join(" → ")}</td>
                        <td className={td}>{m.user ?? "—"}</td>
                        <td className={`${td} text-text-2`}>{m.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5 text-[13px]">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("item.info")}</h2>
              <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <dt className="text-muted">{t("item.minStock")}</dt>
                <dd className="num m-0">{item.minStock ? `${fmtQty(item.minStock)} ${uom}` : "—"}</dd>
                <dt className="text-muted">{t("item.storage")}</dt>
                <dd className="m-0">{item.storageNote ?? "—"}</dd>
                {item.isHazardous && (
                  <>
                    <dt className="text-muted">{t("item.hazardous")}</dt>
                    <dd className="m-0">
                      <Pill tone="warn">UN</Pill>
                    </dd>
                  </>
                )}
                {item.product && (
                  <>
                    <dt className="text-muted">{t("item.product")}</dt>
                    <dd className="num m-0">{item.product.sku}</dd>
                  </>
                )}
              </dl>
            </section>
            {perms.has("stock:EDIT") && <ItemEditForm item={item} />}
            {(perms.has("stock:CREATE") || perms.has("quality:APPROVE")) && (
              <ItemActions
                itemId={item.id}
                uom={uom}
                lots={lotOptions}
                locations={allLocations}
                warehouses={whs.map((w) => ({ id: w.id, name: w.name }))}
                canMove={perms.has("stock:CREATE")}
                canQc={perms.has("quality:APPROVE")}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
