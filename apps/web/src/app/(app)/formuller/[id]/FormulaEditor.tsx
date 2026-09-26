"use client";

import { validateFormulaLines } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, apiPut, errorText } from "@/lib/api-client";
import { fmtQty } from "@/lib/format";

interface Line {
  itemId: string;
  percentage: string;
}
interface Allergen {
  name: string;
  pctInFinal: string;
  mustLabel: boolean;
}

/** Formül satırları ve alerjenler; taslakta düzenlenir, onay akışı düğmeleri. */
export function FormulaEditor({
  formula,
  materials,
  canEdit,
  canCreate,
  canApprove,
}: {
  formula: {
    id: string;
    status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
    lines: { itemId: string; percentage: string; item: { code: string; name: string } }[];
    allergens: Allergen[];
  };
  materials: { id: string; label: string }[];
  canEdit: boolean;
  canCreate: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("formulas");
  const router = useRouter();
  const editable = formula.status === "DRAFT" && canEdit;
  const [lines, setLines] = useState<Line[]>(
    formula.lines.map((l) => ({ itemId: l.itemId, percentage: String(Number(l.percentage)) })),
  );
  const [allergens, setAllergens] = useState<Allergen[]>(
    formula.allergens.map((a) => ({ ...a, pctInFinal: String(Number(a.pctInFinal)) })),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const clean = lines.filter((l) => l.itemId && l.percentage.trim() !== "");
  const issues = validateFormulaLines(clean.map((l) => ({ ...l, percentage: l.percentage.replace(",", ".") })));
  // Görüntü amaçlı toplam (doğrulama Decimal ile validateFormulaLines'ta)
  const total = clean.reduce((a, l) => a + Number(l.percentage.replace(",", ".")), 0);
  const itemLabel = (id: string) =>
    materials.find((m) => m.id === id)?.label ?? formula.lines.find((l) => l.itemId === id)?.item.code ?? id;

  async function run(fn: () => Promise<unknown>, ok: string, after?: (r: unknown) => void) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: ok });
      after?.(r);
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("form.saved")) });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    apiPut(`/formulas/${formula.id}`, {
      lines: clean.map((l) => ({ itemId: l.itemId, percentage: l.percentage.replace(",", ".") })),
      allergens: allergens
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          // Son üründeki oran yüzde olarak: 0.12 = %0,12
          pctInFinal: a.pctInFinal.replace(",", "."),
          mustLabel: a.mustLabel,
        })),
    });

  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2 align-middle";

  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-line bg-surface p-5">
      {formula.status === "APPROVED" && <p className="m-0 text-xs text-muted">{t("readOnlyApproved")}</p>}
      {formula.status === "IN_REVIEW" && <p className="m-0 rounded-[9px] bg-warn-bg px-3 py-2 text-[13px] text-warn">{t("inReview")}</p>}

      <div className="flex flex-col gap-2 overflow-x-auto">
        <h2 className="m-0 font-display text-[19px] font-semibold">{t("lines")}</h2>
        <table className="w-full min-w-[480px] border-collapse text-[13px]" aria-label={t("lines")}>
          <thead>
            <tr>
              <th className={th}>{t("line.item")}</th>
              <th className={`${th} w-32 text-right`}>{t("line.pct")}</th>
              {editable && <th className={`${th} w-20`} />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className={td}>
                  {editable ? (
                    <select
                      aria-label={`${t("line.item")} ${i + 1}`}
                      className={inputCls}
                      value={l.itemId}
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
                    >
                      <option value="">{t("form.choose")}</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    itemLabel(l.itemId)
                  )}
                </td>
                <td className={`${td} text-right`}>
                  {editable ? (
                    <input
                      aria-label={`${t("line.pct")} ${i + 1}`}
                      inputMode="decimal"
                      value={l.percentage}
                      onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, percentage: e.target.value } : x)))}
                      className={`${inputCls} num text-right`}
                    />
                  ) : (
                    <span className="num font-semibold">%{fmtQty(l.percentage)}</span>
                  )}
                </td>
                {editable && (
                  <td className={td}>
                    <button type="button" className={secondaryBtn} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                      {t("form.remove")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          {editable && (
            <button type="button" className={secondaryBtn} onClick={() => setLines([...lines, { itemId: "", percentage: "" }])}>
              {t("addLine")}
            </button>
          )}
          <span className={`num font-bold ${issues.length ? "text-bad" : "text-ok"}`}>{t("total", { total: fmtQty(String(total)) })}</span>
        </div>
        {editable && issues.length > 0 && <p className="m-0 text-xs text-bad">{issues.join(" · ")}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-[15px] font-bold">{t("allergens")}</h3>
        {allergens.map((a, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_110px_auto_auto] items-center gap-2 text-[13px]">
            <input
              aria-label={`${t("allergen.name")} ${i + 1}`}
              disabled={!editable}
              value={a.name}
              onChange={(e) => setAllergens(allergens.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              className={inputCls}
            />
            <input
              aria-label={`${t("allergen.pct")} ${i + 1}`}
              disabled={!editable}
              inputMode="decimal"
              value={a.pctInFinal}
              onChange={(e) => setAllergens(allergens.map((x, j) => (j === i ? { ...x, pctInFinal: e.target.value } : x)))}
              className={`${inputCls} num text-right`}
            />
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                disabled={!editable}
                checked={a.mustLabel}
                onChange={(e) => setAllergens(allergens.map((x, j) => (j === i ? { ...x, mustLabel: e.target.checked } : x)))}
              />
              {t("allergen.label")}
            </label>
            {editable ? (
              <button type="button" className={secondaryBtn} onClick={() => setAllergens(allergens.filter((_, j) => j !== i))}>
                {t("form.remove")}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        {editable && (
          <button type="button" className={`${secondaryBtn} self-start`} onClick={() => setAllergens([...allergens, { name: "", pctInFinal: "", mustLabel: true }])}>
            {t("addAllergen")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {editable && (
          <>
            <button type="button" disabled={busy} className={secondaryBtn} onClick={() => run(save, t("form.saved"))}>
              {t("form.save")}
            </button>
            <button
              type="button"
              disabled={busy || issues.length > 0}
              className={primaryBtn}
              onClick={() =>
                run(async () => {
                  await save();
                  return apiPost(`/formulas/${formula.id}/submit`);
                }, t("form.saved"))
              }
            >
              {t("form.submit")}
            </button>
          </>
        )}
        {formula.status === "IN_REVIEW" && canApprove && (
          <>
            <button type="button" disabled={busy} className={primaryBtn} onClick={() => run(() => apiPost(`/formulas/${formula.id}/decide`, { decision: "APPROVE" }), t("form.saved"))}>
              {t("form.approve")}
            </button>
            <button type="button" disabled={busy} className={secondaryBtn} onClick={() => run(() => apiPost(`/formulas/${formula.id}/decide`, { decision: "REJECT" }), t("form.saved"))}>
              {t("form.reject")}
            </button>
          </>
        )}
        {(formula.status === "APPROVED" || formula.status === "ARCHIVED") && canCreate && (
          <button
            type="button"
            disabled={busy}
            className={secondaryBtn}
            onClick={() =>
              run(
                () => apiPost<{ id: string }>(`/formulas/${formula.id}/versions`),
                t("form.saved"),
                (r) => router.push(`/formuller/${(r as { id: string }).id}`),
              )
            }
          >
            {t("form.newVersion")}
          </button>
        )}
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
