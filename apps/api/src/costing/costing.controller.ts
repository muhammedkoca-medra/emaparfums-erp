import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { getSetting, setSetting } from "@atelier/db";
import { costVariance, productionHours, simulateUnitCost } from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Maliyet (F4-01/02 · docs/03-moduller/maliyet.md). Parti kapanışında gerçek maliyet BatchCost'a
 * yazılır (üretim modülü); burada kırılım, sapma (MLY-04), parametreler ve "Ne olursa?" senaryosu (MLY-05).
 */
@ApiTags("costing")
@Controller("costing")
export class CostingController {
  constructor(private readonly prisma: PrismaService) {}

  /** Parti maliyet kırılımı: bileşen bazında standart/gerçek/sapma. */
  @Get("batches/:id")
  @RequirePermission("costing", "VIEW")
  async batch(@Param("id") id: string) {
    const batch = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: { costs: true, stageLogs: { select: { startedAt: true, endedAt: true } }, product: { select: { name: true, sku: true } } },
    });
    if (!batch) throw new NotFoundException({ message: "Parti bulunamadı" });
    const warnPct = await getSetting(this.prisma, "costing.varianceWarnPct");
    const rows = costVariance(
      batch.costs.map((c) => ({ component: c.component, standard: c.standard.toString(), actual: c.actual.toString() })),
      warnPct,
    );
    const totalActual = batch.costs.reduce((s, c) => s + Number(c.actual), 0);
    return {
      id: batch.id,
      number: batch.number,
      product: { name: batch.product.name, sku: batch.product.sku },
      producedQty: batch.producedQty,
      hours: productionHours(batch.stageLogs),
      unitCost: totalActual.toFixed(4),
      components: rows,
    };
  }

  /** Ürün kârlılığı özeti (MLY-06 için temel; ortalama net satış siparişlerden). */
  @Get("products")
  @RequirePermission("costing", "VIEW")
  async products(@Query("limit") limit?: string) {
    const take = Math.min(Number(limit) || 50, 200);
    const products = await this.prisma.product.findMany({ where: { status: { not: "DRAFT" } }, take, select: { id: true, sku: true, name: true } });
    // Son üretim partisinin birim maliyeti (varsa)
    const out = [];
    for (const p of products) {
      const batch = await this.prisma.productionBatch.findFirst({ where: { productId: p.id, producedQty: { gt: 0 } }, orderBy: { createdAt: "desc" }, include: { costs: true } });
      const unitCost = batch ? batch.costs.reduce((s, c) => s + Number(c.actual), 0) : null;
      out.push({ id: p.id, sku: p.sku, name: p.name, unitCost: unitCost != null ? unitCost.toFixed(4) : null });
    }
    return out;
  }

  /** Maliyet parametreleri (işçilik, genel gider, sapma eşiği). */
  @Get("parameters")
  @RequirePermission("costing", "VIEW")
  async parameters() {
    return {
      laborRatePerHour: await getSetting(this.prisma, "costing.laborRatePerHour"),
      overheadRatePerHour: await getSetting(this.prisma, "costing.overheadRatePerHour"),
      varianceWarnPct: await getSetting(this.prisma, "costing.varianceWarnPct"),
    };
  }

  @Put("parameters")
  @RequirePermission("costing", "EDIT")
  async setParameters(@Body() body: { laborRatePerHour?: string; overheadRatePerHour?: string; varianceWarnPct?: number }, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      if (body.laborRatePerHour !== undefined) {
        if (!/^\d+(\.\d{1,2})?$/.test(body.laborRatePerHour)) throw new BadRequestException({ message: "İşçilik ücreti geçersiz" });
        await setSetting(tx, "costing.laborRatePerHour", body.laborRatePerHour, auth.userId);
      }
      if (body.overheadRatePerHour !== undefined) {
        if (!/^\d+(\.\d{1,2})?$/.test(body.overheadRatePerHour)) throw new BadRequestException({ message: "Genel gider oranı geçersiz" });
        await setSetting(tx, "costing.overheadRatePerHour", body.overheadRatePerHour, auth.userId);
      }
      if (body.varianceWarnPct !== undefined) {
        if (!(body.varianceWarnPct >= 0 && body.varianceWarnPct <= 100)) throw new BadRequestException({ message: "Sapma eşiği 0–100 olmalı" });
        await setSetting(tx, "costing.varianceWarnPct", body.varianceWarnPct, auth.userId);
      }
      void clientInfo(req);
      return { ok: true };
    });
  }

  /** MLY-05: "Ne olursa?" senaryosu. Kaydetmez, stoka dokunmaz. */
  @Post("simulate")
  @RequirePermission("costing", "VIEW")
  async simulate(@Body() body: { baseComponents: { component: string; unit: string }[]; essenceFactor?: number; fxFactor?: number; batchSizeFactor?: number; avgNetSale?: string }) {
    if (!Array.isArray(body.baseComponents) || body.baseComponents.length === 0) throw new BadRequestException({ message: "baseComponents gerekli" });
    return simulateUnitCost(body);
  }
}
