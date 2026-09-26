import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, resolveTaxRule, taxRuleState, writeAudit } from "@atelier/db";
import {
  fromGross,
  type TaxPreviewQuery,
  taxPreviewQuerySchema,
  type TaxRuleCreateRequest,
  taxRuleCreateSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

const view = (r: {
  id: string;
  category: string;
  gtipPrefix: string | null;
  kdvRate: { toString(): string };
  otvRate: { toString(): string };
  otvList: string | null;
  note: string | null;
  validFrom: Date;
  validTo: Date | null;
  approvedAt: Date | null;
  approvedById: string | null;
}) => ({
  ...r,
  kdvRate: r.kdvRate.toString(),
  otvRate: r.otvRate.toString(),
  state: taxRuleState(r),
});

/**
 * Vergi kuralları (F1-08 · docs/03-moduller/vergi.md).
 *  - VRG-02: kurallar tarihlidir; yeni oran validFrom ile taslak girilir (tax:EDIT) ve tax:APPROVE ile
 *    yayına alınır. Yayında aynı kategorideki önceki kuralın validTo'su kapanır. Eski belgeler
 *    kendi satırlarındaki oranı korur (vergi anlık görüntüsü).
 *  - VRG-03: kural yayına alınınca tax_rule.changed yayınlanır.
 *  - Kural değişiklikleri AuditLog yazar (kural 7).
 */
@ApiTags("tax")
@Controller("tax")
export class TaxController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("rules")
  @RequirePermission("tax", "VIEW")
  async rules() {
    const rows = await this.prisma.taxRule.findMany({
      orderBy: [{ category: "asc" }, { validFrom: "desc" }],
    });
    return rows.map(view);
  }

  @Post("rules")
  @RequirePermission("tax", "EDIT")
  @ApiZodBody(taxRuleCreateSchema)
  async create(
    @Body(new ZodPipe(taxRuleCreateSchema)) body: TaxRuleCreateRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.taxRule.findFirst({
        where: { category: body.category, validFrom: body.validFrom },
      });
      if (dup)
        throw new ConflictException({ message: "Bu kategori için aynı başlangıç tarihli bir kural var" });
      const rule = await tx.taxRule.create({
        data: {
          category: body.category,
          gtipPrefix: body.gtipPrefix ?? null,
          kdvRate: body.kdvRate,
          otvRate: body.otvRate,
          otvList: body.otvList ?? null,
          note: body.note ?? null,
          validFrom: body.validFrom,
        },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "tax_rule.create",
        entity: "TaxRule",
        entityId: rule.id,
        after: view(rule),
        ...clientInfo(req),
      });
      return view(rule);
    });
  }

  @Post("rules/:id/approve")
  @RequirePermission("tax", "APPROVE")
  @HttpCode(200)
  async approve(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "TaxRule" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Vergi kuralı bulunamadı" });
      const rule = await tx.taxRule.findUniqueOrThrow({ where: { id } });
      if (rule.approvedAt) throw new ConflictException({ message: "Kural zaten yayında" });
      // Önceki yayındaki kuralın geçerliliği yeni kuralın başlangıcında biter
      const previous = await tx.taxRule.findMany({
        where: {
          category: rule.category,
          approvedAt: { not: null },
          validFrom: { lt: rule.validFrom },
          OR: [{ validTo: null }, { validTo: { gt: rule.validFrom } }],
        },
      });
      for (const p of previous) {
        await tx.taxRule.update({ where: { id: p.id }, data: { validTo: rule.validFrom } });
        await writeAudit(tx, {
          userId: auth.userId,
          action: "tax_rule.close",
          entity: "TaxRule",
          entityId: p.id,
          before: { validTo: p.validTo },
          after: { validTo: rule.validFrom, replacedBy: id },
          ...clientInfo(req),
        });
      }
      const approved = await tx.taxRule.update({
        where: { id },
        data: { approvedAt: new Date(), approvedById: auth.userId },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "tax_rule.approve",
        entity: "TaxRule",
        entityId: id,
        before: view(rule),
        after: view(approved),
        ...clientInfo(req),
      });
      await emit(tx, { type: "tax_rule.changed", taxRuleId: id });
      return view(approved);
    });
  }

  /**
   * Önizleme: kategori + KDV dahil tutar → net, ÖTV, KDV. Oran kurallardan çözülür, hesap
   * packages/shared/src/tax.ts'te yapılır (VRG-01). Fiyat anatomisi (F2-07) bunu kullanır.
   */
  @Get("preview")
  @RequirePermission("tax", "VIEW")
  @ApiZodQuery(taxPreviewQuerySchema)
  async preview(@Query(new ZodPipe(taxPreviewQuerySchema)) q: TaxPreviewQuery) {
    const at = q.date ?? new Date();
    const rule = await resolveTaxRule(this.prisma, q.category, at);
    if (!rule)
      throw new BadRequestException({ message: `Bu tarihte yayında vergi kuralı yok: ${q.category}` });
    const b = fromGross(q.gross, { otvRate: rule.otvRate.toString(), kdvRate: rule.kdvRate.toString() });
    return {
      ruleId: rule.id,
      category: rule.category,
      otvRate: rule.otvRate.toString(),
      kdvRate: rule.kdvRate.toString(),
      net: b.net.toFixed(2),
      otv: b.otv.toFixed(2),
      kdvBase: b.kdvBase.toFixed(2),
      kdv: b.kdv.toFixed(2),
      gross: b.gross.toFixed(2),
      note: rule.note,
    };
  }

  /** Ay aralığı (period=YYYY-MM) → [start, end). */
  private periodRange(period: string): { start: Date; end: Date } {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) throw new BadRequestException({ message: "Dönem biçimi YYYY-MM olmalı" });
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) throw new BadRequestException({ message: "Ay 01–12 olmalı" });
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
  }

  /** VRG-07: aylık vergi özeti; satış (tahsil edilen) ve alış (indirilecek) KDV + kanal karşılaştırması. */
  @Get("summary")
  @RequirePermission("tax", "VIEW")
  async summary(@Query("period") period: string) {
    const { start, end } = this.periodRange(period);
    const inRange = { issueDate: { gte: start, lt: end }, status: { not: "CANCELLED" as const } };
    const [sales, purchase] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { direction: "SALES", ...inRange }, _sum: { kdvTotal: true, otvTotal: true, netTotal: true } }),
      this.prisma.invoice.aggregate({ where: { direction: "PURCHASE", ...inRange }, _sum: { kdvTotal: true, otvTotal: true, netTotal: true } }),
    ]);
    const num = (d: { toString(): string } | null | undefined) => Number(d?.toString() ?? 0);
    const collected = num(sales._sum.kdvTotal);
    const deductible = num(purchase._sum.kdvTotal);
    // Kanal karşılaştırması: dönemdeki onaylı+ siparişler kanala göre.
    const orders = await this.prisma.salesOrder.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { notIn: ["NEW", "CANCELLED", "PAYMENT_PENDING"] } },
      select: { netTotal: true, kdvTotal: true, otvTotal: true, grandTotal: true, channel: { select: { code: true, name: true } } },
    });
    const byChannel = new Map<string, { channel: string; net: number; kdv: number; otv: number; gross: number; count: number }>();
    for (const o of orders) {
      const key = o.channel?.code ?? "—";
      const row = byChannel.get(key) ?? { channel: o.channel?.name ?? "—", net: 0, kdv: 0, otv: 0, gross: 0, count: 0 };
      row.net += num(o.netTotal);
      row.kdv += num(o.kdvTotal);
      row.otv += num(o.otvTotal);
      row.gross += num(o.grandTotal);
      row.count += 1;
      byChannel.set(key, row);
    }
    return {
      period,
      sales: { net: num(sales._sum.netTotal).toFixed(2), kdv: collected.toFixed(2), otv: num(sales._sum.otvTotal).toFixed(2) },
      purchase: { net: num(purchase._sum.netTotal).toFixed(2), kdv: deductible.toFixed(2) },
      netKdvPayable: (collected - deductible).toFixed(2),
      channels: [...byChannel.values()].map((c) => ({ ...c, net: c.net.toFixed(2), kdv: c.kdv.toFixed(2), otv: c.otv.toFixed(2), gross: c.gross.toFixed(2) })),
    };
  }

  /** Aylık özeti CSV olarak dışa aktarır (mali müşavir için; beyanname değildir). */
  @Get("summary/export")
  @RequirePermission("tax", "VIEW")
  async summaryExport(@Query("period") period: string, @Req() req: AuthedRequest) {
    const s = await this.summary(period);
    const res = req.res!;
    const lines = [
      `Donem;${s.period}`,
      `Satis Net;${s.sales.net}`,
      `Satis KDV (tahsil);${s.sales.kdv}`,
      `Satis OTV;${s.sales.otv}`,
      `Alis Net;${s.purchase.net}`,
      `Alis KDV (indirilecek);${s.purchase.kdv}`,
      `Odenecek KDV;${s.netKdvPayable}`,
      "",
      "Kanal;Adet;Net;KDV;OTV;Brut",
      ...s.channels.map((c) => `${c.channel};${c.count};${c.net};${c.kdv};${c.otv};${c.gross}`),
    ].join("\n");
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="vergi-ozet-${period}.csv"`);
    res.end("﻿" + lines);
  }

  /** Vergi takvimi: yaklaşan beyan/ödeme tarihleri. */
  @Get("calendar")
  @RequirePermission("tax", "VIEW")
  async calendar() {
    const rows = await this.prisma.taxCalendarEvent.findMany({ orderBy: { dueDate: "asc" }, take: 50 });
    return rows.map((e) => ({ id: e.id, title: e.title, dueDate: e.dueDate.toISOString().slice(0, 10), period: e.period, status: e.status }));
  }
}
