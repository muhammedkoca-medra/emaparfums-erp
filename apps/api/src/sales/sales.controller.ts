import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { resolveTaxRule } from "@atelier/db";
import { fromGross } from "@atelier/shared";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Satış raporu ve ücretlendirme görünümleri (F2 hazırlığı, salt okunur).
 *  - Satış özeti: sipariş sayısı, ciro, ortalama sepet, duruma göre dağılım.
 *  - Ücretlendirme: ürün fiyatı + vergi anatomisi (oran TaxRule'dan, hesap packages/shared/src/tax.ts).
 */
@ApiTags("sales")
@Controller()
export class SalesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("sales/analytics/summary")
  @RequirePermission("sales", "VIEW")
  async summary() {
    const [agg, byStatusRaw, recent, customers] = await Promise.all([
      this.prisma.salesOrder.aggregate({ _count: { _all: true }, _sum: { grandTotal: true } }),
      this.prisma.salesOrder.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.salesOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, number: true, status: true, grandTotal: true, createdAt: true, customer: { select: { fullName: true } } },
      }),
      this.prisma.customer.count(),
    ]);
    const orders = agg._count._all;
    const revenue = agg._sum.grandTotal?.toString() ?? "0";
    return {
      orders,
      revenue,
      avg: orders > 0 && agg._sum.grandTotal ? agg._sum.grandTotal.div(orders).toFixed(2) : "0",
      customers,
      byStatus: byStatusRaw.map((s) => ({ status: s.status, count: s._count._all })),
      recent: recent.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        grandTotal: o.grandTotal.toString(),
        createdAt: o.createdAt.toISOString(),
        customer: o.customer.fullName,
      })),
    };
  }

  @Get("pricing/overview")
  @RequirePermission("sales", "VIEW")
  async pricing() {
    const products = await this.prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        sku: true,
        name: true,
        taxCategory: true,
        prices: {
          where: { validFrom: { lte: new Date() } },
          orderBy: { validFrom: "desc" },
          take: 1,
          select: { price: true, priceList: { select: { currency: true, pricesIncludeTax: true } } },
        },
      },
    });
    const ruleCache = new Map<string, { otvRate: string; kdvRate: string } | null>();
    const resolve = async (category: string) => {
      if (!ruleCache.has(category)) {
        const rule = await resolveTaxRule(this.prisma, category);
        ruleCache.set(category, rule ? { otvRate: rule.otvRate.toString(), kdvRate: rule.kdvRate.toString() } : null);
      }
      return ruleCache.get(category)!;
    };
    const rows = [];
    for (const p of products) {
      const priceRow = p.prices[0];
      let breakdown: { net: string; otv: string; kdv: string } | null = null;
      let price: string | null = null;
      let currency = "TRY";
      if (priceRow) {
        price = priceRow.price.toString();
        currency = priceRow.priceList.currency;
        const rates = await resolve(p.taxCategory);
        if (rates && priceRow.priceList.pricesIncludeTax) {
          const b = fromGross(price, rates);
          breakdown = { net: b.net.toFixed(2), otv: b.otv.toFixed(2), kdv: b.kdv.toFixed(2) };
        }
      }
      rows.push({ id: p.id, sku: p.sku, name: p.name, taxCategory: p.taxCategory, price, currency, breakdown });
    }
    return rows;
  }
}
