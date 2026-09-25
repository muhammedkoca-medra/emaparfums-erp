"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiPost } from "@/lib/api-client";

export function LogoutButton() {
  const t = useTranslations("user");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      aria-label={t("logout")}
      title={t("logout")}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await apiPost("/auth/logout").catch(() => undefined);
        router.replace("/giris");
        router.refresh();
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-on-ink-muted hover:bg-ink-2 hover:text-on-ink disabled:opacity-50"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
    </button>
  );
}
