import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FORMULA_TONE, Pill } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtQty } from "@/lib/format";
import { FormulaEditor } from "./FormulaEditor";

interface FormulaDetail {
  id: string;
  code: string;
  version: number;
  name: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
  concentrationPct: string;
  ifraAmendment: number | null;
  ifraCategory: string | null;
  lines: { itemId: string; percentage: string; item: { id: string; code: string; name: string } }[];
  allergens: { name: string; pctInFinal: string; mustLabel: boolean }[];
  products: { id: string; name: string; sku: string }[];
  boms: {
    id: string;
    batchSize: number;
    product: { id: string; name: string };
    lines: { qty: string; uom: string; scrapPct: string; item: { code: string; name: string } }[];
  }[];
  versions: { id: string; version: number; status: string }[];
}

export default async function FormulaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("formulas");
  const ts = await getTranslations("stock");
  const me = await getMe();
  let f: FormulaDetail;
  try {
    f = await apiGet<FormulaDetail>(`/formulas/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const materials = (await apiGet<{ id: string; code: string; name: string; type: string }[]>("/catalog/items").catch(() => []))
    .filter((i) => i.type === "RAW_MATERIAL" || i.type === "SEMI_FINISHED")
    .map((i) => ({ id: i.id, label: `${i.code} · ${i.name}` }));
  const perms = new Set(me.permissions);
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2";

  return (
    <>
      <Topbar
        heading={`${f.code} · ${f.name}`}
        sub={`v${f.version} · %${fmtQty(f.concentrationPct)}${f.ifraCategory ? ` · IFRA ${f.ifraCategory}` : ""}`}
        action={<Pill tone={FORMULA_TONE[f.status] ?? "neu"}>{t(`status.${f.status}`)}</Pill>}
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/formuller" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <FormulaEditor
            formula={f}
            materials={materials}
            canEdit={perms.has("production:EDIT")}
            canCreate={perms.has("production:CREATE")}
            canApprove={perms.has("production:APPROVE")}
          />
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5 text-[13px]">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("versions")}</h2>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {f.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    {v.id === f.id ? <strong>v{v.version}</strong> : <Link href={`/formuller/${v.id}`}>v{v.version}</Link>}
                    <Pill tone={FORMULA_TONE[v.status] ?? "neu"}>{t(`status.${v.status}`)}</Pill>
                  </li>
                ))}
              </ul>
              {f.products.length > 0 && (
                <p className="m-0 text-xs text-muted">
                  {f.products.map((p) => (
                    <Link key={p.id} href={`/urunler/${p.id}`} className="mr-2">
                      {p.name}
                    </Link>
                  ))}
                </p>
              )}
              <p className="m-0 text-xs text-muted">{t("ifraNote")}</p>
            </section>
            {f.boms.map((b) => (
              <section key={b.id} className="flex flex-col gap-2 overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
                <h2 className="m-0 font-display text-[17px] font-semibold">
                  {b.product.name} · {t("bom", { size: b.batchSize })}
                </h2>
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr>
                      <th className={th}>{t("bomLine.item")}</th>
                      <th className={`${th} text-right`}>{t("bomLine.qty")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.lines.map((l) => (
                      <tr key={l.item.code}>
                        <td className={td}>
                          {l.item.code} · {l.item.name}
                        </td>
                        <td className={`${td} num text-right`}>
                          {fmtQty(l.qty)} {ts.has(`uom.${l.uom}`) ? ts(`uom.${l.uom}`) : l.uom}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
            {f.boms.length === 0 && <p className="m-0 text-xs text-muted">{t("noBom")}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
