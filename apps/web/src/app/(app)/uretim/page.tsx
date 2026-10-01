import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtQty } from "@/lib/format";
import { canView } from "@/lib/modules";
import { type BatchProductOption, NewBatchForm } from "./NewBatchForm";
import { StageBadge } from "./StageBadge";

interface BatchRow {
  id: string;
  number: string;
  stage: string;
  plannedQty: number;
  plannedMl: string | null;
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
  volumeMl: number;
  formula: { id: string; status: string } | null;
}

interface FormulaRow {
  id: string;
  status: string;
  concentrationPct: string;
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
  const [batches, products, formulas] = await Promise.all([
    apiGet<BatchRow[]>("/production/batches"),
    canCreate ? apiGet<ProductRow[]>("/catalog/products") : Promise.resolve([]),
    canCreate ? apiGet<FormulaRow[]>("/formulas") : Promise.resolve([]),
  ]);
  // Konsantrasyon üretim yetkisiyle görülen formül listesinden gelir (satış ucuna açılmaz).
  const concByFormula = new Map(formulas.filter((f) => f.status === "APPROVED").map((f) => [f.id, f.concentrationPct]));
  const eligible: BatchProductOption[] = products.flatMap((p) => {
    const conc = p.formula ? concByFormula.get(p.formula.id) : undefined;
    return conc ? [{ id: p.id, label: `${p.name} · ${p.sku}`, volumeMl: p.volumeMl, concentrationPct: conc }] : [];
  });

  const days = (ms: number) => Math.max(0, Math.ceil(ms / 86_400_000));
  // Üretim kurulumu ilerlemesi: onaylı formülü olmayan ürünler sırayla kurulur.
  const pending = products.filter((p) => p.formula?.status !== "APPROVED").sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const readyCount = products.length - pending.length;
  const SHOW = 12;

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        {canCreate && pending.length > 0 && (
          <section className="flex flex-col gap-3 rounded-[16px] border border-gold-2/60 bg-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 font-display text-[17px] font-semibold">{t("setupProgress.title")}</h2>
                <p className="m-0 text-[12.5px] text-muted">{t("setupProgress.intro")}</p>
              </div>
              <span className="num text-[13px] font-semibold">{t("setupProgress.count", { ready: readyCount, total: products.length })}</span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-surface-soft">
              <span className="block h-full rounded-full bg-gold" style={{ width: `${products.length ? (readyCount / products.length) * 100 : 0}%` }} />
            </span>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {pending.slice(0, SHOW).map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/urunler/${p.id}#uretim-kurulumu`}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold no-underline transition-colors ${
                      i === 0 ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-text hover:border-gold-2"
                    }`}
                  >
                    {i === 0 && <span aria-hidden>▶</span>}
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
            {pending.length > SHOW && (
              <details className="group">
                <summary className="cursor-pointer text-[12.5px] font-semibold text-gold-text">
                  {t("setupProgress.showAll", { count: pending.length - SHOW })}
                </summary>
                <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                  {pending.slice(SHOW).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/urunler/${p.id}#uretim-kurulumu`}
                        className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-text no-underline transition-colors hover:border-gold-2"
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
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
                          {b.plannedMl ? `${fmtQty(b.plannedMl)} ml · ` : ""}
                          {t("units", { count: b.plannedQty })} · {b.bottleType ? t(`bottle.${b.bottleType}`) : "—"}
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
