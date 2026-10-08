"use client";

import { expectedUnits, isFullRecipe, type RecipeRole, splitByConcentration, START_STAGES } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { MassRecipeEditor, type RecipeState, recipeFromPercents } from "@/components/MassRecipeEditor";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiGetClient, apiPost, errorText } from "@/lib/api-client";
import { fmtQty } from "@/lib/format";

export interface BatchProductOption {
  id: string;
  label: string;
  volumeMl: number;
  concentrationPct: string;
}

interface Recipe {
  mass: boolean;
  densityGPerMl: string | null;
  components: { itemId: string; code: string; name: string; role: RecipeRole; pct: string }[];
  lotNoPreview: string;
}

/**
 * Yeni üretim partisi. Kütlesel reçeteli üründe hacim (mL) × yoğunluk = toplam gram; bileşen gramları
 * reçete yüzdesinden gelir, gram ya da yüzde elle düzeltilebilir (biri değişince diğeri güncellenir).
 * Lot numarası parti açılırken otomatik atanır (önizlemede gösterilir).
 * Eski (kütlesel olmayan) formüllerde parti hacimle (ml) açılır. Esans/baz ürünün onaylı formül konsantrasyonundan
 * bölünür, beklenen şişe adedi = ⌊ml ÷ şişe ml⌋. Önizleme sunucudaki hesapla aynı fonksiyonu kullanır.
 */
