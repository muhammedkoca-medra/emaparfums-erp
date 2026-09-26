"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Demlenme (maserasyon) saati: dairesel ilerleme + canlı geri sayım.
 * Süre dolunca yeşil "tamamlandı". Görsel süreç beslemesi (docs/06).
 */
export function MacerationClock({
  startIso,
  days,
  place,
}: {
  startIso: string | null;
  days: number | null;
  place: string | null;
}) {
  const t = useTranslations("production.maceration");
  // SSR ile istemci farkını önlemek için başlangıçta start anını kullan; gerçek zaman effect'te güncellenir.
  const [now, setNow] = useState(() => (startIso ? new Date(startIso).getTime() : 0));

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalMs = (days ?? 0) * 86_400_000;
  const startMs = startIso ? new Date(startIso).getTime() : null;
  const elapsed = startMs ? Math.max(0, now - startMs) : 0;
  const progress = startMs && totalMs > 0 ? Math.min(1, elapsed / totalMs) : 0;
  const remainingMs = startMs ? Math.max(0, totalMs - elapsed) : totalMs;
  const done = startMs != null && remainingMs <= 0;

  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = C * progress;

  const remDays = Math.floor(remainingMs / 86_400_000);
  const remHours = Math.floor((remainingMs % 86_400_000) / 3_600_000);

  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-line bg-surface p-5">
      <h3 className="m-0 self-start font-display text-[16px] font-semibold">{t("title")}</h3>
      <div className="relative">
        <svg viewBox="0 0 130 130" className="h-40 w-40 -rotate-90">
          <circle cx="65" cy="65" r={R} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="10" className="text-ink" />
          <circle
            cx="65"
            cy="65"
            r={R}
            fill="none"
            stroke={done ? "var(--color-ok)" : "var(--color-gold-2)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${C}`}
            style={{ transition: "stroke-dasharray 0.5s linear" }}
          />
          {/* saat ibresi */}
          <line
            x1="65"
            y1="65"
            x2={65 + R * 0.7 * Math.cos(progress * 2 * Math.PI)}
            y2={65 + R * 0.7 * Math.sin(progress * 2 * Math.PI)}
            stroke={done ? "var(--color-ok)" : "var(--color-gold-hover)"}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="65" cy="65" r="4" fill={done ? "var(--color-ok)" : "var(--color-gold-hover)"} />
        </svg>
        <div className="absolute inset-0 flex rotate-0 flex-col items-center justify-center text-center">
          {!startMs ? (
            <span className="px-4 text-[12px] text-muted">{t("notStarted")}</span>
          ) : done ? (
            <span className="text-[13px] font-bold text-ok">✓ {t("done")}</span>
          ) : (
            <>
              <span className="num font-display text-[26px] leading-none font-semibold">
                {remDays}
                <span className="text-[14px] text-muted">{t("dayShort")}</span> {remHours}
                <span className="text-[14px] text-muted">{t("hourShort")}</span>
              </span>
              <span className="text-[11px] text-muted">{t("remaining")}</span>
            </>
          )}
        </div>
      </div>
      <dl className="m-0 grid w-full grid-cols-2 gap-2 text-center text-[13px]">
        <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
          <dt className="text-[11px] text-muted">{t("title")}</dt>
          <dd className="num m-0 font-semibold">
            {days ?? "—"} {t("days")}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
          <dt className="text-[11px] text-muted">{t("place")}</dt>
          <dd className="m-0 font-semibold">{place ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
