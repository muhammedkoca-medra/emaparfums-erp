"use client";

import { BATCH_STAGES, essencePct } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPatch, errorText } from "@/lib/api-client";

interface Batch {
  id: string;
  stage: string;
  plannedQty: number;
  essenceGr: string | null;
  baseGr: string | null;
  plannedMl: string | null;
  essenceMl: string | null;
  baseMl: string | null;
  macerationDays: number | null;
  macerationPlace: string | null;
  bottleType: string | null;
  maceration: { start: string } | null;
}

/** Parti değerlerini elle düzenleme + aşamayı manuel ayarlama (süreç düzeltme). */
export function BatchEditor({ batch }: { batch: Batch }) {
  const t = useTranslations("production");
  const router = useRouter();
  // Yeni partiler hacimle (ml); eski partiler gramajla düzenlenir.
  const byVolume = batch.plannedMl != null;
  const initEssence = byVolume ? batch.essenceMl : batch.essenceGr;
  const initBase = byVolume ? batch.baseMl : batch.baseGr;
  const [essence, setEssence] = useState(initEssence ? String(Number(initEssence)) : "");
  const [base, setBase] = useState(initBase ? String(Number(initBase)) : "");
  const [plannedMl, setPlannedMl] = useState(batch.plannedMl ? String(Number(batch.plannedMl)) : "");
  const [stage, setStage] = useState(batch.stage);
  const [stageAt, setStageAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const e = Number(essence.replace(",", ".")) || 0;
  const b = Number(base.replace(",", ".")) || 0;
  const pct = e + b > 0 ? essencePct(e, b).toFixed(1) : "0";

  async function saveValues(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const d = new FormData(ev.currentTarget);
    const startRaw = String(d.get("macerationStart") ?? "").trim();
    setBusy(true);
    setMsg(null);
    try {
      const volumeChanged = byVolume && plannedMl !== String(Number(batch.plannedMl));
      const mixChanged = essence !== (initEssence ? String(Number(initEssence)) : "") || base !== (initBase ? String(Number(initBase)) : "");
      await apiPatch(`/production/batches/${batch.id}`, {
        ...(byVolume
          ? {
              // Hacim değişirse sunucu adet ve esans/baz bölünmesini yeniden hesaplar; yoksa ölçülen değerler gönderilir.
              ...(volumeChanged ? { plannedMl } : {}),
              ...(!volumeChanged && mixChanged ? { essenceMl: essence, baseMl: base } : {}),
            }
          : {
              plannedQty: Number(d.get("plannedQty")),
              essenceGr: essence.replace(",", "."),
              baseGr: base.replace(",", "."),
            }),
        macerationDays: Number(d.get("macerationDays")),
        macerationPlace: String(d.get("macerationPlace") ?? "").trim() || null,
        bottleType: d.get("bottleType"),
        ...(startRaw ? { macerationStart: new Date(startRaw).toISOString() } : {}),
      });
      setMsg({ ok: true, text: t("edit.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("edit.saved")) });
    } finally {
      setBusy(false);
    }
  }

  async function saveStage() {
    if (stage === batch.stage) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPatch(`/production/batches/${batch.id}/stage`, { stage, ...(stageAt ? { startedAt: new Date(stageAt).toISOString() } : {}) });
      setMsg({ ok: true, text: t("edit.stageSaved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("edit.stageSaved")) });
    } finally {
      setBusy(false);
    }
  }

  // datetime-local için mevcut başlangıç
  const startLocal = batch.maceration?.start ? new Date(batch.maceration.start).toISOString().slice(0, 16) : "";

  return (
    <details id="duzenle" className="scroll-mt-20 rounded-[18px] border border-line bg-surface">
      <summary className="cursor-pointer px-5 py-4 font-display text-[17px] font-semibold">✎ {t("edit.title")}</summary>
      <div className="grid gap-5 border-t border-line-soft p-5 lg:grid-cols-2">
        {/* Değerler */}
        <form onSubmit={saveValues} aria-label={t("edit.values")} className="flex flex-col gap-3">
          <h3 className="m-0 text-[14px] font-bold text-muted uppercase">{t("edit.values")}</h3>
          {byVolume ? (
            <>
              <label className={labelCls}>
                {t("form.plannedMl")}
                <input name="plannedMl" type="number" min={1} step="0.01" value={plannedMl} onChange={(ev) => setPlannedMl(ev.target.value)} className={`${inputCls} num`} />
                <span className="text-[11px] font-normal text-muted">{t("edit.volumeHint")}</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  {t("form.essenceMl")}
                  <input name="essenceMl" type="number" min={0} step="0.01" value={essence} onChange={(ev) => setEssence(ev.target.value)} className={`${inputCls} num`} />
                </label>
                <label className={labelCls}>
                  {t("form.baseMl")}
                  <input name="baseMl" type="number" min={0} step="0.01" value={base} onChange={(ev) => setBase(ev.target.value)} className={`${inputCls} num`} />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className={labelCls}>
                {t("form.qty")}
                <input name="plannedQty" type="number" min={1} defaultValue={batch.plannedQty} className={inputCls} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  {t("form.essenceGr")}
                  <input name="essenceGr" inputMode="decimal" value={essence} onChange={(ev) => setEssence(ev.target.value)} className={inputCls} />
                </label>
                <label className={labelCls}>
                  {t("form.baseGr")}
                  <input name="baseGr" inputMode="decimal" value={base} onChange={(ev) => setBase(ev.target.value)} className={inputCls} />
                </label>
              </div>
            </>
          )}
          <p className="m-0 text-[12px] font-semibold text-gold-text">{t("form.concentrationHint", { pct })}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              {t("form.macerationDays")}
              <input name="macerationDays" type="number" min={0} max={120} defaultValue={batch.macerationDays ?? 14} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.bottleType")}
              <select name="bottleType" defaultValue={batch.bottleType ?? "AMBER"} className={inputCls}>
                <option value="AMBER">{t("bottle.AMBER")}</option>
                <option value="METAL">{t("bottle.METAL")}</option>
              </select>
            </label>
          </div>
          <label className={labelCls}>
            {t("form.macerationPlace")}
            <input name="macerationPlace" defaultValue={batch.macerationPlace ?? ""} maxLength={80} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("edit.macerationStart")}
            <input name="macerationStart" type="datetime-local" defaultValue={startLocal} className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {t("edit.save")}
          </button>
        </form>

        {/* Süreç (manuel aşama) */}
        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-[14px] font-bold text-muted uppercase">{t("edit.process")}</h3>
          <p className="m-0 text-[12px] text-muted">{t("edit.processHint")}</p>
          <label className={labelCls}>
            {t("edit.stage")}
            <select value={stage} onChange={(ev) => setStage(ev.target.value)} className={inputCls}>
              {BATCH_STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(`stage.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("edit.stageStartedAt")}
            <input type="datetime-local" value={stageAt} onChange={(ev) => setStageAt(ev.target.value)} className={inputCls} />
            <span className="text-[11px] font-normal text-muted">{t("edit.stageStartedAtHint")}</span>
          </label>
          <button type="button" disabled={busy || stage === batch.stage} onClick={saveStage} className={`${secondaryBtn} self-start`}>
            {t("edit.setStage")}
          </button>
        </div>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mx-5 mb-4 ${msg.ok ? alertOk : alertErr}`}>
          {msg.text}
        </p>
      )}
    </details>
  );
}
