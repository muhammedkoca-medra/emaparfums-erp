import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4">
      <section className="flex max-w-md flex-col gap-3 rounded-[16px] border border-line bg-surface p-6">
        <span className="eyebrow">404</span>
        <h1 className="m-0 font-display text-[24px] font-semibold">{t("title")}</h1>
        <p className="m-0 text-[13.5px] text-text-2">{t("body")}</p>
        <Link href="/" className="text-[13px] font-semibold">
          {t("home")}
        </Link>
      </section>
    </main>
  );
}
