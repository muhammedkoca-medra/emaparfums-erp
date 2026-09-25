import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pill, STOCK_STATUS_TONE } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoneyCompact, fmtQty, fmtWhen } from "@/lib/format";
import { canView } from "@/lib/modules";
import {
  type BalanceRow,
  type MovementRow,
  movementSign,
  type StockRules,
  type StockSummary,
  type WarehouseRow,
} from "@/lib/stock-types";

const TYPES = ["RAW_MATERIAL", "PACKAGING", "SEMI_FINISHED", "FINISHED_GOOD"] as const;

/** Stok takip (prototip ekranı 03 · docs/03-moduller/stok.md). */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; q?: string }>;
}) {
  const t = await getTranslations("stock");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "stock")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p
          role="alert"
          className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8"
        >
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const { tip, q } = await searchParams;
  const type = TYPES.find((x) => x === tip);
  const qs = new URLSearchParams({ ...(type ? { type } : {}), ...(q ? { search: q } : {}) });

  const [rows, summary, whs, moves, rules] = await Promise.all([
    apiGet<BalanceRow[]>(`/stock/balances?${qs}`),
    apiGet<StockSummary>("/stock/summary"),
    apiGet<WarehouseRow[]>("/stock/warehouses"),
    apiGet<MovementRow[]>("/stock/movements?limit=6"),
    apiGet<StockRules>("/stock/rules"),
  ]);
  const canCreate = me.permissions.includes("stock:CREATE");
  const uom = (u: string) => (t.has(`uom.${u}`) ? t(`uom.${u}`) : u);
  const tabHref = (tp?: string) => {
    const p = new URLSearchParams({ ...(tp ? { tip: tp } : {}), ...(q ? { q } : {}) });
    const s = p.toString();
    return s ? `/stok?${s}` : "/stok";
  };

  const kpis = [
    {
      label: t("kpi.value"),
      value: summary.stockValue === null ? t("kpi.valueNoCost") : fmtMoneyCompact(summary.stockValue),
      note: t("kpi.valueNote", { count: summary.itemsWithoutCost }),
    },
    { label: t("kpi.critical"), value: String(summary.criticalItems), note: t("kpi.criticalNote") },
    {
      label: t("kpi.expiring"),
      value: t("kpi.expiringValue", { count: summary.expiringLots }),
      note: t("kpi.expiringNote", { days: summary.expiryWarningDays }),
      href: "/stok/skt",
    },
    { label: t("kpi.turnover"), value: "—", note: t("kpi.turnoverNote") },
  ];

  const th = "px-1 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-b border-line-soft px-1 py-2.5 align-middle";

  return (
    <>
      <Topbar
        heading={t("title")}
        sub={t("subtitle", { count: whs.length })}
        action={
          canCreate ? (
            <Link
              href="/stok/giris"
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-ink px-4 text-[13.5px] font-semibold text-on-ink no-underline hover:text-on-ink"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("newReceipt")}
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => {
            const body = (
              <>
                <span className="eyebrow">{k.label}</span>
                <span className="num font-display text-[28px] leading-tight font-semibold">{k.value}</span>
                <span className="text-xs text-muted">{k.note}</span>
              </>
            );
            return k.href ? (
              <Link
                key={k.label}
                href={k.href}
                className="flex flex-col gap-1.5 rounded-[16px] border border-line bg-surface px-[18px] py-4 text-text no-underline hover:border-gold-2 hover:text-text"
              >
                {body}
              </Link>
            ) : (
              <div
                key={k.label}
                className="flex flex-col gap-1.5 rounded-[16px] border border-line bg-surface px-[18px] py-4"
              >
                {body}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-line bg-surface px-5 py-[18px]">
            <div className="flex flex-wrap items-center gap-2">
              <nav aria-label={t("tableLabel")} className="flex flex-wrap gap-2">
                {[undefined, ...TYPES].map((tp) => {
                  const active = tp === type;
                  return (
                    <Link
                      key={tp ?? "all"}
                      href={tabHref(tp)}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex min-h-10 items-center rounded-[10px] border px-4 text-[13px] font-semibold no-underline ${
                        active
                          ? "border-ink bg-ink text-on-ink hover:text-on-ink"
                          : "border-line bg-surface text-text-2 hover:border-gold-2 hover:text-text"
                      }`}
                    >
                      {t(`tabs.${tp ?? "all"}`)}
                    </Link>
                  );
                })}
              </nav>
              <form
                action="/stok"
                className="ml-auto flex min-h-10 items-center gap-2 rounded-[10px] border border-line px-3 text-[13px] text-muted"
              >
                {type && <input type="hidden" name="tip" value={type} />}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
                <label className="sr-only" htmlFor="stock-search">
                  {t("searchLabel")}
                </label>
                <input
                  id="stock-search"
                  name="q"
                  defaultValue={q}
                  placeholder={t("searchPlaceholder")}
                  className="w-36 border-0 bg-transparent text-[13px] text-text outline-none"
                />
                <button type="submit" className="sr-only">
                  {t("searchButton")}
                </button>
              </form>
            </div>

            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[760px] border-collapse text-[13px]"
                aria-label={t("tableLabel")}
              >
                <thead>
                  <tr className="border-b border-line">
                    <th className={th}>{t("col.code")}</th>
                    <th className={th}>{t("col.item")}</th>
                    <th className={th}>{t("col.lot")}</th>
                    <th className={`${th} text-right`}>{t("col.onHand")}</th>
                    <th className={`${th} text-right`}>{t("col.reserved")}</th>
                    <th className={`${th} text-right`}>{t("col.min")}</th>
                    <th className={th}>{t("col.status")}</th>
                    <th className={th}>{t("col.location")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-1 py-6 text-center text-muted">
                        {t("empty")}
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={`${r.itemId}-${r.lotId}-${r.locationId}`} className="hover:bg-surface-soft">
                      <td className={`${td} num font-bold text-text-2`}>
                        <Link
                          href={`/stok/kalem/${r.itemId}`}
                          className="text-text-2 no-underline hover:text-gold-text"
                        >
                          {r.code}
                        </Link>
                      </td>
                      <td className={td}>
                        <Link
                          href={`/stok/kalem/${r.itemId}`}
                          className="flex flex-col gap-0.5 text-text no-underline hover:text-gold-text"
                        >
                          <span className="font-semibold">{r.name}</span>
                          <span className="text-[11.5px] text-muted">{t(`type.${r.type}`)}</span>
                        </Link>
                      </td>
                      <td className={`${td} num text-text-2`}>
                        {r.lotNo ?? "—"}
                        {r.expiryDate && (
                          <span className="block text-[11px] text-muted">{fmtDate(r.expiryDate)}</span>
                        )}
                      </td>
                      <td className={`${td} num text-right font-semibold`}>
                        {fmtQty(r.qtyOnHand)} {uom(r.uom)}
                      </td>
                      <td className={`${td} num text-right text-text-2`}>
                        {fmtQty(r.qtyReserved)} {uom(r.uom)}
                      </td>
                      <td className={`${td} num text-right text-text-2`}>
                        {r.minStock ? `${fmtQty(r.minStock)} ${uom(r.uom)}` : "—"}
                      </td>
                      <td className={td}>
                        <Pill tone={STOCK_STATUS_TONE[r.status] ?? "neu"}>{t(`status.${r.status}`)}</Pill>
                      </td>
                      <td className={`${td} text-xs text-text-2`}>
                        {r.warehouseName ? (
                          <>
                            {r.warehouseName}
                            <span className="block text-muted">{r.locationCode}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface px-5 py-[18px]">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("warehouses")}</h2>
              {whs.map((w) => {
                const pct = w.locationCount ? Math.round((w.usedLocations / w.locationCount) * 100) : 0;
                return (
                  <div key={w.id} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[13px]">
                      <span className="font-semibold">{w.name}</span>
                      <span className="num font-bold">%{pct}</span>
                    </div>
                    <span className="text-[11.5px] text-muted">
                      {t("warehouseUsage", { used: w.usedLocations, total: w.locationCount })}
                      {w.tempMinC &&
                        ` · ${t("temperature", { min: fmtQty(w.tempMinC), max: fmtQty(w.tempMaxC) })}`}
                    </span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line-soft" role="presentation">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: pct > 80 ? "#A15C1B" : "#4E6B57" }}
                      />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-2.5 rounded-[16px] border border-line bg-surface px-5 py-[18px]">
              <h2 className="m-0 font-display text-[19px] font-semibold">{t("recentMovements")}</h2>
              {moves.length === 0 && <p className="m-0 text-[13px] text-muted">{t("noMovements")}</p>}
              {moves.map((m) => {
                const sign = movementSign(m);
                const tone =
                  sign === "+"
                    ? "bg-ok-bg text-ok"
                    : sign === "−"
                      ? "bg-bad-bg text-bad"
                      : "bg-info-bg text-info";
                return (
                  <div
                    key={m.id}
                    className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]"
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ${tone}`}
                      aria-hidden="true"
                    >
                      {sign}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">
                        {m.itemName} × {fmtQty(m.qty)} {uom(m.uom)}
                      </span>
                      <span className="truncate text-[11.5px] text-muted">
                        {t(`movementType.${m.type}`)} · {m.lotNo}
                        {m.note ? ` · ${m.note}` : ""}
                      </span>
                    </div>
                    <span className="num text-[11.5px] text-muted">{fmtWhen(m.createdAt)}</span>
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-2 rounded-[16px] bg-ink px-[18px] py-4 text-on-ink-2">
              <span className="text-[10.5px] font-bold tracking-[0.12em] text-gold uppercase">
                {t("rulesTitle")}
              </span>
              <p className="m-0 text-[12.5px] leading-relaxed">
                {t("rulesSummary", {
                  hours: String(rules["stock.belowMinRenotifyHours"]?.value ?? ""),
                  days: String(rules["stock.expiryWarningDays"]?.value ?? ""),
                  buffer: String(rules["stock.channelBuffer"]?.value ?? ""),
                  threshold: fmtQty(String(rules["stock.countApprovalThreshold"]?.value ?? "0")),
                })}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-semibold">
                <Link href="/stok/kurallar" className="text-gold hover:text-on-ink">
                  {t("rulesEdit")}
                </Link>
                <Link href="/stok/skt" className="text-gold hover:text-on-ink">
                  {t("expiringLink")}
                </Link>
                <Link href="/stok/sayim" className="text-gold hover:text-on-ink">
                  {t("countsLink")}
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
