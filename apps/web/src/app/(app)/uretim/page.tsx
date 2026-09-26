import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { canView } from "@/lib/modules";
import { NewBatchForm } from "./NewBatchForm";
import { StageBadge } from "./StageBadge";

interface BatchRow {
  id: string;
  number: string;
  stage: string;
  plannedQty: number;
  essencePct: number | null;
  bottleType: string | null;
  macerationDays: number | null;
  maceration: { remainingMs: number; done: boolean } | null;
  product: { name: string; sku: string; itemCode: string };
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  formula: { status: string } | null;
}

/** Üretim partileri (F3-01). Görsel karışım + demlenme takibi. */
export default async function ProductionPage() {
  const t = await getTranslations("production");
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
  const canCreate = me.permissions.includes("production:CREATE");
  const [batches, products] = await Promise.all([
    apiGet<BatchRow[]>("/production/batches"),
    canCreate ? apiGet<ProductRow[]>("/catalog/products") : Promise.resolve([]),
  ]);
  const eligible = products.filter((p) => p.formula?.status === "APPROVED").map((p) => ({ id: p.id, label: `${p.name} · ${p.sku}` }));

  const days = (ms: number) => Math.max(0, Math.ceil(ms / 86_400_000));

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <span className="text-xs text-muted">{t("count", { count: batches.length })}</span>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-3">
            {batches.length === 0 ? (
              <p className="m-0 rounded-[16px] border border-line bg-surface p-5 text-[13px] text-muted">{t("empty")}</p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
                {batches.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/uretim/${b.id}`}
                      className="flex h-full flex-col gap-3 rounded-[16px] border border-line bg-surface p-4 no-underline shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-2 hover:shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="num text-[12px] font-bold text-gold-text">{b.number}</span>
                          <span className="block truncate font-display text-[16px] font-semibold text-text">{b.product.name}</span>
                          <span className="num text-[11.5px] text-muted">{b.product.sku}</span>
                        </div>
                        <StageBadge stage={b.stage} />
                      </div>
                      <div className="flex items-center justify-between text-[12px] text-text-2">
                        <span>
                          {b.plannedQty} adet · {b.bottleType ? t(`bottle.${b.bottleType}`) : "—"}
                        </span>
                        {b.stage === "MACERATION" && b.maceration ? (
                          <span className={`num font-semibold ${b.maceration.done ? "text-ok" : "text-gold-hover"}`}>
                            {b.maceration.done ? t("maceration.done") : `${days(b.maceration.remainingMs)} ${t("maceration.days")} ${t("maceration.remaining")}`}
                          </span>
                        ) : (
                          b.essencePct != null && <span className="num">%{b.essencePct} {t("mix.essence").toLocaleLowerCase("tr")}</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {canCreate && <NewBatchForm products={eligible} />}
        </div>
      </div>
    </>
  );
}
