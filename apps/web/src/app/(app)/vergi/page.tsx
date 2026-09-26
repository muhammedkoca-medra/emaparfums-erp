import { getTranslations } from "next-intl/server";
import { Pill, TAX_STATE_TONE } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate } from "@/lib/format";
import { canView } from "@/lib/modules";
import { ApproveRuleButton } from "./ApproveRuleButton";
import { NewTaxRuleForm } from "./NewTaxRuleForm";
import { TaxPreview } from "./TaxPreview";

interface TaxRuleRow {
  id: string;
  category: string;
  gtipPrefix: string | null;
  kdvRate: string;
  otvRate: string;
  otvList: string | null;
  note: string | null;
  validFrom: string;
  validTo: string | null;
  state: "PENDING" | "ACTIVE" | "SCHEDULED" | "EXPIRED";
}

/** Oran gösterimi: "0.2000" → "%20". Hesap yapılmaz, yalnızca biçim. */
const pct = (rate: string) => `%${(Number(rate) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;

/** Vergi merkezi (F1-08). Oranlar TaxRule tablosundan; kod içinde oran yok. */
export default async function TaxPage() {
  const t = await getTranslations("tax");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "tax")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const rules = await apiGet<TaxRuleRow[]>("/tax/rules");
  const categories = [...new Set(rules.filter((r) => r.state === "ACTIVE").map((r) => r.category))];
  const canApprove = me.permissions.includes("tax:APPROVE");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <p className="m-0 max-w-3xl rounded-[10px] bg-warn-bg px-4 py-2.5 text-[13px] text-warn">{t("legalNote")}</p>
        <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
          <h2 className="m-0 mb-3 font-display text-[19px] font-semibold">{t("rulesTitle")}</h2>
          <table className="w-full min-w-[820px] border-collapse text-[13px]" aria-label={t("rulesTitle")}>
            <thead>
              <tr>
                <th className={th}>{t("col.category")}</th>
                <th className={th}>{t("col.gtip")}</th>
                <th className={`${th} text-right`}>{t("col.kdv")}</th>
                <th className={`${th} text-right`}>{t("col.otv")}</th>
                <th className={th}>{t("col.list")}</th>
                <th className={th}>{t("col.validFrom")}</th>
                <th className={th}>{t("col.validTo")}</th>
                <th className={th}>{t("col.state")}</th>
                <th className={th}>{t("col.note")}</th>
                {canApprove && <th className={th} />}
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} font-bold`}>{r.category}</td>
                  <td className={`${td} num`}>{r.gtipPrefix ?? "—"}</td>
                  <td className={`${td} num text-right`}>{pct(r.kdvRate)}</td>
                  <td className={`${td} num text-right`}>{pct(r.otvRate)}</td>
                  <td className={td}>{r.otvList ?? "—"}</td>
                  <td className={`${td} num`}>{fmtDate(r.validFrom)}</td>
                  <td className={`${td} num`}>{fmtDate(r.validTo)}</td>
                  <td className={td}>
                    <Pill tone={TAX_STATE_TONE[r.state]}>{t(`state.${r.state}`)}</Pill>
                  </td>
                  <td className={`${td} max-w-[240px] text-xs text-text-2`}>{r.note ?? "—"}</td>
                  {canApprove && (
                    <td className={td}>{r.state === "PENDING" && <ApproveRuleButton id={r.id} category={r.category} />}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <TaxPreview categories={categories} />
          {me.permissions.includes("tax:EDIT") && <NewTaxRuleForm />}
        </div>
      </div>
    </>
  );
}
