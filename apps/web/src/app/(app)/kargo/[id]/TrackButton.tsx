"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export function TrackButton({ id, hasTracking, canEdit }: { id: string; hasTracking: boolean; canEdit: boolean }) {
  const t = useTranslations("shipping");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!hasTracking) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/shipping/shipments/${id}/label`} target="_blank" rel="noreferrer" className={`${secondaryBtn} no-underline`}>
          {t("label")}
        </a>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            className={primaryBtn}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await apiPost(`/shipping/shipments/${id}/track`);
                router.refresh();
              } catch (err) {
                setError(errorText(err, t("tracked")));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("track")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </div>
  );
}
