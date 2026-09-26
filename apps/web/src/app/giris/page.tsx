import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/BrandLogo";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const t = await getTranslations("app");
  const tv = await getTranslations("vitrin");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-7">
        <div className="flex flex-col items-center gap-2 text-[#231f20]">
          <BrandLogo variant="full" height={170} title={t("name")} />
          <span className="text-[11px] tracking-[0.1em] text-muted uppercase">{t("tagline")}</span>
        </div>
        <LoginForm />
        <Link href="/vitrin" className="text-center text-[13px] font-semibold text-gold-text hover:text-gold-hover">
          {tv("title")} →
        </Link>
      </div>
    </main>
  );
}
