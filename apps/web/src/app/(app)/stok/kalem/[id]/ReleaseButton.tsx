"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { secondaryBtn } from "@/components/ui";
import { apiPost } from "@/lib/api-client";

export function ReleaseButton({ id }: { id: string }) {
  const t = useTranslations("stock.item");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={secondaryBtn}
      onClick={async () => {
        if (!window.confirm(t("confirmRelease"))) return;
        setBusy(true);
        try {
          await apiPost(`/stock/reservations/${id}/release`);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {t("release")}
    </button>
  );
}
