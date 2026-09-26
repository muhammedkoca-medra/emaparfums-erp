"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export function ApproveRuleButton({ id, category }: { id: string; category: string }) {
  const t = useTranslations("tax");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(t("confirmApprove", { category }))) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/tax/rules/${id}/approve`);
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("form.saved")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={onClick} className={`${primaryBtn} min-h-8 px-3 text-xs`}>
        {t("approve")}
      </button>
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
