"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { alertErr, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPut, ClientApiError, errorText } from "@/lib/api-client";
import { fileToResizedDataUrl } from "./image";

/** Ürün kart görseli: yükle / değiştir / kaldır. Görsel tarayıcıda küçültülüp API'ye gönderilir. */
export function ProductImageManager({
  productId,
  initialUrl,
  canEdit,
}: {
  productId: string;
  initialUrl: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("catalog.image");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      const res = await apiPut<{ imageUrl: string }>(`/catalog/products/${productId}/image`, { dataUrl });
      setUrl(res.imageUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ClientApiError) ? err.message : errorText(err, t("failed")));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemove() {
    if (!confirm(t("removeConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/catalog/products/${productId}/image`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new ClientApiError(res.status, t("failed"), await res.json().catch(() => ({})));
      setUrl(null);
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <h3 className="m-0 font-display text-[16px] font-semibold">{t("title")}</h3>
      <div className="relative aspect-square w-full overflow-hidden rounded-[14px] border border-line-soft bg-surface-soft">
        {url ? (
          <Image src={url} alt="" fill sizes="320px" className="object-contain p-2" />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-muted">{t("none")}</div>
        )}
      </div>
      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={primaryBtn} onClick={() => inputRef.current?.click()}>
              {busy ? t("uploading") : url ? t("replace") : t("upload")}
            </button>
            {url && (
              <button type="button" disabled={busy} className={secondaryBtn} onClick={() => void onRemove()}>
                {t("remove")}
              </button>
            )}
          </div>
          <p className="m-0 text-[11.5px] text-muted">{t("hint")}</p>
        </>
      )}
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </div>
  );
}
