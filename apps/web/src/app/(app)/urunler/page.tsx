import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pill, PRODUCT_TONE } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";
import { ProductActions } from "./ProductActions";

interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  concentration: string;
  volumeMl: number;
  gtip: string;
  taxCategory: string;
  status: string;
  item: { id: string; code: string };
  formula: { id: string; code: string; version: number; status: string } | null;
  imageUrl: string | null;
  inStock: boolean;
}

/** Ürün vitrini (yönetici): görsel katalog + her karttan üretim/stok/satış/fiyat hızlı erişimi. */
export default async function ProductsPage() {
  const t = await getTranslations("catalog");
  const th = await getTranslations("catalog.hub");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "sales")) {
    return (
      <>
        <Topbar heading={th("vitrinTitle")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const canCreate = me.permissions.includes("sales:CREATE");
  const products = await apiGet<ProductRow[]>("/catalog/products");

  return (
    <>
      <Topbar heading={th("vitrinTitle")} sub={th("vitrinSub")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          {canView(me.permissions, "stock") && (
            <Link href="/stok/kalemler" className="text-[13px] font-semibold">
              {t("itemsLink")} →
            </Link>
          )}
          <span className="ml-auto text-xs text-muted">{products.length}</span>
          {canCreate && (
            <Link
              href="/urunler/yeni"
              className="inline-flex min-h-9 items-center rounded-[9px] bg-ink px-4 text-[13px] font-semibold text-on-ink no-underline transition-opacity hover:opacity-90"
            >
              + {t("newProduct")}
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <p className="m-0 rounded-[16px] border border-line bg-surface p-5 text-[13px] text-muted">{t("empty")}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-sm transition-shadow hover:shadow-lg">
                <Link href={`/urunler/${p.id}`} className="group relative block aspect-square overflow-hidden bg-surface-soft p-2 no-underline">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 400px"
                      className="object-contain transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-[20px] text-muted">{p.name}</div>
                  )}
                  <span className="absolute top-3 right-3">
                    <Pill tone={PRODUCT_TONE[p.status] ?? "neu"}>{t(`status.${p.status}`)}</Pill>
                  </span>
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/urunler/${p.id}`} className="block truncate font-display text-[17px] font-semibold text-text no-underline hover:text-gold-hover">
                        {p.name}
                      </Link>
                      <Link href={`/urunler/${p.id}`} className="num text-[12px] font-semibold text-gold-text no-underline hover:underline">
                        {p.sku}
                      </Link>
                      <span className="ml-2 text-[11.5px] text-muted">{p.item.code}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] text-muted">
                        {t(`concentration.${p.concentration}`)} · {p.volumeMl}ml
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                          p.inStock ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${p.inStock ? "bg-ok" : "bg-bad"}`} />
                        {t(p.inStock ? "stock.in" : "stock.out")}
                      </span>
                    </div>
                  </div>
                  <ProductActions itemId={p.item.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
