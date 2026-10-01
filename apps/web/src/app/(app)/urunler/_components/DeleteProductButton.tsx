"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr } from "@/components/ui";
import { ClientApiError, errorText } from "@/lib/api-client";

/** Ürün kartını siler. Satış/üretim kaydı olan ürünü API güvenlik için reddeder (durum değiştirmeyi önerir). */
export function DeleteProductButton({
  productId,
  productName,
  compact = false,
}: {
  productId: string;
  productName: string;
  /** Liste kartında küçük düğme; silince liste yenilenir. */
  compact?: boolean;
}) {
  const t = useTranslations("catalog.delete");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirm(t("confirm", { name: productName }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/catalog/products/${productId}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new ClientApiError(res.status, body.message ?? "", body);
      if (!compact) router.push("/urunler");
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("failed")));
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <span className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDelete()}
          className="rounded-[8px] border border-bad/30 px-2.5 py-1 text-[11.5px] font-semibold text-bad transition-colors hover:bg-bad hover:text-white disabled:opacity-50"
        >
          {busy ? t("deleting") : t("deleteShort")}
        </button>
        {error && <span role="alert" className="max-w-[220px] text-right text-[11px] text-bad">{error}</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onDelete()}
        className="inline-flex min-h-9 items-center justify-center rounded-[9px] border border-bad/40 bg-bad-bg px-4 text-[13px] font-semibold text-bad transition-colors hover:bg-bad hover:text-white disabled:opacity-50"
      >
        {busy ? t("deleting") : t("delete")}
      </button>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </div>
  );
}
