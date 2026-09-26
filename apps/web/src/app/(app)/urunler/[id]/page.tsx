import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BOTTLE_MODELS } from "@atelier/shared";
import { accordColor } from "@/app/vitrin/accords";
import { BottleViewer } from "@/components/BottleViewer";
import { Pill, PRODUCT_TONE } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtMoney, fmtQty } from "@/lib/format";
import { ProductActions } from "../ProductActions";
import { ProductForm } from "./ProductForm";
import { ScentEditor } from "./ScentEditor";

interface ProductDetail {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  concentration: string;
  volumeMl: number;
  gtip: string;
  taxCategory: string;
  status: string;
  bottleModel: string | null;
  item: { id: string; code: string; name: string };
  formula: { id: string; code: string; version: number; name: string; status: string; concentrationPct: string } | null;
  notes: { name: string; family: string; tier: "TOP" | "HEART" | "BASE" }[];
  accords: { accord: string; score: number }[];
  canEditScent: boolean;
  canSeeFormula: boolean;
}

interface Overview {
  imageUrl: string | null;
  bottleModel: string | null;
  scentProfile: { accords?: { label: string; strength: number }[]; dayPct?: number; seasons?: Record<string, number> } | null;
  stock: { onHand: string; reserved: string; available: string; uom: string };
  price: { amount: string; currency: string; includesTax: boolean } | null;
  rawMaterials: { code: string; name: string; uom: string; onHand: string; minStock: string | null; belowMin: boolean; pct: string }[] | null;
}

