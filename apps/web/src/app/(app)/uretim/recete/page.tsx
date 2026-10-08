import { DEFAULT_RECIPE_TEMPLATE } from "@atelier/shared";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";
import { type Template, TemplateEditor } from "./TemplateEditor";

/** Standart kütlesel reçete (varsayılan oranlar). Yeni ürün kurulumları bu oranlarla başlar. */
export default async function RecipeTemplatePage() {
  const t = await getTranslations("production.template");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "production")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const tpl = await apiGet<Template & { updatedAt: string | null }>("/production/recipe-template");
  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex max-w-4xl flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/uretim" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        {tpl.updatedAt && (
          <p className="m-0 text-[12px] text-muted">
            {t("updatedAt", { at: new Date(tpl.updatedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        )}
        <TemplateEditor
          template={{ densityGPerMl: tpl.densityGPerMl, lines: tpl.lines }}
          defaults={DEFAULT_RECIPE_TEMPLATE}
          canEdit={me.permissions.includes("production:APPROVE")}
        />
      </div>
    </>
  );
}
