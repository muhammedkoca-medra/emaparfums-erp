import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, Prisma, resolveTaxRule, writeAudit } from "@atelier/db";
import {
  canTransition,
  CHANNEL_PREFIX,
  lineFromGrossUnit,
  type OrderCreateRequest,
  orderCreateSchema,
  type OrderQuery,
  orderQuerySchema,
  type OrderStatus,
  type OrderTransitionRequest,
  orderTransitionSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Satış siparişleri (F2-02 · docs/03-moduller/satis.md).
 *  - SAL-01: numara kanal önekiyle üretilir.
 *  - SAL-02: satır oluşurken TaxRule (ürünün taxCategory'si + sipariş tarihi) okunur, oranlar satıra
 *    kopyalanır; tutarlar packages/shared/src/tax.ts (lineFromGrossUnit) ile hesaplanır.
 *  - SAL-03: DRAFT/SALES_LOCKED ürün siparişe eklenemez.
 *  - SAL-06/07: durum makinesi; iptal SHIPPED'den önce.
 */
@ApiTags("sales")
@Controller("sales")
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("channels")
  @RequirePermission("sales", "VIEW")
  async channels() {
    return this.prisma.salesChannel.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, type: true },
    });
  }

  @Get("orders")
  @RequirePermission("sales", "VIEW")
  @ApiZodQuery(orderQuerySchema)
  async list(@Query(new ZodPipe(orderQuerySchema)) q: OrderQuery) {
    const orders = await this.prisma.salesOrder.findMany({
      where: {
        status: q.status,
        channel: q.channel ? { code: q.channel } : undefined,
        ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" } }, { customer: { fullName: { contains: q.q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        status: true,
        grandTotal: true,
        currency: true,
        createdAt: true,
        channel: { select: { code: true, name: true } },
        customer: { select: { id: true, fullName: true } },
        _count: { select: { lines: true } },
      },
    });
    return orders.map((o) => ({ ...o, grandTotal: o.grandTotal.toFixed(2), lineCount: o._count.lines }));
  }

  @Get("orders/:id")
  @RequirePermission("sales", "VIEW")
  async get(@Param("id") id: string) {
    const o = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        channel: { select: { code: true, name: true } },
        customer: { select: { id: true, fullName: true } },
        lines: { include: { product: { select: { id: true, sku: true, name: true } } } },
      },
    });
    if (!o) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    const money = (d: Prisma.Decimal) => d.toFixed(2);
    const rate = (d: Prisma.Decimal) => d.toString();
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      currency: o.currency,
      paymentTermsDays: o.paymentTermsDays,
      createdAt: o.createdAt.toISOString(),
      channel: o.channel,
      customer: o.customer,
      netTotal: money(o.netTotal),
      otvTotal: money(o.otvTotal),
      kdvTotal: money(o.kdvTotal),
      grandTotal: money(o.grandTotal),
      lines: o.lines.map((l) => ({
        id: l.id,
        product: l.product,
        qty: l.qty,
        unitPriceGross: money(l.unitPriceGross),
        discount: money(l.discount),
        otvRate: rate(l.otvRate),
        kdvRate: rate(l.kdvRate),
        netAmount: money(l.netAmount),
        otvAmount: money(l.otvAmount),
        kdvAmount: money(l.kdvAmount),
      })),
    };
  }

  @Post("orders")
  @RequirePermission("sales", "CREATE")
  @ApiZodBody(orderCreateSchema)
  async create(@Body(new ZodPipe(orderCreateSchema)) body: OrderCreateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const channel = await this.prisma.salesChannel.findUnique({ where: { id: body.channelId } });
    if (!channel) throw new NotFoundException({ message: "Satış kanalı bulunamadı" });
    const customer = await this.prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException({ message: "Müşteri bulunamadı" });

    const products = await this.prisma.product.findMany({
      where: { id: { in: body.lines.map((l) => l.productId) } },
      select: { id: true, status: true, taxCategory: true, sku: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const now = new Date();

    // Satırları vergi anlık görüntüsüyle hazırla (SAL-02, SAL-03). Tutarlar string olarak taşınır.
    const prepared: {
      productId: string;
      qty: number;
      unitPriceGross: string;
      discount: string;
      otvRate: string;
      kdvRate: string;
      netAmount: string;
      otvAmount: string;
      kdvAmount: string;
    }[] = [];
    for (const line of body.lines) {
      const p = byId.get(line.productId);
      if (!p) throw new BadRequestException({ message: `Ürün bulunamadı: ${line.productId}` });
      if (p.status === "DRAFT" || p.status === "SALES_LOCKED")
        throw new BadRequestException({ message: `Bu ürün siparişe eklenemez (${p.sku}): ${p.status}` });
      const rule = await resolveTaxRule(this.prisma, p.taxCategory, now);
      if (!rule) throw new BadRequestException({ message: `Vergi kuralı yok: ${p.taxCategory}` });
      const rates = { otvRate: rule.otvRate.toString(), kdvRate: rule.kdvRate.toString() };
      const b = lineFromGrossUnit(line.unitPriceGross, line.qty, rates, line.discount ?? 0);
      prepared.push({
        productId: p.id,
        qty: line.qty,
        unitPriceGross: new Prisma.Decimal(line.unitPriceGross).toFixed(2),
        discount: new Prisma.Decimal(line.discount ?? 0).toFixed(2),
        otvRate: rates.otvRate,
        kdvRate: rates.kdvRate,
        netAmount: b.net.toFixed(2),
        otvAmount: b.otv.toFixed(2),
        kdvAmount: b.kdv.toFixed(2),
      });
    }
    const sum = (key: "netAmount" | "otvAmount" | "kdvAmount") => prepared.reduce((a, l) => a.plus(l[key]), new Prisma.Decimal(0));
    const netTotal = sum("netAmount");
    const otvTotal = sum("otvAmount");
    const kdvTotal = sum("kdvAmount");
    const grandTotal = netTotal.plus(otvTotal).plus(kdvTotal);

    const id = await this.prisma.$transaction(async (tx) => {
      const prefix = CHANNEL_PREFIX[channel.code] ?? channel.code.slice(0, 3).toUpperCase();
      const count = await tx.salesOrder.count({ where: { channelId: channel.id } });
      const number = `${prefix}-${String(count + 1).padStart(5, "0")}`;
      const order = await tx.salesOrder.create({
        data: {
          number,
          channelId: channel.id,
          customerId: customer.id,
          status: "NEW",
          currency: "TRY",
          paymentTermsDays: body.paymentTermsDays ?? null,
          netTotal,
          otvTotal,
          kdvTotal,
          grandTotal,
          lines: { create: prepared },
        },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "order.create",
        entity: "SalesOrder",
        entityId: order.id,
        after: { number, channel: channel.code, grandTotal: grandTotal.toString(), lines: prepared.length },
        ...clientInfo(req),
      });
      await emit(tx, { type: "order.created", orderId: order.id, channelCode: channel.code });
      return order.id;
    });
    return { id };
  }

  /** Durum geçişi (SAL-07 durum makinesi). Geçersiz geçiş reddedilir; iptal SHIPPED'den önce (SAL-06). */
  @Post("orders/:id/transition")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(orderTransitionSchema)
  async transition(
    @Param("id") id: string,
    @Body(new ZodPipe(orderTransitionSchema)) body: OrderTransitionRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SalesOrder" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Sipariş bulunamadı" });
      const o = await tx.salesOrder.findUniqueOrThrow({ where: { id } });
      if (!canTransition(o.status as OrderStatus, body.to))
        throw new BadRequestException({ message: `Geçersiz durum geçişi: ${o.status} → ${body.to}` });
      await tx.salesOrder.update({ where: { id }, data: { status: body.to } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "order.transition",
        entity: "SalesOrder",
        entityId: id,
        before: { status: o.status },
        after: { status: body.to, note: body.note ?? null },
        ...clientInfo(req),
      });
      if (body.to === "CONFIRMED") await emit(tx, { type: "order.confirmed", orderId: id });
      if (body.to === "CANCELLED") await emit(tx, { type: "order.cancelled", orderId: id });
      return body.to;
    });
    return { id, status: result };
  }
}