const SEASONS = ["winter", "spring", "summer", "autumn"] as const;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("catalog");
  const th = await getTranslations("catalog.hub");
  const tf = await getTranslations("formulas");
  const ts = await getTranslations("stock");
  const me = await getMe();
  let p: ProductDetail;
  try {
    p = await apiGet<ProductDetail>(`/catalog/products/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const ov = await apiGet<Overview>(`/catalog/products/${encodeURIComponent(id)}/overview`).catch(() => null);
  const rules = me.permissions.includes("tax:VIEW") ? await apiGet<{ category: string }[]>("/tax/rules") : [];
  const categories = [...new Set([p.taxCategory, ...rules.map((r) => r.category)])];
  const uom = (u: string) => (ts.has(`uom.${u}`) ? ts(`uom.${u}`) : u);
  const sp = ov?.scentProfile ?? null;
  const bottle = BOTTLE_MODELS.find((b) => b.code === (ov?.bottleModel ?? p.bottleModel)) ?? null;

  const metric = (label: string, value: string, tone = "text-text") => (
    <div className="flex flex-col gap-0.5 rounded-[12px] bg-surface-soft px-3 py-2.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`num font-display text-[19px] font-semibold ${tone}`}>{value}</span>
    </div>
  );

  return (
    <>
      <Topbar
        heading={p.name}
        sub={`${p.sku} · ${p.item.code}`}
        action={<Pill tone={PRODUCT_TONE[p.status] ?? "neu"}>{t(`status.${p.status}`)}</Pill>}
      />
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-8">
        <Link href="/urunler" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        {/* Genel bakış: görsel + metrikler + hızlı erişim */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="relative aspect-square overflow-hidden rounded-[20px] border border-line bg-surface-soft shadow-md">
            {ov?.imageUrl ? (
              <Image src={ov.imageUrl} alt={p.name} fill sizes="360px" priority className="object-contain p-2" />
            ) : (
              <div className="flex h-full items-center justify-center font-display text-[24px] text-muted">{p.name}</div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {metric(th("available"), ov ? `${fmtQty(ov.stock.available)} ${uom(ov.stock.uom)}` : "—", "text-ok")}
              {metric(th("onHand"), ov ? `${fmtQty(ov.stock.onHand)} ${uom(ov.stock.uom)}` : "—")}
              {metric(th("reserved"), ov ? `${fmtQty(ov.stock.reserved)} ${uom(ov.stock.uom)}` : "—", "text-text-2")}
              {metric(th("price"), ov?.price ? fmtMoney(ov.price.amount) : th("noPrice"), ov?.price ? "text-text" : "text-muted")}
              {metric(t("col.concentration"), `${t(`concentration.${p.concentration}`)} · ${p.volumeMl}ml`)}
              {metric(th("formula"), p.formula ? `${p.formula.code} v${p.formula.version}` : "—", p.formula ? "text-text" : "text-muted")}
            </div>
            <div>
              <h2 className="mb-2 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">{th("actions")}</h2>
              <ProductActions itemId={p.item.id} size="md" />
            </div>
            {bottle && (
              <div className="flex items-center gap-4 rounded-[16px] border border-line bg-ink p-3">
                <BottleViewer objUrl={bottle.objUrl} glassColor={bottle.glass} poster="" className="aspect-[4/5] h-32 w-24 shrink-0 cursor-grab active:cursor-grabbing" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-gold uppercase">{th("bottle")}</span>
                  <span className="font-display text-[16px] font-semibold text-on-ink">{bottle.name}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* İnfografik: koku karakteri, gündüz/gece, mevsim */}
        {sp && (sp.accords?.length || sp.dayPct != null) && (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
              <h2 className="m-0 font-display text-[17px] font-semibold">{th("character")}</h2>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {(sp.accords ?? []).map((a) => (
                  <li key={a.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[13px] font-medium capitalize sm:w-32">{a.label}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-soft">
                      <span className="block h-full rounded-full" style={{ width: `${a.strength}%`, background: accordColor(a.label) }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              {sp.dayPct != null && (
                <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-5">
                  <h3 className="m-0 text-[14px] font-bold">{th("dayNight")}</h3>
                  <div className="flex h-7 overflow-hidden rounded-full border border-line-soft text-[11px] font-semibold">
                    <span className="flex items-center justify-center bg-gold text-ink" style={{ width: `${sp.dayPct}%` }}>
                      {sp.dayPct >= 25 ? th("day") : ""}
                    </span>
                    <span className="flex flex-1 items-center justify-center bg-ink text-on-ink">{100 - sp.dayPct >= 25 ? th("night") : ""}</span>
                  </div>
                </div>
              )}
              {sp.seasons && (
                <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-5">
                  <h3 className="m-0 text-[14px] font-bold">{th("seasons")}</h3>
                  <dl className="m-0 grid grid-cols-2 gap-2">
                    {SEASONS.map((s) => (
                      <div key={s} className="flex flex-col gap-1">
                        <dt className="text-[12px] text-text-2">{th(`season.${s}`)}</dt>
                        <dd className="m-0">
                          <span className="block h-2 overflow-hidden rounded-full bg-surface-soft">
                            <span className="block h-full rounded-full bg-gold" style={{ width: `${sp.seasons?.[s] ?? 0}%` }} />
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Hammadde stoğu (üretim yetkisi) */}
        <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 font-display text-[17px] font-semibold">{th("rawMaterials")}</h2>
            {p.formula && p.canSeeFormula && (
              <Link href={`/formuller/${p.formula.id}`} className="text-[12px] font-semibold text-gold-text">
                {p.formula.code} · v{p.formula.version} · {tf(`status.${p.formula.status}`)} →
              </Link>
            )}
          </div>
          {!p.canSeeFormula ? (
            <p className="m-0 text-[13px] text-muted">{th("rawHidden")}</p>
          ) : !ov?.rawMaterials || ov.rawMaterials.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">{th("noFormula")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[13px]">
                <tbody>
                  {ov.rawMaterials.map((r) => (
                    <tr key={r.code} className="border-t border-line-soft first:border-t-0">
                      <td className="px-2 py-2 font-medium">
                        {r.code} · {r.name}
                      </td>
                      <td className="num px-2 py-2 text-right text-text-2">%{fmtQty(r.pct)}</td>
                      <td className="num px-2 py-2 text-right">
                        {fmtQty(r.onHand)} {uom(r.uom)}
                      </td>
                      <td className="px-2 py-2 text-right">{r.belowMin && <Pill tone="bad">{th("belowMin")}</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Kart düzenleme (yetkiye göre) */}
        <details className="rounded-[18px] border border-line bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-display text-[17px] font-semibold">{th("editArea")}</summary>
          <div className="grid gap-4 border-t border-line-soft p-5 xl:grid-cols-2">
            <ProductForm product={p} categories={categories} canEdit={me.permissions.includes("sales:EDIT")} />
            <ScentEditor productId={p.id} notes={p.notes} accords={p.accords} canEdit={p.canEditScent} />
          </div>
        </details>
      </div>
    </>
  );
}
