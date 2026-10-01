import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";
import { NewProductFull } from "./NewProductFull";

/** Yeni ürün ekleme (premium tek ekran): görsel + ticari bilgi + vitrin koku profili. */
export default async function NewProductPage() {
  const t = await getTranslations("catalog");
  const me = await getMe();
  if (!me.permissions.includes("sales:CREATE")) redirect("/urunler");

  const rules = canView(me.permissions, "tax")
    ? await apiGet<{ category: string }[]>("/tax/rules").catch(() => [])
    : [];
  const categories = [...new Set(rules.map((r) => r.category))];
  if (categories.length === 0) categories.push("PERFUME");

  return (
    <>
      <Topbar heading={t("createTitle")} sub={t("createSub")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/urunler" className="self-start text-[13px] font-semibold">
          ← {t("hub.vitrinTitle")}
        </Link>
        <NewProductFull categories={categories} />
      </div>
    </>
  );
}
