import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtMoney } from "@/lib/format";
import { canView } from "@/lib/modules";

interface PriceRow {
  id: string;
  sku: string;
  name: string;
  taxCategory: string;
  price: string | null;
  currency: string;
  breakdown: { net: string; otv: string; kdv: string } | null;
}

/** Ücretlendirme (F2 hazırlığı, salt okunur): ürün fiyatı + vergi anatomisi. Oran TaxRule'dan. */
export default async function PricingPage() {
  const t = await getTranslations("pricing");
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
  const rows = await apiGet<PriceRow[]>("/pricing/overview");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <p className="m-0 max-w-3xl rounded-[10px] bg-warn-bg px-4 py-2 text-[13px] text-warn">{t("note")}</p>
        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          {rows.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-[13px]" aria-label={t("title")}>
              <thead>
                <tr>
                  <th className={th}>{t("col.product")}</th>
                  <th className={th}>{t("col.category")}</th>
                  <th className={`${th} text-right`}>{t("col.price")}</th>
                  <th className={`${th} text-right`}>{t("col.net")}</th>
                  <th className={`${th} text-right`}>{t("col.otv")}</th>
                  <th className={`${th} text-right`}>{t("col.kdv")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-soft">
                    <td className={td}>
                      <Link href={`/urunler/${r.id}`} className="font-semibold">
                        {r.name}
                      </Link>
                      <span className="num ml-2 text-[11.5px] text-muted">{r.sku}</span>
                    </td>
                    <td className={td}>{r.taxCategory}</td>
                    <td className={`${td} num text-right font-semibold`}>{r.price ? fmtMoney(r.price) : t("noPrice")}</td>
                    <td className={`${td} num text-right text-text-2`}>{r.breakdown ? fmtMoney(r.breakdown.net) : t("noPrice")}</td>
                    <td className={`${td} num text-right text-text-2`}>{r.breakdown ? fmtMoney(r.breakdown.otv) : t("noPrice")}</td>
                    <td className={`${td} num text-right text-text-2`}>{r.breakdown ? fmtMoney(r.breakdown.kdv) : t("noPrice")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <Link href="/urunler" className="self-start text-[13px] font-semibold">
          ← {tn("catalog.hub.vitrinTitle")}
        </Link>
      </div>
    </>
  );
}