export function NewBatchForm({ products }: { products: BatchProductOption[] }) {
  const t = useTranslations("production");
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [ml, setMl] = useState("");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [mass, setMass] = useState<RecipeState | null>(null);

  async function chooseProduct(id: string) {
    setProductId(id);
    setRecipe(null);
    setMass(null);
    if (!id) return;
    try {
      const r = await apiGetClient<Recipe>(`/production/recipe/${encodeURIComponent(id)}`);
      setRecipe(r);
      if (r.mass && r.densityGPerMl) {
        const rows = r.components.map((c) => ({ key: c.itemId, role: c.role, label: c.name, pct: String(Number(c.pct)), grams: "" }));
        setMass(recipeFromPercents(ml || "", String(Number(r.densityGPerMl)), rows));
      }
    } catch (err) {
      setError(errorText(err, t("form.saved")));
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Devam eden (mevcut) üretimi kaydetme: aşama + geçmiş tarih (URT-14)
  const [existing, setExisting] = useState(false);
  const [startStage, setStartStage] = useState<(typeof START_STAGES)[number]>("MACERATION");
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const [startedAt, setStartedAt] = useState(nowLocal);
  const [macerationStart, setMacerationStart] = useState("");
  const pastMaceration = existing && START_STAGES.indexOf(startStage) > START_STAGES.indexOf("MACERATION");

  const product = products.find((p) => p.id === productId) ?? null;
  // type="number" değeri her zaman "." ondalıklı standart biçimdedir (yerel binlik ayırıcı karışmaz).
  const mlClean = (mass ? mass.ml : ml).trim();
  const validMl = /^\d{1,9}(\.\d{1,2})?$/.test(mlClean) && Number(mlClean) > 0;
  const preview =
    product && validMl
      ? { ...splitByConcentration(mlClean, product.concentrationPct), units: expectedUnits(mlClean, product.volumeMl) }
      : null;
  const massValid = !mass || (isFullRecipe(mass.rows.map((r) => r.pct || "0")) && mass.rows.every((r) => Number(r.grams) > 0));
  // Gramlar elle değiştiyse (yüzdeler reçeteden saptıysa) sunucuya gramlar gönderilir; yoksa reçete yüzdesi geçerli.
  const gramsEdited = !!(mass && recipe && mass.rows.some((r, i) => Number(r.pct) !== Number(recipe.components[i]?.pct)));

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/production/batches", {
        productId,
        plannedMl: Number(mlClean).toFixed(2),
        ...(mass
          ? {
              densityGPerMl: mass.density,
              ...(gramsEdited ? { components: mass.rows.map((r) => ({ itemId: r.key, grams: Number(r.grams).toFixed(2) })) } : {}),
            }
          : {}),
        macerationDays: Number(d.get("macerationDays")),
        macerationPlace: String(d.get("macerationPlace") ?? "").trim() || undefined,
        bottleType: d.get("bottleType"),
        ...(existing
          ? {
              startStage,
              startedAt: new Date(startedAt).toISOString(),
              ...(pastMaceration && macerationStart ? { macerationStart: new Date(macerationStart).toISOString() } : {}),
            }
          : {}),
      });
      router.push(`/uretim/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  if (products.length === 0) {
    return (
      <section className="self-start rounded-[16px] border border-line bg-surface p-5">
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">{t("new")}</h2>
        <p className="m-0 text-[13px] text-muted">{t("form.noFormula")}</p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("new")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("new")}</h2>
      <label className={labelCls}>
        {t("form.product")}
        <select name="productId" required className={inputCls} value={productId} onChange={(e) => void chooseProduct(e.target.value)}>
          <option value="" disabled>
            {t("form.choose")}
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {recipe && (
        <p className="m-0 flex items-center justify-between gap-2 rounded-[10px] border border-gold-2/60 bg-surface-soft px-3 py-2 text-[13px]">
          <span className="text-muted">{t("recipe.lotAuto")}</span>
          <span className="num font-bold text-gold-text">{recipe.lotNoPreview}</span>
        </p>
      )}
      {mass && (
        <>
          <MassRecipeEditor value={mass} onChange={setMass} caption={t("recipe.caption", { ml: mass.ml || "—" })} />
          {product && validMl && (
            <p className="m-0 text-[12.5px]">
              {t("form.expectedUnits")}: <strong className={`num ${expectedUnits(mlClean, product.volumeMl) < 1 ? "text-bad" : ""}`}>{expectedUnits(mlClean, product.volumeMl)}</strong>
              <span className="text-muted"> · {t("recipe.bottle", { vol: product.volumeMl })}</span>
            </p>
          )}
        </>
      )}
      {!mass && (
      <label className={labelCls}>
        {t("form.plannedMl")}
        <input
          name="plannedMl"
          type="number"
          min={1}
          step="0.01"
          required
          placeholder="10000"
          value={ml}
          onChange={(e) => setMl(e.target.value)}
          className={`${inputCls} num`}
        />
      </label>
      )}

      {product && !mass && recipe && (
        <div className="flex flex-col gap-2 rounded-[12px] bg-surface-soft p-3 text-[12.5px]">
          <span className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
            {t("form.splitTitle", { pct: fmtQty(product.concentrationPct), vol: product.volumeMl })}
          </span>
          {preview ? (
            <dl className="m-0 grid grid-cols-3 gap-2">
              <div className="flex flex-col">
                <dt className="text-muted">{t("mix.essence")}</dt>
                <dd className="num m-0 font-semibold text-gold-text">{fmtQty(preview.essenceMl)} ml</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted">{t("mix.base")}</dt>
                <dd className="num m-0 font-semibold">{fmtQty(preview.baseMl)} ml</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted">{t("form.expectedUnits")}</dt>
                <dd className={`num m-0 font-semibold ${preview.units < 1 ? "text-bad" : ""}`}>{preview.units}</dd>
              </div>
            </dl>
          ) : (
            <p className="m-0 text-muted">{t("form.mlHint")}</p>
          )}
        </div>
      )}

      {/* Devam eden üretim */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-line px-3 py-2.5 text-[13px] hover:border-gold-2">
        <input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#b8864b]" />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold">{t("existing.toggle")}</span>
          <span className="text-[11.5px] text-muted">{t("existing.toggleHint")}</span>
        </span>
      </label>
      {existing && (
        <div className="flex flex-col gap-3 rounded-[12px] bg-surface-soft p-3">
          <label className={labelCls}>
            {t("existing.stage")}
            <select className={inputCls} value={startStage} onChange={(e) => setStartStage(e.target.value as (typeof START_STAGES)[number])}>
              {START_STAGES.map((st) => (
                <option key={st} value={st}>
                  {t(`stage.${st}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {startStage === "MACERATION" ? t("existing.macerationStartedAt") : t("existing.startedAt")}
            <input type="datetime-local" className={inputCls} value={startedAt} max={nowLocal()} onChange={(e) => setStartedAt(e.target.value)} required />
          </label>
          {pastMaceration && (
            <label className={labelCls}>
              {t("existing.macerationStart")}
              <input type="datetime-local" className={inputCls} value={macerationStart} max={nowLocal()} onChange={(e) => setMacerationStart(e.target.value)} />
            </label>
          )}
          <p className="m-0 text-[11.5px] text-muted">{t("existing.stockNote")}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.macerationDays")}
          <input name="macerationDays" type="number" min={0} max={120} required defaultValue={14} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.bottleType")}
          <select name="bottleType" required className={inputCls} defaultValue="AMBER">
            <option value="AMBER">{t("bottle.AMBER")}</option>
            <option value="METAL">{t("bottle.METAL")}</option>
          </select>
        </label>
      </div>
      <label className={labelCls}>
        {t("form.macerationPlace")}
        <input name="macerationPlace" maxLength={80} className={inputCls} />
      </label>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !preview || preview.units < 1 || !massValid} className={`${primaryBtn} self-start`}>
        {existing ? t("existing.create") : t("form.create")}
      </button>
    </form>
  );
}
