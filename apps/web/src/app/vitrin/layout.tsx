import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";

/** Herkese açık vitrin kabuğu: oturum gerektirmez (getMe çağrılmaz). */
export default async function VitrinLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("vitrin");
  return (
    <div className="flex min-h-screen flex-col bg-ground">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/vitrin" aria-label="EMA Parfums" className="text-gold-text">
            <BrandLogo variant="wordmark" className="h-7 w-auto" />
          </Link>
          <Link href="/giris" className="text-xs font-semibold text-muted hover:text-text">
            {t("loginLink")}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8">{children}</main>
      <footer className="mt-4 flex flex-col items-center gap-2 border-t border-line px-4 py-8 text-center text-xs text-muted sm:px-8">
        <span className="text-gold-text">
          <BrandLogo variant="mark" className="h-8 w-auto" />
        </span>
        {t("footer")}
      </footer>
    </div>
  );
}
