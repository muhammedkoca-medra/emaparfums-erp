import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { type StockRules } from "@/lib/stock-types";
import { RuleForm } from "./RuleForm";

export default async function StockRulesPage() {
  const t = await getTranslations("stock");
  const me = await getMe();
  const rules = await apiGet<StockRules>("/stock/rules");
  const canEdit = me.permissions.includes("stock:APPROVE");
  return (
    <>
      <Topbar heading={t("rules.title")} sub={t("rules.subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/stok" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        {!canEdit && (
          <p className="m-0 max-w-2xl rounded-[10px] bg-info-bg px-4 py-3 text-[13px] text-info">
            {t("rules.readOnly")}
          </p>
        )}
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          {Object.entries(rules).map(([key, r]) => (
            <RuleForm
              key={key}
              ruleKey={key}
              label={t(`rules.keys.${key.replace(".", "_")}`)}
              value={String(r.value)}
              defaultValue={String(r.default)}
              canEdit={canEdit}
            />
          ))}
        </div>
      </div>
    </>
  );
}
