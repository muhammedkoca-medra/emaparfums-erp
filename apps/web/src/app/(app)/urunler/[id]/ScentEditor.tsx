"use client";

import { ACCORDS, noteFromTurkish, SCENT_NOTES } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPut, errorText } from "@/lib/api-client";

type Tier = "TOP" | "HEART" | "BASE";
const TIERS: Tier[] = ["TOP", "HEART", "BASE"];
const ACCORD_KEYS = ACCORDS;

/**
 * Nota piramidi ve akor skorları. Nota adları Türkçe nota sözlüğünden seçilir (çeviri tutarlılığı);
 * referans kaynaklardan yalnızca olgusal bilgi alınır (docs/03-moduller/koku-ai.md §Veri kaynakları).
 */
export function ScentEditor({
  productId,
  notes: initialNotes,
  accords: initialAccords,
  canEdit,
}: {
  productId: string;
  notes: { name: string; family: string; tier: Tier }[];
  accords: { accord: string; score: number }[];
  canEdit: boolean;
}) {
  const t = useTranslations("catalog.scent");
  const tc = useTranslations("catalog");
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [accords, setAccords] = useState<Record<string, number>>(
    Object.fromEntries(ACCORD_KEYS.map((k) => [k, initialAccords.find((a) => a.accord === k)?.score ?? 0])),
  );
  const [pick, setPick] = useState({ name: SCENT_NOTES[0]!.tr, tier: "TOP" as Tier });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function addNote() {
    const entry = noteFromTurkish(pick.name);
    if (!entry || notes.some((n) => n.name === entry.tr)) return;
    setNotes([...notes, { name: entry.tr, family: entry.family, tier: pick.tier }]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiPut(`/catalog/products/${productId}/scent`, { notes, accords });
      setMsg({ ok: true, text: tc("form.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, tc("form.saved")) });
    } finally {
      setBusy(false);
    }
  }

  const families = [...new Set(SCENT_NOTES.map((n) => n.family))];

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5" aria-label={t("title")}>
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("title")}</h2>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{t("pyramid")}</span>
        {notes.length === 0 && <p className="m-0 text-[13px] text-muted">{t("empty")}</p>}
        {TIERS.map((tier) => {
          const list = notes.filter((n) => n.tier === tier);
          if (list.length === 0) return null;
          return (
            <div key={tier} className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-2">
              <span className="pt-1 text-[11.5px] font-bold text-muted">{t(`tiers.${tier}`)}</span>
              <div className="flex flex-wrap gap-1.5">
                {list.map((n) => (
                  <span key={n.name} className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-xs font-semibold">
                    {n.name}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`${t("remove")} · ${n.name}`}
                        onClick={() => setNotes(notes.filter((x) => x.name !== n.name))}
                        className="ml-0.5 text-muted hover:text-bad"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[12.5px] font-semibold">
            {t("note")}
            <select className={inputCls} value={pick.name} onChange={(e) => setPick({ ...pick, name: e.target.value })}>
              {families.map((f) => (
                <optgroup key={f} label={t(`family.${f}`)}>
                  {SCENT_NOTES.filter((n) => n.family === f).map((n) => (
                    <option key={n.tr} value={n.tr}>
                      {n.tr} ({n.en})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
            {t("tier")}
            <select className={inputCls} value={pick.tier} onChange={(e) => setPick({ ...pick, tier: e.target.value as Tier })}>
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {t(`tiers.${tier}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={secondaryBtn} onClick={addNote}>
            {t("addNote")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{t("accords")}</span>
        {ACCORD_KEYS.map((k) => (
          <label key={k} className="grid grid-cols-[84px_minmax(0,1fr)_44px] items-center gap-2 text-[12.5px]">
            <span>{t(`accord.${k}`)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={accords[k] ?? 0}
              disabled={!canEdit}
              onChange={(e) => setAccords({ ...accords, [k]: Number(e.target.value) })}
              className="accent-[#b8864b]"
            />
            <span className="num text-right font-semibold">{accords[k] ?? 0}</span>
          </label>
        ))}
      </div>

      {canEdit ? (
        <>
          <p className="m-0 text-xs text-muted">{t("dictionaryHint")}</p>
          <p className="m-0 text-xs text-muted">{t("sourceHint")}</p>
          <button type="button" disabled={busy} onClick={save} className={`${primaryBtn} self-start`}>
            {t("save")}
          </button>
        </>
      ) : (
        <p className="m-0 text-xs text-muted">{t("readOnly")}</p>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
