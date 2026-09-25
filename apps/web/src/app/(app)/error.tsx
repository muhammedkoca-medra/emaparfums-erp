"use client";

import { useTranslations } from "next-intl";

/** Oturumlu sayfalarda beklenmeyen hata (ör. API'ye ulaşılamıyor). */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="px-4 py-10 sm:px-8">
      <section
        role="alert"
        className="flex max-w-xl flex-col gap-3 rounded-[16px] border border-line bg-surface p-6"
      >
        <h1 className="m-0 font-display text-[22px] font-semibold">{t("error")}</h1>
        <p className="m-0 text-[13.5px] text-text-2">{t("apiUnavailable")}</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-10 items-center self-start rounded-[9px] bg-ink px-4 text-[13px] font-semibold text-on-ink"
        >
          {t("retry")}
        </button>
      </section>
    </div>
  );
}
