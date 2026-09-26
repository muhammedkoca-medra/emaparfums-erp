import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";
import { type BottleRow, BottleGallery } from "./BottleGallery";

/** Şişeler (3B modeller + stok). Ürün bazlı şişeleme burada seçilir, stok bağlı kalemden girilir. */
export default async function BottlesPage() {
  const t = await getTranslations("bottles");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "sales")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const bottles = await apiGet<BottleRow[]>("/catalog/bottles");
  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <p className="m-0 max-w-3xl text-xs text-muted">{t("hint")}</p>
        <BottleGallery bottles={bottles} canEditStock={me.permissions.includes("stock:EDIT") || me.permissions.includes("stock:CREATE")} />
      </div>
    </>
  );
}
