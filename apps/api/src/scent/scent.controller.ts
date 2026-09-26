import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { buildAccordVector, cosineSimilarity, UNMET_DEMAND_MAX_SCORE } from "@atelier/shared";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Koku AI (F5-01/02 · KOK). Akor vektörleri, benzer koku araması ve karşılanmayan talep.
 * Yerelde akor skorlarından kosinüs benzerliği; gerçek embeddings ağa çıkışta (F5-09).
 */
@ApiTags("scent")
@Controller("scent")
export class ScentController {
  constructor(private readonly prisma: PrismaService) {}

  /** KOK-03: bir ürüne en benzer ürünler (akor vektörü kosinüs benzerliği). */
  @Get("products/:id/similar")
  @RequirePermission("scent", "VIEW")
  async similar(@Param("id") id: string, @Query("limit") limit?: string) {
    const take = Math.min(Number(limit) || 5, 20);
    const target = await this.prisma.product.findUnique({ where: { id }, include: { accords: true } });
    if (!target) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const targetVec = buildAccordVector(target.accords.map((a) => ({ accord: a.accord, score: a.score })));
    const others = await this.prisma.product.findMany({ where: { id: { not: id }, status: { not: "DRAFT" } }, include: { accords: true } });
    const scored = others
      .map((p) => ({ id: p.id, sku: p.sku, name: p.name, score: cosineSimilarity(targetVec, buildAccordVector(p.accords.map((a) => ({ accord: a.accord, score: a.score })))) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, take);
    return { productId: id, similar: scored.map((s) => ({ ...s, score: Number(s.score.toFixed(4)) })) };
  }

  /**
   * KOK-03/04: metinle koku araması. Ürün adı/nota/akor eşleşmesi + en iyi benzerlik skoru.
   * Sonuç ScentSearchLog'a yazılır (karşılanmayan talep analizi için).
   */
  @Post("search")
  @RequirePermission("scent", "VIEW")
  async search(@Body() body: { query: string; accords?: { accord: string; score: number }[] }) {
    if (!body.query || typeof body.query !== "string") throw new BadRequestException({ message: "query gerekli" });
    const q = body.query.trim();
    const products = await this.prisma.product.findMany({
      where: {
        status: { not: "DRAFT" },
        OR: [{ name: { contains: q, mode: "insensitive" } }, { notes: { some: { note: { name: { contains: q, mode: "insensitive" } } } } }, { accords: { some: { accord: { contains: q, mode: "insensitive" } } } }],
      },
      include: { accords: true },
      take: 20,
    });
    let topScore: number | null = null;
    let ranked = products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, score: 1 }));
    if (body.accords?.length) {
      const wanted = buildAccordVector(body.accords);
      ranked = products
        .map((p) => ({ id: p.id, sku: p.sku, name: p.name, score: Number(cosineSimilarity(wanted, buildAccordVector(p.accords.map((a) => ({ accord: a.accord, score: a.score })))).toFixed(4)) }))
        .sort((a, b) => b.score - a.score);
      topScore = ranked.length ? ranked[0]!.score : 0;
    } else {
      topScore = products.length ? 1 : 0;
    }
    await this.prisma.scentSearchLog.create({ data: { query: q, resultCount: products.length, topScore: topScore != null ? topScore.toFixed(4) : null } });
    return { query: q, resultCount: products.length, topScore, results: ranked.slice(0, 10) };
  }

  /** KOK-07: karşılanmayan talep — düşük skorlu/sonuçsuz aramalar, sıklığa göre. */
  @Get("unmet-demand")
  @RequirePermission("scent", "VIEW")
  async unmetDemand() {
    const logs = await this.prisma.scentSearchLog.findMany({ where: { OR: [{ resultCount: 0 }, { topScore: { lt: UNMET_DEMAND_MAX_SCORE.toFixed(4) } }] }, orderBy: { createdAt: "desc" }, take: 500 });
    const byQuery = new Map<string, { query: string; count: number; avgTopScore: number }>();
    for (const l of logs) {
      const key = l.query.toLocaleLowerCase("tr");
      const row = byQuery.get(key) ?? { query: l.query, count: 0, avgTopScore: 0 };
      row.avgTopScore = (row.avgTopScore * row.count + Number(l.topScore ?? 0)) / (row.count + 1);
      row.count += 1;
      byQuery.set(key, row);
    }
    return [...byQuery.values()].sort((a, b) => b.count - a.count).map((r) => ({ ...r, avgTopScore: Number(r.avgTopScore.toFixed(4)) }));
  }
}
