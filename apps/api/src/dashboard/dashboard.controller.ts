import { Controller, Get, type MessageEvent, Sse } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type PermissionModule } from "@atelier/shared";
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
    const [stock, formulasInReview, pendingTaxRules, pendingApprovals, outbox] = await Promise.all([
      can("stock") ? stockSummary(this.prisma) : null,
      can("production") ? this.prisma.formula.count({ where: { status: "IN_REVIEW" } }) : null,
      can("tax") ? this.prisma.taxRule.count({ where: { approvedAt: null } }) : null,
      can("admin") ? this.prisma.approvalRequest.count({ where: { status: "PENDING" } }) : null,
      can("admin") ? this.prisma.outboxEvent.groupBy({ by: ["status"], _count: { _all: true } }) : null,
    ]);
    return {
      stock: stock && {
        criticalItems: stock.criticalItems,
        expiringLots: stock.expiringLots,
        expiryWarningDays: stock.expiryWarningDays,
        stockValue: stock.stockValue,
      },
      production: formulasInReview === null ? null : { formulasInReview },
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
}
