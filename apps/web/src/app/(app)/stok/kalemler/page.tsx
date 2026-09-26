import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtQty } from "@/lib/format";
import { NewItemForm } from "./NewItemForm";

interface ItemRow {
  id: string;
  code: string;
  name: string;
  type: string;
  uom: string;
  minStock: string | null;
  shelfLifeDays: number | null;
  isHazardous: boolean;
  product: { id: string; sku: string } | null;
}

/** Kalem kartları (F1-01): stokta tutulan her şey. Ticari bilgi ürün kartındadır. */
export default async function ItemsPage() {
  const t = await getTranslations("catalog");
  const ts = await getTranslations("stock");
  const me = await getMe();
  const items = await apiGet<ItemRow[]>("/catalog/items");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";
  return (
    <>
      <Topbar heading={t("itemsTitle")} sub={t("itemsSubtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok" className="self-start text-[13px] font-semibold">
          ← {ts("back")}
        </Link>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            <table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label={t("itemsTitle")}>
              <thead>
                <tr>
                  <th className={th}>{t("col.code")}</th>
                  <th className={th}>{t("col.name")}</th>
                  <th className={th}>{t("col.type")}</th>
                  <th className={`${th} text-right`}>{t("col.minStock")}</th>
                  <th className={`${th} text-right`}>{t("col.shelfLife")}</th>
                  <th className={th}>{t("col.sku")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const uom = ts.has(`uom.${i.uom}`) ? ts(`uom.${i.uom}`) : i.uom;
                  return (
                    <tr key={i.id} className="hover:bg-surface-soft">
                      <td className={`${td} num font-bold text-text-2`}>{i.code}</td>
                      <td className={td}>
                        <Link href={`/stok/kalem/${i.id}`} className="font-semibold">
                          {i.name}
                        </Link>
                      </td>
                      <td className={td}>{ts(`type.${i.type}`)}</td>
                      <td className={`${td} num text-right`}>{i.minStock ? `${fmtQty(i.minStock)} ${uom}` : "—"}</td>
                      <td className={`${td} num text-right`}>{i.shelfLifeDays ?? "—"}</td>
                      <td className={td}>
                        {i.product ? (
                          <Link href={`/urunler/${i.product.id}`} className="num">
                            {i.product.sku}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {me.permissions.includes("stock:CREATE") && <NewItemForm />}
        </div>
      </div>
    </>
  );
}
