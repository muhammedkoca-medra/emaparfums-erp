import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { getMe } from "@/lib/api-server";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function AccountPage() {
  const t = await getTranslations("account");
  const me = await getMe();
  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="grid gap-4 px-4 py-5 sm:px-8 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 font-display text-[19px] font-semibold">{t("profile")}</h2>
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
            <dt className="text-muted">{t("name")}</dt>
            <dd className="m-0 font-semibold">{me.fullName}</dd>
            <dt className="text-muted">{t("email")}</dt>
            <dd className="m-0">{me.email}</dd>
            <dt className="text-muted">{t("roles")}</dt>
            <dd className="m-0">{me.roles.map((r) => r.name).join(", ")}</dd>
          </dl>
        </section>
        <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 font-display text-[19px] font-semibold">{t("passwordTitle")}</h2>
          <p className="m-0 text-[13px] text-muted">{t("passwordHint")}</p>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
