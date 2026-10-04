import { Controller, Get, type MessageEvent, Param, Query, Sse } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { forecastNextMonth, type PermissionModule, UNMET_DEMAND_MAX_SCORE } from "@atelier/shared";
import { availableForItem, Prisma } from "@atelier/db";
import { concatMap, from, interval, type Observable, startWith } from "rxjs";
import { type AuthContext, CurrentUser } from "../auth/auth-context.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { PrismaService } from "../prisma.service.js";
import { stockSummary } from "../stock/stock-queries.js";

/** Olay türü → görmek için gereken modül izni (PNL-01). */
const EVENT_MODULE: Record<string, PermissionModule> = {
  stock: "stock",
  lot: "quality",
  product: "sales",
  price: "sales",
  tax_rule: "tax",
  order: "sales",
  payment: "payments",
  invoice: "invoicing",
  shipment: "shipping",
  batch: "production",
  requisition: "purchasing",
  po: "purchasing",
  compliance: "quality",
  system: "admin",
};

const moduleOf = (type: string) => EVENT_MODULE[type.split(".")[0]!] ?? "admin";

interface FeedItem {
  id: string;
  type: string;
  module: PermissionModule;
  payload: unknown;
  label: string | null;
  createdAt: string;
}

/** Kontrol paneli (F1-10 · docs/03-moduller/kontrol-paneli.md). */
@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /** Yalnızca kullanıcının VIEW izni olan modüllerin kartları döner (PNL-01). */
  @Get("summary")
  @RequirePermission("dashboard", "VIEW")
  async summary(@CurrentUser() auth: AuthContext) {
    const perms = await this.permissions.forUser(auth.userId);
    const can = (m: PermissionModule) => perms.has(`${m}:VIEW`);
    const [stock, formulasInReview, pendingTaxRules, pendingApprovals, outbox, sales] = await Promise.all([
      can("stock") ? stockSummary(this.prisma) : null,
      can("production") ? this.prisma.formula.count({ where: { status: "IN_REVIEW" } }) : null,
      can("tax") ? this.prisma.taxRule.count({ where: { approvedAt: null } }) : null,
      can("admin") ? this.prisma.approvalRequest.count({ where: { status: "PENDING" } }) : null,
      can("admin") ? this.prisma.outboxEvent.groupBy({ by: ["status"], _count: { _all: true } }) : null,
      can("sales") ? this.salesSummary() : null,
    ]);
    return {
      stock: stock && {
        criticalItems: stock.criticalItems,
        expiringLots: stock.expiringLots,
        expiryWarningDays: stock.expiryWarningDays,
        stockValue: stock.stockValue,
      },
      production: formulasInReview === null ? null : { formulasInReview },
      sales,
      tax: pendingTaxRules === null ? null : { pendingRules: pendingTaxRules },
      admin:
        pendingApprovals === null
          ? null
          : {
              pendingApprovals,
              outbox: Object.fromEntries((outbox ?? []).map((o) => [o.status, o._count._all])),
            },
    };
  }

  /**
   * Satış operasyon sayaçları: açık sipariş, stok bekleyen (satırı tam ayrılmamış) sipariş ve iptal/iade
   * sonrası onay bekleyen para işlemi olan sipariş (tahsil edilmiş ödeme ya da iptal edilmemiş fatura).
   */
  private async salesSummary() {
    const open = ["CONFIRMED", "IN_PRODUCTION", "PICKING"];
    const [openOrders, waiting, cancellationsPending] = await Promise.all([
      this.prisma.salesOrder.count({ where: { status: { in: open as never[] } } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT o.id) AS n
        FROM "SalesOrder" o
        JOIN "SalesOrderLine" l ON l."orderId" = o.id
        LEFT JOIN (
          SELECT "orderLineId", SUM(qty) AS s FROM "StockReservation" WHERE "releasedAt" IS NULL GROUP BY 1
        ) r ON r."orderLineId" = l.id
        WHERE o.status::text IN ('CONFIRMED', 'IN_PRODUCTION', 'PICKING') AND l.qty > COALESCE(r.s, 0)`,
      this.prisma.salesOrder.count({
        where: {
          status: { in: ["CANCELLED", "RETURNED"] },
          OR: [{ payments: { some: { status: "CAPTURED" } } }, { invoices: { some: { status: { not: "CANCELLED" }, type: { not: "RETURN" } } } }],
        },
      }),
    ]);
    return { openOrders, awaitingStock: Number(waiting[0]?.n ?? 0), cancellationsPending };
  }

  /**
   * Canlı akış (PNL-02, SSE): son olaylar, ardından her 2 sn'de yenileri. Kullanıcı yalnızca izinli
   * modüllerin olaylarını görür. Kişisel veri içermez (olay yükleri yalnızca kimlik taşır).
   */
  @Sse("feed")
  @RequirePermission("dashboard", "VIEW")
  feed(@CurrentUser() auth: AuthContext): Observable<MessageEvent> {
    let cursor: { createdAt: Date; id: string } | null = null;
    let perms: Set<string> | null = null;
    const poll = async (): Promise<MessageEvent[]> => {
      perms ??= await this.permissions.forUser(auth.userId);
      const rows = await this.prisma.outboxEvent.findMany({
        where: cursor
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {},
        orderBy: cursor ? [{ createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
        take: cursor ? 100 : 15,
      });
      const ordered = cursor ? rows : rows.reverse();
      const last = ordered.at(-1);
      if (last) cursor = { createdAt: last.createdAt, id: last.id };
      else cursor ??= { createdAt: new Date(0), id: "" };
      const visible = ordered.filter((r) => perms!.has(`${moduleOf(r.type)}:VIEW`));
      const items = await this.labels(visible);
      return items.map((data) => ({ id: data.id, type: "event", data }));
    };
    return interval(2000).pipe(
      startWith(-1),
      concatMap(() => from(poll())),
      concatMap((events) => from(events)),
    );
  }

  /** Olayı okunur kılmak için ilgili kaydın kısa etiketi (kalem kodu, lot no vb.). */
  private async labels(
    rows: { id: string; type: string; payload: unknown; createdAt: Date }[],
  ): Promise<FeedItem[]> {
    const ids = (key: string) => [
      ...new Set(
        rows
          .map((r) => (r.payload as Record<string, unknown>)[key])
          .filter((v): v is string => typeof v === "string"),
      ),
    ];
    const [items, lots, products, rules] = await Promise.all([
      this.prisma.item.findMany({
        where: { id: { in: ids("itemId") } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.lot.findMany({
        where: { id: { in: ids("lotId") } },
        select: { id: true, lotNo: true, item: { select: { code: true } } },
      }),
      this.prisma.product.findMany({
        where: { id: { in: ids("productId") } },
        select: { id: true, name: true },
      }),
      this.prisma.taxRule.findMany({
        where: { id: { in: ids("taxRuleId") } },
        select: { id: true, category: true },
      }),
    ]);
    const im = new Map(items.map((i) => [i.id, `${i.code} · ${i.name}`]));
    const lm = new Map(lots.map((l) => [l.id, `${l.item.code} · ${l.lotNo}`]));
    const pm = new Map(products.map((p) => [p.id, p.name]));
    const tm = new Map(rules.map((t) => [t.id, t.category]));
    return rows.map((r) => {
      const p = r.payload as Record<string, string>;
      const label =
        (p.itemId && im.get(p.itemId)) ||
        (p.lotId && lm.get(p.lotId)) ||
        (p.productId && pm.get(p.productId)) ||
        (p.taxRuleId && tm.get(p.taxRuleId)) ||
        null;
      return {
        id: r.id,
        type: r.type,
        module: moduleOf(r.type),
        payload: r.payload,
        label,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /** PNL-04: bir ürünün son 6 ayki satışından sonraki ay talep tahmini. */
  @Get("forecast/:productId")
  @RequirePermission("dashboard", "VIEW")
  async forecast(@Param("productId") productId: string) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 6, 1);
    since.setUTCHours(0, 0, 0, 0);
    const lines = await this.prisma.salesOrderLine.findMany({
      where: { productId, order: { status: { notIn: ["NEW", "CANCELLED", "PAYMENT_PENDING"] }, createdAt: { gte: since } } },
      select: { qty: true, order: { select: { createdAt: true } } },
    });
    const byMonth = new Map<string, number>();
    for (const l of lines) {
      const d = l.order.createdAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + l.qty);
    }
    const months = [...byMonth.keys()].sort();
    const series = months.map((m) => byMonth.get(m)!);
    return { productId, months, series, ...forecastNextMonth(series) };
  }

  /** PNL-03: kural tabanlı AI önerileri (düşük stok, karşılanmayan talep, yüksek ayrılma riski). */
  @Get("ai-suggestions")
  @RequirePermission("dashboard", "VIEW")
  async aiSuggestions(@Query("limit") limit?: string) {
    const take = Math.min(Number(limit) || 10, 30);
    const suggestions: { type: string; title: string; detail: string; priority: "high" | "medium" | "low" }[] = [];

    // 1) Min stok altı kalemler → üretim/satın alma.
    const items = await this.prisma.item.findMany({ where: { minStock: { not: null } }, select: { id: true, code: true, name: true, minStock: true, type: true } });
    for (const it of items) {
      const available = await availableForItem(this.prisma, it.id);
      if (it.minStock && available.lessThan(it.minStock)) {
        suggestions.push({
          type: it.type === "FINISHED_GOOD" ? "PRODUCE" : "PURCHASE",
          title: `${it.code} stok min altında`,
          detail: `${it.name}: kullanılabilir ${available.toString()} < min ${it.minStock.toString()}. ${it.type === "FINISHED_GOOD" ? "Üretim önerilir." : "Satın alma önerilir."}`,
          priority: "high",
        });
      }
    }

    // 2) Karşılanmayan talep → yeni koku değerlendirme.
    const unmet = await this.prisma.scentSearchLog.groupBy({ by: ["query"], where: { OR: [{ resultCount: 0 }, { topScore: { lt: UNMET_DEMAND_MAX_SCORE.toFixed(4) } }] }, _count: { query: true }, orderBy: { _count: { query: "desc" } }, take: 5 });
    for (const u of unmet) {
      suggestions.push({ type: "NEW_SCENT", title: `Karşılanmayan talep: "${u.query}"`, detail: `${u._count.query} arama sonuçsuz/zayıf eşleşti. Yeni koku/ürün değerlendirin.`, priority: "medium" });
    }

    // 3) Yüksek ayrılma riski → elde tutma.
    const risky = await this.prisma.subscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, churnRisk: { gte: new Prisma.Decimal(0.6) } }, include: { customer: { select: { fullName: true } } }, take: 5 });
    for (const r of risky) {
      suggestions.push({ type: "RETENTION", title: `Yüksek ayrılma riski: ${r.customer.fullName}`, detail: `Risk ${r.churnRisk?.toString()}. Elde tutma teklifi/iletişim önerilir.`, priority: "high" });
    }

    return suggestions.slice(0, take);
  }
}
