"use client";

import { SETUP_BATCH_SIZE, setupLiquidQty } from "@atelier/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtQty } from "@/lib/format";

export interface SetupData {
  product: { id: string; sku: string; name: string; volumeMl: number };
  formula: {
    id: string;
    code: string;
    version: number;
    status: string;
    concentrationPct: string;
    lines: { percentage: string; item: { id: string; code: string; name: string; uom: string } }[];
  } | null;
  bom: { batchSize: number; lines: { qty: string; uom: string; item: { id: string; code: string; name: string; type: string } }[] } | null;
  options: {
    liquids: { id: string; code: string; name: string; uom: string }[];
    packaging: { id: string; code: string; name: string }[];
  };
  canApprove: boolean;
  canCreateItems: boolean;
}

const NEW = "__new__";
const skuTail = (sku: string) => {
  const s = sku.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return s.length >= 2 ? s : `${s}00`;
};

/**
 * Hızlı üretim kurulumu (hazır esans + parfüm bazı): formül + reçete tek adımda, ürüne bağlanır.
 * Varsayılanlar: ürünün esans kartı yoksa yenisi (ES-<SKU>); daha önce açılmış bir baz varsa o seçilir.
 */
export function ProductionSetupPanel({
  data,
  canCreate,
  nextProduct = null,
}: {
  data: SetupData;
  canCreate: boolean;
  nextProduct?: { id: string; name: string } | null;
}) {
  const t = useTranslations("production.setup");
  const router = useRouter();
  const { product, formula, bom, options } = data;
  const essenceCode = `ES-${skuTail(product.sku)}`;
  const currentEssence = formula?.lines[0]?.item.id;
  const existingEssence = options.liquids.find((l) => l.code === essenceCode)?.id;
  const currentBase = bom?.lines.find((l) => l.item.type === "RAW_MATERIAL" && l.item.id !== currentEssence)?.item.id;
  const existingBase = options.liquids.find((l) => /baz|alkol|alcohol/i.test(l.name) && l.code !== essenceCode)?.id;

  const [conc, setConc] = useState(formula ? String(Number(formula.concentrationPct)) : "");
  const [essenceSel, setEssenceSel] = useState(currentEssence ?? existingEssence ?? (data.canCreateItems ? NEW : ""));
  const [essenceNew, setEssenceNew] = useState({ code: essenceCode, name: `Esans · ${product.name}`.slice(0, 120) });
  const [baseSel, setBaseSel] = useState(currentBase ?? existingBase ?? (data.canCreateItems ? NEW : ""));
  const [baseNew, setBaseNew] = useState({ code: "BZ-PARFUM", name: "Parfüm bazı (alkol)" });
  const [pack, setPack] = useState<Set<string>>(
    new Set(bom?.lines.filter((l) => l.item.type === "PACKAGING").map((l) => l.item.id) ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const concValid = /^\d{1,2}(\.\d{1,2})?$/.test(conc.trim()) && Number(conc) > 0 && Number(conc) < 100;
  const uomOf = (sel: string) => (sel === NEW ? "L" : (options.liquids.find((l) => l.id === sel)?.uom as "L" | "ML" | undefined) ?? "L");
  const perBottleEssence = concValid ? (product.volumeMl * Number(conc)) / 100 : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost<{ formula: { code: string; version: number; status: string }; linked: boolean }>(
        `/production/setup/${product.id}`,
        {
          concentrationPct: conc.trim(),
          essence: essenceSel === NEW ? { newItem: { code: essenceNew.code.trim().toUpperCase(), name: essenceNew.name.trim() } } : { itemId: essenceSel },
          base: baseSel === NEW ? { newItem: { code: baseNew.code.trim().toUpperCase(), name: baseNew.name.trim() } } : { itemId: baseSel },
          packagingItemIds: [...pack],
        },
      );
      setMsg({
        ok: true,
        text:
          res.formula.status === "APPROVED"
            ? t("doneApproved", { code: res.formula.code, version: res.formula.version })
            : t("doneReview", { code: res.formula.code, version: res.formula.version }),
      });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("save")) });
    } finally {
      setBusy(false);
    }
  }

  const liquidSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <label className={labelCls}>
      {label}
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="" disabled>
          {t("choose")}
        </option>
        {data.canCreateItems && <option value={NEW}>+ {t("newItem")}</option>}
        {options.liquids.map((l) => (
          <option key={l.id} value={l.id}>
            {l.code} · {l.name} ({l.uom})
          </option>
        ))}
      </select>
    </label>
  );

  const newItemFields = (v: { code: string; name: string }, set: (v: { code: string; name: string }) => void) => (
    <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-2 rounded-[10px] bg-surface-soft p-2.5">
      <label className={labelCls}>
        <span className="text-[11.5px]">{t("itemCode")}</span>
        <input className={`${inputCls} num`} value={v.code} onChange={(e) => set({ ...v, code: e.target.value.toUpperCase() })} required />
      </label>
      <label className={labelCls}>
        <span className="text-[11.5px]">{t("itemName")}</span>
        <input className={inputCls} value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} required minLength={2} />
      </label>
    </div>
  );

  return (
    <section id="uretim-kurulumu" className="flex scroll-mt-20 flex-col gap-4 rounded-[18px] border border-line bg-surface p-5" aria-label={t("title")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-display text-[18px] font-semibold">{t("title")}</h2>
          <p className="m-0 text-[12px] text-muted">{t("intro")}</p>
        </div>
        {formula ? (
          <span
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
              formula.status === "APPROVED" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"
            }`}
          >
            {formula.code} v{formula.version} · {t(`status.${formula.status}`)}
          </span>
        ) : (
          <span className="rounded-full bg-bad-bg px-3 py-1 text-[11.5px] font-semibold text-bad">{t("notSetUp")}</span>
        )}
      </div>

      {/* Mevcut reçete */}
      {formula && bom && (
        <div className="flex flex-col gap-2 rounded-[12px] bg-surface-soft p-3 text-[13px]">
          <span className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
            {t("currentBom", { size: bom.batchSize, pct: fmtQty(formula.concentrationPct) })}
          </span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {bom.lines.map((l) => (
              <li key={l.item.id} className="flex justify-between gap-3">
                <span>
                  {l.item.code} · {l.item.name}
                </span>
                <span className="num font-semibold">
                  {fmtQty(l.qty)} {l.uom === "PCS" ? t("pcs") : l.uom}
                </span>
              </li>
            ))}
          </ul>
          {formula.status === "APPROVED" && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/uretim" className="text-[12.5px] font-semibold text-gold-text">
                {t("openBatch")} →
              </Link>
              {nextProduct && (
                <Link
                  href={`/urunler/${nextProduct.id}#uretim-kurulumu`}
                  className="inline-flex min-h-9 items-center rounded-[9px] bg-ink px-4 text-[13px] font-semibold text-on-ink no-underline hover:opacity-90"
                >
                  {t("nextProduct", { name: nextProduct.name })} →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {canCreate && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <h3 className="m-0 text-[13px] font-bold">{formula ? t("updateTitle") : t("createTitle")}</h3>

          <label className={labelCls}>
            {t("concentration")}
            <input
              className={`${inputCls} num`}
              inputMode="decimal"
              placeholder={t("concentrationPlaceholder")}
              value={conc}
              onChange={(e) => setConc(e.target.value.replace(",", "."))}
              required
            />
            <span className="text-[11px] font-normal text-muted">{t("concentrationHint")}</span>
          </label>

          <div className="flex flex-col gap-2">
            {liquidSelect(essenceSel, setEssenceSel, t("essence"))}
            {essenceSel === NEW && newItemFields(essenceNew, setEssenceNew)}
          </div>
          <div className="flex flex-col gap-2">
            {liquidSelect(baseSel, setBaseSel, t("base"))}
            {baseSel === NEW && newItemFields(baseNew, setBaseNew)}
          </div>

          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1 text-[13px] font-semibold">{t("packaging")}</legend>
            {options.packaging.length === 0 ? (
              <p className="m-0 text-[12px] text-muted">{t("noPackaging")}</p>
            ) : (
              options.packaging.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#b8864b]"
                    checked={pack.has(p.id)}
                    onChange={() =>
                      setPack((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                  />
                  {p.code} · {p.name}
                </label>
              ))
            )}
          </fieldset>

          {/* Canlı önizleme */}
          {concValid && (
            <div className="grid gap-2 rounded-[12px] border border-gold-2/50 bg-surface-soft p-3 text-[12.5px] sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">{t("perBottle", { vol: product.volumeMl })}</span>
                <span className="num">
                  {t("essence")}: <strong className="text-gold-text">{fmtQty(String(perBottleEssence))} ml</strong> · {t("base")}:{" "}
                  <strong>{fmtQty(String(product.volumeMl - (perBottleEssence ?? 0)))} ml</strong>
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">{t("perBatch", { size: SETUP_BATCH_SIZE })}</span>
                <span className="num">
                  {t("essence")}:{" "}
                  <strong className="text-gold-text">
                    {fmtQty(setupLiquidQty(product.volumeMl, conc, "essence", uomOf(essenceSel)))} {uomOf(essenceSel)}
                  </strong>{" "}
                  · {t("base")}: <strong>{fmtQty(setupLiquidQty(product.volumeMl, conc, "base", uomOf(baseSel)))} {uomOf(baseSel)}</strong>
                </span>
              </div>
            </div>
          )}

          {!data.canApprove && <p className="m-0 text-[12px] text-warn">{t("needsApproval")}</p>}
          <button type="submit" disabled={busy || !concValid || !essenceSel || !baseSel} className={`${primaryBtn} self-start`}>
            {busy ? t("saving") : formula ? t("update") : t("save")}
          </button>
        </form>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
