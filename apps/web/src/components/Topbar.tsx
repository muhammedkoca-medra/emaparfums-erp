import { getFormatter } from "next-intl/server";
import { type ReactNode } from "react";

/** Üst bar (prototip "Üst bar"): sayfa başlığı, alt başlık, tarih ve sayfaya özel eylem. */
export async function Topbar({
  heading,
  sub,
  action,
}: {
  heading: string;
  sub?: string;
  action?: ReactNode;
}) {
  const format = await getFormatter();
  const today = format.dateTime(new Date(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
  return (
    <header className="flex min-h-[76px] flex-wrap items-center gap-4 border-b border-line bg-ground py-3 pr-4 pl-18 sm:pr-8 lg:pl-8">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="m-0 font-display text-[22px] leading-tight font-semibold sm:text-[26px]">{heading}</h1>
        {sub && <p className="m-0 text-[13px] text-muted">{sub}</p>}
      </div>
      <div className="hidden h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-[13px] text-text-2 md:flex">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span>{today}</span>
      </div>
      {action}
    </header>
  );
}
