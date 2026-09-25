import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { COUNT_TONE, Pill } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { type WarehouseRow } from "@/lib/stock-types";
import { NewCountForm } from "./NewCountForm";

interface CountRow {
  id: string;
  status: "OPEN" | "SUBMITTED" | "APPROVED";
  zone: string | null;
  isBlind: boolean;
  needsApproval: boolean;
  varianceValue: string | null;
  createdAt: string;
  warehouse: { name: string };
  lineCount: number;
}

export default async function CountsPage() {
  const t = await getTranslations("stock");
  const me = await getMe();
  const [counts, whs] = await Promise.all([
    apiGet<CountRow[]>("/stock/counts"),
    apiGet<WarehouseRow[]>("/stock/warehouses"),
  ]);
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";
  return (
    <>
      <Topbar heading={t("counts.title")} sub={t("counts.subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            {counts.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("counts.listEmpty")}</p>
            ) : (
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={th}>{t("counts.created")}</th>
                    <th className={th}>{t("counts.warehouse")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={th}>{t("col.qty")}</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.id}>
                      <td className={`${td} num text-text-2`}>{fmtDateTime(c.createdAt)}</td>
                      <td className={td}>
                        {c.warehouse.name}
                        {c.zone && <span className="text-muted"> · {c.zone}</span>}
                      </td>
                      <td className={td}>
                        <Pill tone={COUNT_TONE[c.status]}>{t(`counts.status.${c.status}`)}</Pill>
                        {c.varianceValue && (
                          <span className="num ml-2 text-xs text-muted">{fmtMoney(c.varianceValue)}</span>
                        )}
                      </td>
                      <td className={`${td} text-text-2`}>{t("counts.lines", { count: c.lineCount })}</td>
                      <td className={`${td} text-right`}>
                        <Link href={`/stok/sayim/${c.id}`} className="font-semibold">
                          {t("counts.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {me.permissions.includes("stock:CREATE") && (
            <NewCountForm warehouses={whs.map((w) => ({ id: w.id, name: w.name }))} />
          )}
        </div>
      </div>
    </>
  );
}
