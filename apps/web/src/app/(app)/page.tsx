import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/Icon";
import { LiveFeed } from "@/components/LiveFeed";
import { PingButton } from "@/components/PingButton";
import { Topbar } from "@/components/Topbar";
import { apiTry, getMe } from "@/lib/api-server";
import { ALL_ITEMS, canView } from "@/lib/modules";

interface Summary {
  stock: { criticalItems: number; expiringLots: number; expiryWarningDays: number } | null;
  production: { formulasInReview: number } | null;
  sales?: { openOrders: number; awaitingStock: number; cancellationsPending: number } | null;
  tax: { pendingRules: number } | null;
  admin: { pendingApprovals: number } | null;
}

interface SystemStatus {
  outbox: { PENDING: number; DISPATCHED: number; FAILED: number };
}

function greetingKey(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hour12: false, timeZone: "Europe/Istanbul" }).format(
      date,
    ),
  );
  if (hour < 11) return "greetingMorning" as const;
  if (hour < 18) return "greetingDay" as const;
  return "greetingEvening" as const;
}

export default async function DashboardPage() {
  const t = await getTranslations();
  const me = await getMe();
  const isAdmin = canView(me.permissions, "admin");
  const canDash = canView(me.permissions, "dashboard");
  const [health, status, summary] = await Promise.all([
    apiTry<{ status: string }>("/system/health"),
    isAdmin ? apiTry<SystemStatus>("/system/status") : Promise.resolve(null),
    canDash ? apiTry<Summary>("/dashboard/summary") : Promise.resolve(null),
  ]);
  const kpis: { key: string; value: number; note: string; href: string; alert: boolean }[] = [];
  if (summary?.sales) {
    kpis.push(
      { key: "openOrders", value: summary.sales.openOrders, note: t("dashboard.kpi.openOrdersNote"), href: "/siparisler", alert: false },
      { key: "awaitingStock", value: summary.sales.awaitingStock, note: t("dashboard.kpi.awaitingStockNote"), href: "/siparisler", alert: summary.sales.awaitingStock > 0 },
      { key: "cancellations", value: summary.sales.cancellationsPending, note: t("dashboard.kpi.cancellationsNote"), href: "/siparisler?status=CANCELLED", alert: summary.sales.cancellationsPending > 0 },
    );
  }
  if (summary?.stock) {
    kpis.push(
      { key: "critical", value: summary.stock.criticalItems, note: t("dashboard.kpi.criticalNote"), href: "/stok", alert: summary.stock.criticalItems > 0 },
      { key: "expiring", value: summary.stock.expiringLots, note: t("dashboard.kpi.expiringNote", { days: summary.stock.expiryWarningDays }), href: "/stok/skt", alert: summary.stock.expiringLots > 0 },
    );
  }
  if (summary?.production)
    kpis.push({ key: "formulas", value: summary.production.formulasInReview, note: t("dashboard.kpi.formulasNote"), href: "/formuller", alert: summary.production.formulasInReview > 0 });
  if (summary?.tax)
    kpis.push({ key: "taxRules", value: summary.tax.pendingRules, note: t("dashboard.kpi.taxRulesNote"), href: "/vergi", alert: summary.tax.pendingRules > 0 });
  if (summary?.admin)
    kpis.push({ key: "approvals", value: summary.admin.pendingApprovals, note: t("dashboard.kpi.approvalsNote"), href: "/yetki?tab=matrix", alert: summary.admin.pendingApprovals > 0 });
  const modules = ALL_ITEMS.filter((i) => i.href !== "/" && canView(me.permissions, i.permission));
  const firstName = me.fullName.split(" ")[0] ?? me.fullName;

  return (
    <>
      <Topbar heading={t(`dashboard.${greetingKey()}`, { name: firstName })} sub={t("dashboard.subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        {kpis.length > 0 && (
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-5" aria-label={t("dashboard.subtitle")}>
            {kpis.map((k) => (
              <li key={k.key}>
                <Link
                  href={k.href}
                  className="flex h-full flex-col gap-1 rounded-[16px] border border-line bg-surface p-4 text-text no-underline hover:border-gold-2 hover:text-text"
                >
                  <span className="text-[12px] font-semibold text-text-2">{t(`dashboard.kpi.${k.key}`)}</span>
                  <span className={`num font-display text-[30px] leading-none font-semibold ${k.alert ? "text-bad" : "text-text"}`}>
                    {k.value}
                  </span>
                  <span className="text-xs text-muted">{k.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canDash && <LiveFeed />}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="flex flex-col gap-3 rounded-[16px] bg-ink p-5 text-on-ink-2 lg:col-span-2">
            <span className="text-[10.5px] font-bold tracking-[0.12em] text-gold uppercase">
              {t("dashboard.phaseEyebrow")}
            </span>
            <h2 className="m-0 font-display text-[19px] font-semibold text-on-ink">
              {t("dashboard.phaseTitle")}
            </h2>
            <p className="m-0 max-w-[68ch] text-[13.5px] leading-relaxed">{t("dashboard.phaseBody")}</p>
          </section>

          <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[19px] font-semibold">{t("dashboard.systemTitle")}</h2>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">{t("dashboard.apiLabel")}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${health ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}
              >
                {health ? t("dashboard.apiOk") : t("dashboard.apiDown")}
              </span>
            </div>
            {status && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-text-2">{t("dashboard.outboxLabel")}</span>
                <dl className="m-0 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["outboxPending", status.outbox.PENDING, "bg-neu-bg text-neu"],
                      ["outboxDispatched", status.outbox.DISPATCHED, "bg-ok-bg text-ok"],
                      [
                        "outboxFailed",
                        status.outbox.FAILED,
                        status.outbox.FAILED ? "bg-bad-bg text-bad" : "bg-neu-bg text-neu",
                      ],
                    ] as const
                  ).map(([key, value, cls]) => (
                    <div key={key} className={`flex flex-col gap-0.5 rounded-[10px] px-3 py-2 ${cls}`}>
                      <dt className="text-[11px] font-semibold">{t(`dashboard.${key}`)}</dt>
                      <dd className="num m-0 font-display text-[22px] font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {isAdmin && <PingButton />}
          </section>
        </div>

        <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">{t("dashboard.modulesEyebrow")}</span>
            <span className="text-xs text-muted">
              {t("dashboard.modulesCount", { count: modules.length })}
            </span>
          </div>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
            {modules.map((m) => (
              <li key={m.key}>
                <Link
                  href={m.href}
                  className="flex min-h-11 items-center gap-3 rounded-[10px] border border-line-soft bg-surface-soft px-3 py-2 text-[13px] font-semibold text-text no-underline hover:border-line hover:text-text"
                >
                  <span className="text-gold-text">
                    <Icon name={m.icon} />
                  </span>
                  <span className="flex-1">{t(`nav.modules.${m.key}`)}</span>
                  <span className="rounded-full bg-neu-bg px-2 py-0.5 text-[11px] font-semibold text-neu">
                    F{m.phase}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
