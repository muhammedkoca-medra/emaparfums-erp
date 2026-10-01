"use client";

import { useEffect } from "react";

/**
 * Adres çubuğundaki #id, sayfadaki katlanır bir <details id> bölümünü işaret ediyorsa onu açar
 * (ör. "✎ Düzenle" bağlantısı → #duzenle). Sayfa açılışında ve bağlantıya tıklandığında çalışır.
 */
export function HashOpener({ ids }: { ids: string[] }) {
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.slice(1);
      if (!ids.includes(id)) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) el.open = true;
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [ids]);
  return null;
}
