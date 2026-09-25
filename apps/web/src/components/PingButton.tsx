"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiPost } from "@/lib/api-client";

/** Faz 0 çıkış kriteri: örnek olayı outbox'a yazar; worker işleyip loglar. */
export function PingButton() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          try {
            await apiPost("/system/ping");
            setState("sent");
            // Worker'ın olayı almasına zaman tanıyıp sayaçları yenile
            setTimeout(() => router.refresh(), 1500);
          } catch {
            setState("error");
          }
        }}
        className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-[9px] bg-ink px-3.5 text-[13px] font-semibold text-on-ink disabled:opacity-60"
      >
        {state === "sending" ? t("pingSending") : t("pingButton")}
      </button>
      <p role="status" className="m-0 text-xs text-muted">
        {state === "sent" ? t("pingSent") : state === "error" ? t("pingError") : t("pingHint")}
      </p>
    </div>
  );
}
