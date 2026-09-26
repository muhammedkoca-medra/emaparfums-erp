"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** KVKK/pazarlama rızası ver/geri çek (yalnızca sales:EDIT). */
export function ConsentControls({
  customerId,
  kvkk,
  marketing,
  canEdit,
}: {
  customerId: string;
  kvkk: boolean;
  marketing: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("customers");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(purpose: "KVKK" | "MARKETING", granted: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/customers/${customerId}/consent`, { purpose, granted, channel: "WEB" });
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("form.saved")));
    } finally {
      setBusy(false);
    }
  }

  const row = (purpose: "KVKK" | "MARKETING", on: boolean, label: string) => (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2 first:border-t-0 text-[13px]">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-ok-bg text-ok" : "bg-neu-bg text-neu"}`}>
          {on ? t("consent.granted") : t("consent.none")}
        </span>
        {canEdit &&
          (on ? (
            <button type="button" disabled={busy} className={`${secondaryBtn} min-h-8 px-3 text-xs`} onClick={() => set(purpose, false)}>
              {t("consent.revoke")}
            </button>
          ) : (
            <button type="button" disabled={busy} className={`${primaryBtn} min-h-8 px-3 text-xs`} onClick={() => set(purpose, true)}>
              {t("consent.grant")}
            </button>
          ))}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col">
      {row("KVKK", kvkk, t("consent.kvkk"))}
      {row("MARKETING", marketing, t("consent.marketing"))}
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </div>
  );
}
