import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { PoActions } from "./PoActions";
import { PoStatusPill } from "../PoStatusPill";

interface Po {
  id: string;
  number: string;
  status: string;
  currency: string;
  total: string;
  supplier: { name: string };
  lines: { id: string; item: { code: string; name: string; uom: string }; qty: string; unitPrice: string; kdvRate: string; receivedQty: string }[];
  receipts: { id: string; number: string; lineCount: number; createdAt: string }[];
}

export default async function PoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("purchasing");
  const me = await getMe();
  let po: Po;
  try {
    po = await apiGet<Po>(`/purchasing/orders/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={po.number} sub={po.supplier.name} action={<PoStatusPill status={po.status} />} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/satin-alma" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        <PoActions
          id={po.id}
          status={po.status}
          lines={po.lines.map((l) => ({ id: l.id, item: l.item, qty: l.qty, receivedQty: l.receivedQty }))}
          canCreate={me.permissions.includes("purchasing:CREATE")}
          canApprove={me.permissions.includes("purchasing:APPROVE")}
        />

        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-3 font-display text-[17px] font-semibold">{t("section.lines")}</h2>
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={th}>{t("line.item")}</th>
                <th className={`${th} text-right`}>{t("line.qty")}</th>
                <th className={`${th} text-right`}>{t("line.unit")}</th>
                <th className={`${th} text-right`}>{t("line.received")}</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td className={td}>
                    {l.item.code} · {l.item.name}
                  </td>
                  <td className={`${td} num text-right`}>
                    {fmtQty(l.qty)} {l.item.uom}
                  </td>
                  <td className={`${td} num text-right`}>{fmtMoney(l.unitPrice)}</td>
                  <td className={`${td} num text-right ${Number(l.receivedQty) >= Number(l.qty) ? "text-ok" : "text-text-2"}`}>{fmtQty(l.receivedQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-right text-[13px] font-bold">
            {t("col.total")}: {fmtMoney(po.total)}
          </div>
        </section>

        {po.receipts.length > 0 && (
          <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5 text-[13px]">
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.receipts")}</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {po.receipts.map((r) => (
                <li key={r.id} className="flex justify-between border-t border-line-soft py-1.5 first:border-t-0">
                  <span className="num font-semibold">{r.number}</span>
                  <span className="num text-muted">{fmtDate(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
