import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FORMULA_TONE, Pill } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtQty } from "@/lib/format";
import { canView } from "@/lib/modules";
import { NewFormulaForm } from "./NewFormulaForm";

interface FormulaRow {
  id: string;
  code: string;
  version: number;
  name: string;
  status: string;
  concentrationPct: string;
  approvedAt: string | null;
  lineCount: number;
  products: { id: string; name: string }[];
}

/** Formüller (F1-02). Oranlar ticari gizli: yalnızca production:VIEW. */
export default async function FormulasPage() {
  const t = await getTranslations("formulas");
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
  const rows = await apiGet<FormulaRow[]>("/formulas");
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";
  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <p className="m-0 max-w-3xl text-xs text-muted">{t("confidential")}</p>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            {rows.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("empty")}</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label={t("title")}>
                <thead>
                  <tr>
                    <th className={th}>{t("col.code")}</th>
                    <th className={th}>{t("col.name")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={`${th} text-right`}>{t("col.concentration")}</th>
                    <th className={`${th} text-right`}>{t("col.lines")}</th>
                    <th className={th}>{t("col.products")}</th>
                    <th className={th}>{t("col.approvedAt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id} className="hover:bg-surface-soft">
                      <td className={`${td} num font-bold`}>
                        <Link href={`/formuller/${f.id}`}>
                          {f.code} · v{f.version}
                        </Link>
                      </td>
                      <td className={td}>{f.name}</td>
                      <td className={td}>
                        <Pill tone={FORMULA_TONE[f.status] ?? "neu"}>{t(`status.${f.status}`)}</Pill>
                      </td>
                      <td className={`${td} num text-right`}>%{fmtQty(f.concentrationPct)}</td>
                      <td className={`${td} num text-right`}>{f.lineCount}</td>
                      <td className={`${td} text-text-2`}>{f.products.map((p) => p.name).join(", ") || "—"}</td>
                      <td className={`${td} num text-text-2`}>{f.approvedAt ? fmtDate(f.approvedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {me.permissions.includes("production:CREATE") && <NewFormulaForm />}
        </div>
      </div>
    </>
  );
}
