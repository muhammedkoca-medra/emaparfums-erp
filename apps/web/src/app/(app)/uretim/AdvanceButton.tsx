"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** Sonraki aşamaya geçir. Demlenme kilidinde gerekçe ister (URT-04). */
export function AdvanceButton({ batchId, stage, macerationDone }: { batchId: string; stage: string; macerationDone: boolean }) {
  const t = useTranslations("production");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function advance() {
    let overrideReason: string | undefined;
    if (stage === "MACERATION" && !macerationDone) {
      const r = window.prompt(t("overridePrompt"));
      if (!r) return;
      overrideReason = r;
    }
    setBusy(true);
    setMsg(null);
    try {
      await apiPost(`/production/batches/${batchId}/advance`, overrideReason ? { overrideReason } : {});
      setMsg({ ok: true, text: t("advanceDone") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("advanceDone")) });
    } finally {
      setBusy(false);
    }
  }

  if (stage === "RELEASED" || stage === "CANCELLED") {
    return <p className="m-0 rounded-[9px] bg-ok-bg px-3 py-2 text-[13px] font-semibold text-ok">{t("released")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" disabled={busy} onClick={advance} className={primaryBtn}>
        {t("advance")} →
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
