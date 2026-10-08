"use client";

import { isFullRecipe, type RecipeRole } from "@atelier/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { MassRecipeEditor, type RecipeRow, type RecipeState, recipeFromPercents } from "@/components/MassRecipeEditor";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtQty } from "@/lib/format";

interface ItemRef {
  id: string;
  code: string;
  name: string;
  uom: string;
}

export interface SetupData {
  product: { id: string; sku: string; name: string; volumeMl: number };
  formula: {
    id: string;
    code: string;
    version: number;
    status: string;
    concentrationPct: string;
    densityGPerMl: string | null;
    lines: { percentage: string; item: ItemRef }[];
    components: { role: RecipeRole; pct: string; item: ItemRef }[];
  } | null;
  bom: { batchSize: number; lines: { qty: string; uom: string; item: { id: string; code: string; name: string; type: string } }[] } | null;
  options: {
    materials: (ItemRef & { convertsToKg: boolean })[];
    packaging: { id: string; code: string; name: string }[];
  };
  template: { densityGPerMl: string; lines: { role: RecipeRole; pct: string }[] };
  canApprove: boolean;
  canCreateItems: boolean;
}

const NEW = "__new__";
const ROLES: RecipeRole[] = ["ESSENCE", "ALCOHOL", "WATER", "GLYCERIN", "OTHER"];
const skuTail = (sku: string) => {
  const s = sku.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return s.length >= 2 ? s : `${s}00`;
};

interface Choice {
  sel: string;
  code: string;
  name: string;
}

/** Rol için önerilen yeni kart (kod/ad) ve mevcut kalemlerden eşleşen. */
function defaultChoice(role: RecipeRole, product: SetupData["product"], materials: SetupData["options"]["materials"], canCreate: boolean): Choice {
  const essenceCode = `ES-${skuTail(product.sku)}`;
  const suggest: Record<RecipeRole, { code: string; name: string; match: (i: ItemRef) => boolean }> = {
    ESSENCE: { code: essenceCode, name: `Esans · ${product.name}`.slice(0, 120), match: (i) => i.code === essenceCode },
    ALCOHOL: { code: "HM-ALKOL966", name: "Etil Alkol (%96,6)", match: (i) => /alkol|alcohol|etanol/i.test(i.name) },
    WATER: { code: "HM-SAFSU", name: "Saf Su", match: (i) => /saf su|distile|\bsu\b|water/i.test(i.name) },
    GLYCERIN: { code: "HM-GLISERIN", name: "Gliserin", match: (i) => /gliserin|glycerin/i.test(i.name) },
    OTHER: { code: "", name: "", match: () => false },
  };
  const s = suggest[role];
  const found = materials.find(s.match);
  return { sel: found?.id ?? (canCreate && s.code ? NEW : ""), code: s.code, name: s.name };
}

