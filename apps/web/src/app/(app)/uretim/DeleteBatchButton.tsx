"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr } from "@/components/ui";
import { ClientApiError, errorText } from "@/lib/api-client";

/** Partiyi siler. Stoğa dokunmuş (tüketim/çıktı) partiyi API reddeder; o durumda aşama "İptal" yapılır. */
export function DeleteBatchButton({ batchId, batchNumber }: { batchId: string; batchNumber: string }) {
  const t = useTranslations("production.delete");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirm(t("confirm", { number: batchNumber }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/production/batches/${batchId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new ClientApiError(res.status, body.message ?? "", body);
      router.push("/uretim");
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("failed")));
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-[14px] border border-bad/30 bg-bad-bg/40 p-4">
      <h3 className="m-0 text-[13px] font-bold text-bad">{t("zone")}</h3>
      <p className="m-0 text-[12px] text-text-2">{t("hint")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onDelete()}
        className="inline-flex min-h-9 items-center justify-center self-start rounded-[9px] border border-bad/40 bg-bad-bg px-4 text-[13px] font-semibold text-bad transition-colors hover:bg-bad hover:text-white disabled:opacity-50"
      >
        {busy ? t("deleting") : t("delete")}
      </button>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </section>
  );
}
