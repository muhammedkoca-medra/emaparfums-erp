"use client";

import { type MeResponse } from "@atelier/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Icon } from "@/components/Icon";
import { LogoutButton } from "@/components/LogoutButton";
import { visibleNav } from "@/lib/modules";

/** Kenar menü (prototip "Kenar menü"): yalnızca VIEW izni olan modüller görünür. */
export function Sidebar({ me }: { me: MeResponse }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = visibleNav(me.permissions);
  const initials = me.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");
  const roleLine = me.isExternal
    ? t("user.external")
    : me.roles.some((r) => r.code === "ADMIN")
      ? `${me.roles.map((r) => r.name).join(", ")} · ${t("user.allModules")}`
      : me.roles.map((r) => r.name).join(", ");

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <button
        type="button"
        className="fixed top-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-[10px] bg-ink text-on-ink lg:hidden"
        aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </svg>
      </button>
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col gap-3 bg-ink px-4 pt-[18px] pb-3.5 text-on-ink-2 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex flex-col items-center gap-1.5 rounded-lg px-2 pt-1 pb-0.5 text-gold no-underline hover:text-gold"
        >
          <BrandLogo variant="compact" height={78} title={t("app.name")} />
          <span className="text-[10.5px] tracking-[0.08em] text-on-ink-muted uppercase">
            {t("app.tagline")}
          </span>
        </Link>

        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-ink-line bg-ink-2 px-2.5">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A39888"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">{t("nav.search")}</span>
          <input
            type="text"
            placeholder={t("nav.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-on-ink-2 outline-none placeholder:text-on-ink-muted"
          />
        </label>

        <nav aria-label={t("nav.menuLabel")} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.group} className="flex flex-col gap-px">
              <div className="px-3 pb-[3px] text-[10.5px] font-bold tracking-[0.14em] text-on-ink-muted uppercase">
                {t(`nav.groups.${g.group}`)}
              </div>
              {g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[30px] items-center gap-3 rounded-lg px-3 py-1 text-[13px] no-underline ${
                      active
                        ? "bg-gold font-bold text-ink hover:text-ink"
                        : "font-medium text-on-ink-3 hover:bg-ink-2 hover:text-on-ink"
                    }`}
                  >
                    <Icon name={it.icon} />
                    <span className="flex-1">{t(`nav.modules.${it.key}`)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-[13px] font-bold text-ink">
            {initials}
          </div>
          <Link
            href="/hesap"
            onClick={() => setOpen(false)}
            title={t("user.account")}
            className="flex min-w-0 flex-1 flex-col rounded-lg no-underline hover:bg-ink-2"
          >
            <span className="truncate text-[13px] font-semibold text-on-ink">{me.fullName}</span>
            <span className="truncate text-[11.5px] text-on-ink-muted">{roleLine}</span>
          </Link>
          <LogoutButton />
        </div>
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
