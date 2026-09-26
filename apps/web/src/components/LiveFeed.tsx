"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { fmtWhen } from "@/lib/format";

interface FeedItem {
  id: string;
  type: string;
  module: string;
  label: string | null;
  createdAt: string;
}

const MAX = 30;

/** Canlı olay akışı (PNL-02): /api/dashboard/feed SSE. Yalnızca izinli modüllerin olayları gelir. */
export function LiveFeed() {
  const t = useTranslations();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/dashboard/feed", { withCredentials: true });
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener("event", (e) => {
      const item = JSON.parse((e as MessageEvent<string>).data) as FeedItem;
      setLive(true);
      setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev].slice(0, MAX)));
    });
    return () => es.close();
  }, []);

  const typeLabel = (type: string) => {
    const key = `events.type.${type.replaceAll(".", "_")}`;
    return t.has(key) ? t(key) : type;
  };
  const moduleLabel = (m: string) => (t.has(`events.module.${m}`) ? t(`events.module.${m}`) : m);

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="m-0 font-display text-[19px] font-semibold">{t("dashboard.feedTitle")}</h2>
          <span className="text-xs text-muted">{t("dashboard.feedSubtitle")}</span>
        </div>
        <span
          role="status"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            live ? "bg-ok-bg text-ok" : "bg-neu-bg text-neu"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-ok" : "bg-neu"}`} aria-hidden />
          {live ? t("dashboard.feedLive") : t("dashboard.feedOffline")}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t("dashboard.feedEmpty")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0" aria-label={t("dashboard.feedTitle")}>
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 border-t border-line-soft py-2 text-[13px] first:border-t-0">
              <span className="num w-12 shrink-0 text-xs text-muted">{fmtWhen(i.createdAt)}</span>
              <span className="shrink-0 rounded-full bg-neu-bg px-2 py-0.5 text-[11px] font-semibold text-neu">
                {moduleLabel(i.module)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{typeLabel(i.type)}</span>
                {i.label && <span className="text-text-2"> · {i.label}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