/**
 * Üretim kurulumu — kütlesel reçete. Bileşenler (esans, etil alkol, saf su, gliserin…) son üründeki
 * kütle yüzdesiyle ve karışım yoğunluğuyla tanımlanır. Yüzde değişince gram, gram değişince yüzde güncellenir.
 * Varsayılan oranlar "Otomatik kurallar" ekranındaki reçete şablonundan gelir. Formül + reçete tek adımda
 * kurulur ve ürüne bağlanır.
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
  const tr = useTranslations("production.recipe");
  const router = useRouter();
  const { product, formula, bom, options } = data;

  const initial = (): { recipe: RecipeState; choices: Choice[] } => {
    const fromFormula = formula && formula.components.length > 0 && formula.densityGPerMl;
    const lines = fromFormula ? formula!.components.map((c) => ({ role: c.role, pct: String(Number(c.pct)) })) : data.template.lines;
    const choices = fromFormula
      ? formula!.components.map((c) => ({ sel: c.item.id, code: c.item.code, name: c.item.name }))
      : lines.map((l) => defaultChoice(l.role, product, options.materials, data.canCreateItems));
    const rows: RecipeRow[] = lines.map((l, i) => ({ key: `r${i}`, role: l.role, label: "", pct: l.pct, grams: "" }));
    const density = fromFormula ? String(Number(formula!.densityGPerMl)) : data.template.densityGPerMl;
    return { recipe: recipeFromPercents(String(product.volumeMl), density, rows), choices };
  };
  const [state, setState] = useState(initial);
  const [pack, setPack] = useState<Set<string>>(new Set(bom?.lines.filter((l) => l.item.type === "PACKAGING").map((l) => l.item.id) ?? []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nextKey, setNextKey] = useState(100);

  const { recipe, choices } = state;
  const setRecipe = (r: RecipeState) => setState((s) => ({ ...s, recipe: r }));
  const setChoice = (i: number, patch: Partial<Choice>) =>
    setState((s) => ({ ...s, choices: s.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setRole = (i: number, role: RecipeRole) =>
    setState((s) => ({ ...s, recipe: { ...s.recipe, rows: s.recipe.rows.map((r, j) => (j === i ? { ...r, role } : r)) } }));
  const addRow = () => {
    setState((s) => ({
      recipe: { ...s.recipe, rows: [...s.recipe.rows, { key: `r${nextKey}`, role: "OTHER", label: "", pct: "0", grams: "0.00" }] },
      choices: [...s.choices, { sel: data.canCreateItems ? NEW : "", code: "", name: "" }],
    }));
    setNextKey((k) => k + 1);
  };
  const removeRow = (i: number) =>
    setState((s) => ({
      recipe: recipeFromPercents(s.recipe.ml, s.recipe.density, s.recipe.rows.filter((_, j) => j !== i)),
      choices: s.choices.filter((_, j) => j !== i),
    }));

  const pctOk = (v: string) => /^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) > 0;
  const valid =
    isFullRecipe(recipe.rows.map((r) => r.pct)) &&
    recipe.rows.every((r) => pctOk(r.pct)) &&
    recipe.rows.some((r) => r.role === "ESSENCE") &&
    /^\d(\.\d{1,4})?$/.test(recipe.density) &&
    choices.every((c) => c.sel && (c.sel !== NEW || (c.code.trim() && c.name.trim().length >= 2)));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost<{ formula: { code: string; version: number; status: string }; linked: boolean }>(`/production/setup/${product.id}`, {
        densityGPerMl: recipe.density,
        components: recipe.rows.map((r, i) => {
          const c = choices[i]!;
          return {
            role: r.role,
            pct: r.pct,
            item: c.sel === NEW ? { newItem: { code: c.code.trim().toUpperCase(), name: c.name.trim() } } : { itemId: c.sel },
          };
        }),
        packagingItemIds: [...pack],
      });
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

  const itemCell = (row: RecipeRow, i: number) => {
    const c = choices[i]!;
    const chosen = options.materials.find((m) => m.id === c.sel);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-1.5">
          <select aria-label={tr("roleLabel")} className={`${inputCls} min-h-9 text-[12.5px]`} value={row.role} onChange={(e) => setRole(i, e.target.value as RecipeRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tr(`role.${r}`)}
              </option>
            ))}
          </select>
          <select aria-label={tr("item")} className={`${inputCls} min-h-9 text-[12.5px]`} value={c.sel} onChange={(e) => setChoice(i, { sel: e.target.value })} required>
            <option value="" disabled>
              {t("choose")}
            </option>
            {data.canCreateItems && <option value={NEW}>+ {t("newItem")}</option>}
            {options.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name} ({m.uom})
              </option>
            ))}
          </select>
        </div>
        {c.sel === NEW && (
          <div className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-1.5">
            <input aria-label={t("itemCode")} placeholder="HM-0000" className={`${inputCls} num min-h-9 text-[12.5px]`} value={c.code} onChange={(e) => setChoice(i, { code: e.target.value.toUpperCase() })} />
            <input aria-label={t("itemName")} placeholder={t("itemName")} className={`${inputCls} min-h-9 text-[12.5px]`} value={c.name} onChange={(e) => setChoice(i, { name: e.target.value })} />
          </div>
        )}
        {chosen?.convertsToKg && <span className="text-[11px] text-warn">{tr("convertsToKg", { uom: chosen.uom })}</span>}
      </div>
    );
  };

  return (
    <section id="uretim-kurulumu" className="flex scroll-mt-20 flex-col gap-4 rounded-[18px] border border-line bg-surface p-5" aria-label={t("title")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-display text-[18px] font-semibold">{t("title")}</h2>
          <p className="m-0 text-[12px] text-muted">{t("intro")}</p>
        </div>
        {formula ? (
          <span className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${formula.status === "APPROVED" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>
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
          <p className="m-0 text-[12px] text-muted">
            {tr("setupHint")}{" "}
            <Link href="/uretim/recete" className="font-semibold text-gold-text">
              {tr("templateLink")} →
            </Link>
          </p>

          <MassRecipeEditor
            value={recipe}
            onChange={setRecipe}
            itemCell={itemCell}
            onRemove={recipe.rows.length > 2 ? removeRow : undefined}
            caption={tr("caption", { ml: recipe.ml || "—" })}
          />
          <button type="button" onClick={addRow} className={`${secondaryBtn} self-start`} disabled={recipe.rows.length >= 8}>
            + {tr("addRow")}
          </button>

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

          {!data.canApprove && <p className="m-0 text-[12px] text-warn">{t("needsApproval")}</p>}
          <button type="submit" disabled={busy || !valid} className={`${primaryBtn} self-start`}>
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
