"use client";

import { isFullRecipe, type RecipeRole } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MassRecipeEditor, type RecipeRow, type RecipeState, recipeFromPercents } from "@/components/MassRecipeEditor";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPut, errorText } from "@/lib/api-client";

export interface Template {
  densityGPerMl: string;
  lines: { role: RecipeRole; pct: string }[];
}

const ROLES: RecipeRole[] = ["ESSENCE", "ALCOHOL", "WATER", "GLYCERIN", "OTHER"];
/** Deneme hacmi: üretimdeki kütlesel reçete tablosuyla aynı (470 mL). */
const TRIAL_ML = "470";

const toState = (tpl: Template, ml = TRIAL_ML): RecipeState =>
  recipeFromPercents(
    ml,
    String(Number(tpl.densityGPerMl)),
    tpl.lines.map((l, i) => ({ key: `t${i}`, role: l.role, label: "", pct: String(Number(l.pct)), grams: "" })),
  );

/**
 * Standart (varsayılan) kütlesel reçete. Yeni ürün kurulumuna bu oranlar gelir; ürün bazında ayrıca
 * değiştirilebilir. Yüzde ↔ gram çift yönlü; gramlar deneme hacmi için gösterilir, kaydedilen yüzde + yoğunluktur.
 */
export function TemplateEditor({ template, defaults, canEdit }: { template: Template; defaults: Template; canEdit: boolean }) {
  const t = useTranslations("production.recipe");
  const tt = useTranslations("production.template");
  const router = useRouter();
  const [state, setState] = useState<RecipeState>(() => toState(template));
  const [nextKey, setNextKey] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setRole = (i: number, role: RecipeRole) => setState((s) => ({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, role } : r)) }));
  const addRow = () => {
    setState((s) => ({ ...s, rows: [...s.rows, { key: `t${nextKey}`, role: "OTHER", label: "", pct: "0", grams: "0.00" }] }));
    setNextKey((k) => k + 1);
  };
  const removeRow = (i: number) => setState((s) => recipeFromPercents(s.ml, s.density, s.rows.filter((_, j) => j !== i)));

  const pctOk = (v: string) => /^\d{1,3}(\.\d{1,4})?$/.test(v) && Number(v) > 0;
  const valid =
    isFullRecipe(state.rows.map((r) => r.pct)) &&
    state.rows.every((r) => pctOk(r.pct)) &&
    state.rows.some((r) => r.role === "ESSENCE") &&
    /^\d(\.\d{1,4})?$/.test(state.density) &&
    Number(state.density) >= 0.5 &&
    Number(state.density) <= 1.5;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPut("/production/recipe-template", {
        densityGPerMl: state.density,
        lines: state.rows.map((r) => ({ role: r.role, pct: r.pct })),
      });
      setMsg({ ok: true, text: tt("saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, tt("save")) });
    } finally {
      setBusy(false);
    }
  }

  const roleCell = (row: RecipeRow, i: number) =>
    canEdit ? (
      <select aria-label={t("roleLabel")} className={`${inputCls} min-h-9 text-[12.5px]`} value={row.role} onChange={(e) => setRole(i, e.target.value as RecipeRole)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`role.${r}`)}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-[18px] font-semibold">{tt("editorTitle")}</h2>
        <p className="m-0 text-[12.5px] text-muted">{tt("editorHint")}</p>
      </div>

      <fieldset disabled={!canEdit} className="m-0 flex flex-col gap-3 border-0 p-0">
        <MassRecipeEditor
          value={state}
          onChange={setState}
          itemCell={roleCell}
          onRemove={canEdit && state.rows.length > 2 ? removeRow : undefined}
          caption={t("caption", { ml: state.ml || "—" })}
        />
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={addRow} className={secondaryBtn} disabled={state.rows.length >= 8}>
            + {t("addRow")}
          </button>
          <button type="button" onClick={() => setState(toState(defaults, state.ml))} className={secondaryBtn}>
            {tt("reset")}
          </button>
          <button type="button" onClick={() => void save()} disabled={busy || !valid} className={`${primaryBtn} ml-auto`}>
            {busy ? tt("saving") : tt("save")}
          </button>
        </div>
      ) : (
        <p className="m-0 rounded-[9px] bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{tt("readOnly")}</p>
      )}
      <p className="m-0 text-[11.5px] text-muted">{tt("scope")}</p>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
