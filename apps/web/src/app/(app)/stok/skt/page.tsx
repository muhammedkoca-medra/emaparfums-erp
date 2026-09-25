import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pill, QC_TONE } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet } from "@/lib/api-server";
import { fmtDate, fmtQty } from "@/lib/format";

interface ExpiringResponse {
  days: number;
  lots: {
    lotId: string;
    lotNo: string;
    expiryDate: string;
    daysLeft: number;
    expired: boolean;
    qcStatus: string;
    item: { id: string; code: string; name: string; uom: string };
    qtyOnHand: string;
    qtyReserved: string;
  }[];
}

/** STK-08: SKT'si yaklaşan lotlar. Kampanya önerisi pazarlama modülüyle (Faz 4) gelir. */
export default async function ExpiringPage() {
  const t = await getTranslations("stock");
  const data = await apiGet<ExpiringResponse>("/stock/expiring");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";
  return (
    <>
      <Topbar heading={t("expiringTitle")} sub={t("expiringSubtitle", { days: data.days })} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          {data.lots.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">{t("noExpiring")}</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={th}>{t("col.item")}</th>
                  <th className={th}>{t("col.lot")}</th>
                  <th className={th}>{t("col.expiry")}</th>
                  <th className={`${th} text-right`}>{t("col.daysLeft")}</th>
                  <th className={`${th} text-right`}>{t("col.onHand")}</th>
                  <th className={`${th} text-right`}>{t("col.reserved")}</th>
                  <th className={th}>{t("col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.lots.map((l) => {
                  const uom = t.has(`uom.${l.item.uom}`) ? t(`uom.${l.item.uom}`) : l.item.uom;
                  return (
                    <tr key={l.lotId}>
                      <td className={td}>
                        <Link href={`/stok/kalem/${l.item.id}`} className="font-semibold">
                          {l.item.code} · {l.item.name}
                        </Link>
                      </td>
                      <td className={`${td} num`}>{l.lotNo}</td>
                      <td className={`${td} num`}>{fmtDate(l.expiryDate)}</td>
                      <td className={`${td} num text-right font-semibold`}>
                        {l.expired ? <Pill tone="bad">{t("expired")}</Pill> : l.daysLeft}
                      </td>
                      <td className={`${td} num text-right`}>
                        {fmtQty(l.qtyOnHand)} {uom}
                      </td>
                      <td className={`${td} num text-right text-text-2`}>
                        {fmtQty(l.qtyReserved)} {uom}
                      </td>
                      <td className={td}>
                        <Pill tone={QC_TONE[l.qcStatus] ?? "neu"}>{t(`qc.${l.qcStatus}`)}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
