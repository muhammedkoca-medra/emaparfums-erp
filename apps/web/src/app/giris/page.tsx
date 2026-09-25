import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Icon";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const t = await getTranslations("app");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex items-center gap-3 self-center rounded-[16px] bg-ink px-5 py-3.5">
          <Logo />
          <div className="flex flex-col">
            <span className="font-display text-[22px] font-semibold text-on-ink">{t("name")}</span>
            <span className="text-[11px] tracking-[0.04em] text-on-ink-muted">{t("tagline")}</span>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
