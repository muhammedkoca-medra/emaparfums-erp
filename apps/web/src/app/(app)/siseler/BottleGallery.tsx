"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BottleViewer } from "@/components/BottleViewer";
import { fmtQty } from "@/lib/format";

export interface BottleRow {
  code: string;
  name: string;
  objUrl: string;
  glass: number;
  volumeMl: number;
  item: { id: string; code: string; name: string; uom: string } | null;
  stock: { onHand: string; reserved: string; available: string; uom: string } | null;
  productCount: number;
}

/** Şişe galerisi: model seç → 3B görüntüle + stok. Stok girişi bağlı ambalaj kalemine yönlendirir. */
export function BottleGallery({ bottles, canEditStock }: { bottles: BottleRow[]; canEditStock: boolean }) {
  const t = useTranslations("bottles");
  const ts = useTranslations("stock");
  const [active, setActive] = useState(bottles[0]?.code ?? "");
  const sel = bottles.find((b) => b.code === active) ?? bottles[0];
  if (!sel) return null;
  const uom = (u: string) => (ts.has(`uom.${u}`) ? ts(`uom.${u}`) : u);

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Model listesi */}
      <ul className="m-0 flex list-none flex-row gap-2 overflow-x-auto p-0 lg:flex-col">
        {bottles.map((b) => (
          <li key={b.code} className="shrink-0 lg:shrink">
            <button
              type="button"
              onClick={() => setActive(b.code)}
              aria-current={b.code === active ? "true" : undefined}
              className={`flex w-full min-w-[160px] flex-col gap-0.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors ${
                b.code === active ? "border-ink bg-ink text-on-ink" : "border-line bg-surface hover:border-gold-2"
              }`}
            >
              <span className="font-display text-[15px] font-semibold">{b.name}</span>
              <span className={`num text-[11px] ${b.code === active ? "text-on-ink-2" : "text-muted"}`}>
                {b.stock ? `${fmtQty(b.stock.available)} ${uom(b.stock.uom)}` : t("noItem")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Seçili model: 3B + stok */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col items-center gap-2 rounded-[18px] border border-line bg-ink p-4">
          <BottleViewer
            key={sel.code}
            objUrl={sel.objUrl}
            glassColor={sel.glass}
            poster=""
            className="aspect-[4/5] h-80 w-full cursor-grab active:cursor-grabbing"
          />
          <p className="m-0 text-[13px] font-semibold text-on-ink">{sel.name}</p>
        </div>

        <div className="flex flex-col gap-3">
          <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("stock")}</h2>
            {sel.stock ? (
              <dl className="m-0 grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["available", sel.stock.available, "text-ok"],
                    ["onHand", sel.stock.onHand, "text-text"],
                    ["reserved", sel.stock.reserved, "text-text-2"],
                  ] as const
                ).map(([k, v, tone]) => (
                  <div key={k} className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
                    <dt className="text-[11px] text-muted">{t(k)}</dt>
                    <dd className={`num m-0 font-display text-[18px] font-semibold ${tone}`}>{fmtQty(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="m-0 text-[13px] text-muted">{t("noItem")}</p>
            )}
            {sel.item && (
              <span className="num text-xs text-muted">{sel.item.code}</span>
            )}
            {sel.item && canEditStock && (
              <Link href={`/stok/kalem/${sel.item.id}`} className="inline-flex w-fit items-center rounded-[9px] bg-ink px-4 py-2 text-[13px] font-semibold text-on-ink no-underline">
                {t("enterStock")} →
              </Link>
            )}
          </section>
          <section className="flex flex-col gap-1 rounded-[16px] border border-line bg-surface p-5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted">{t("volume")}</span>
              <span className="num font-semibold">{sel.volumeMl} ml</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t("usedBy", { count: sel.productCount })}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
