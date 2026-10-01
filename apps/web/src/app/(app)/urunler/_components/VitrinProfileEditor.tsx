"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, primaryBtn } from "@/components/ui";
import { apiPatch, errorText } from "@/lib/api-client";
import { emptyScentProfile, ScentProfileFields, type ScentProfileForm } from "./ScentProfileFields";

/** Vitrin koku profili düzenleme (müşteriye görünen akor/gündüz-gece/mevsim). PATCH scentProfile. */
export function VitrinProfileEditor({
  productId,
  initial,
  canEdit,
}: {
  productId: string;
  initial: ScentProfileForm | null;
  canEdit: boolean;
}) {
  const t = useTranslations("catalog.profile");
  const tc = useTranslations("catalog");
  const router = useRouter();
  const [value, setValue] = useState<ScentProfileForm>(initial ?? emptyScentProfile);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const accords = value.accords.map((a) => ({ label: a.label.trim(), strength: a.strength })).filter((a) => a.label.length > 0);
    setBusy(true);
    setMsg(null);
    try {
      await apiPatch(`/catalog/products/${productId}`, {
        scentProfile: { gender: value.gender, accords, dayPct: value.dayPct, seasons: value.seasons, source: "manual" },
      });
      setMsg({ ok: true, text: tc("form.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, tc("form.saved")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-line bg-surface p-5" aria-label={t("title")}>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-[18px] font-semibold">{t("title")}</h2>
        <p className="m-0 text-[12px] text-muted">{t("intro")}</p>
      </div>
      <ScentProfileFields value={value} onChange={setValue} disabled={!canEdit} />
      {canEdit && (
        <button type="button" disabled={busy} onClick={() => void save()} className={`${primaryBtn} self-start`}>
          {busy ? tc("form.saving") : t("save")}
        </button>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
