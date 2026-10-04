import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { channelStockQty, emit, resolveTaxRule, type Tx, writeAudit } from "@atelier/db";
import { CHANNEL_PREFIX, lineFromGrossUnit, type ListingUpsertRequest, listingUpsertSchema, type SyncOrderRequest, syncOrderSchema } from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { IntegrationsService } from "../common/integrations.service.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * E-ticaret / pazaryeri (F2-11/12/13). Mock adaptörle sipariş çekme, stok/fiyat itme, listeleme.
 *  - SAL-01: pazaryeri siparişi (channelId, externalOrderNo) benzersizdir; ikinci kez içeri alınmaz.
 *  - Stok itme: kullanılabilir − kanal tamponu (STK-07, tampon şimdilik sabit 2).
 */
@ApiTags("ecommerce")
@Controller("ecommerce")
export class EcommerceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get("channels")
  @RequirePermission("ecommerce", "VIEW")
  async channels() {
    const rows = await this.prisma.salesChannel.findMany({
      where: { type: "MARKETPLACE" },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, _count: { select: { listings: true, orders: true } } },
    });
    return rows.map((c) => ({ id: c.id, code: c.code, name: c.name, listings: c._count.listings, orders: c._count.orders }));
  }

  @Get("listings")
  @RequirePermission("ecommerce", "VIEW")
  async listings(@Query("channel") channel?: string) {
    const rows = await this.prisma.channelListing.findMany({
      where: channel ? { channel: { code: channel } } : {},
      orderBy: { lastSyncAt: "desc" },
      take: 200,
      include: { product: { select: { sku: true, name: true } }, channel: { select: { code: true, name: true } } },
    });
    return rows.map((l) => ({
      id: l.id,
      status: l.status,
      externalId: l.externalId,
      priceSynced: l.priceSynced,
      stockSynced: l.stockSynced,
      contentScore: l.contentScore,
      product: l.product,
      channel: l.channel,
      lastSyncAt: l.lastSyncAt?.toISOString() ?? null,
    }));
  }

  @Post("listings")
  @RequirePermission("ecommerce", "CREATE")
  @ApiZodBody(listingUpsertSchema)
  async upsertListing(@Body(new ZodPipe(listingUpsertSchema)) body: ListingUpsertRequest) {
    const channel = await this.prisma.salesChannel.findUnique({ where: { id: body.channelId } });
    if (!channel || channel.type !== "MARKETPLACE") throw new BadRequestException({ message: "Geçerli bir pazaryeri kanalı seçin" });
    const product = await this.prisma.product.findUnique({ where: { id: body.productId }, select: { id: true, sku: true, status: true } });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    if (product.status !== "ACTIVE") throw new BadRequestException({ message: "Yalnızca yayında ürün listelenir" });
    const { adapter, ctx } = await this.integrations.marketplace(channel.code);
    const res = await adapter.upsertListing(ctx, { sku: product.sku });
    const listing = await this.prisma.channelListing.upsert({
      where: { productId_channelId: { productId: product.id, channelId: channel.id } },
      update: { externalId: res.externalId, status: "ACTIVE", lastSyncAt: new Date(), contentScore: 80 },
      create: { productId: product.id, channelId: channel.id, externalId: res.externalId, status: "ACTIVE", lastSyncAt: new Date(), contentScore: 80 },
    });
    return { id: listing.id, externalId: res.externalId, status: "ACTIVE" };
  }

  /** Pazaryeri siparişini içeri alır (SAL-01 dedup). Yerelde tek sipariş sentezlenir. */
  @Post("channels/:code/sync-orders")
  @RequirePermission("ecommerce", "EDIT")
  @ApiZodBody(syncOrderSchema)
  async syncOrders(@Param("code") code: string, @Body(new ZodPipe(syncOrderSchema)) body: SyncOrderRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const channel = await this.prisma.salesChannel.findUnique({ where: { code } });
    if (!channel || channel.type !== "MARKETPLACE") throw new NotFoundException({ message: "Pazaryeri kanalı bulunamadı" });
    const { adapter, ctx } = await this.integrations.marketplace(channel.code);
    await adapter.pullOrders(ctx, new Date(0)); // mock: loglar

    const existing = await this.prisma.salesOrder.findFirst({ where: { channelId: channel.id, externalOrderNo: body.externalOrderNo } });
    if (existing) return { created: false, orderId: existing.id, number: existing.number };

    const product = await this.prisma.product.findUnique({ where: { sku: body.sku }, select: { id: true, taxCategory: true, status: true } });
    if (!product) throw new BadRequestException({ message: `Ürün bulunamadı: ${body.sku}` });
    const rule = await resolveTaxRule(this.prisma, product.taxCategory, new Date());
    if (!rule) throw new BadRequestException({ message: `Vergi kuralı yok: ${product.taxCategory}` });
    const b = lineFromGrossUnit(body.unitPriceGross, body.qty, { otvRate: rule.otvRate.toString(), kdvRate: rule.kdvRate.toString() });

    const orderId = await this.prisma.$transaction(async (tx) => {
      // Pazaryeri kanalına özel sözde müşteri (kanal içi kimlik ayrı tutulur).
      const name = `${channel.name} Müşterisi`;
      const customer = (await tx.customer.findFirst({ where: { fullName: name } })) ?? (await tx.customer.create({ data: { type: "INDIVIDUAL", fullName: name } }));
      const prefix = CHANNEL_PREFIX[channel.code] ?? channel.code.slice(0, 3).toUpperCase();
      const count = await tx.salesOrder.count({ where: { channelId: channel.id } });
      const number = `${prefix}-${String(count + 1).padStart(5, "0")}`;
      const order = await tx.salesOrder.create({
        data: {
          number,
          channelId: channel.id,
          customerId: customer.id,
          externalOrderNo: body.externalOrderNo,
          status: "CONFIRMED", // pazaryeri siparişi ödenmiş gelir
          currency: "TRY",
          netTotal: b.net,
          otvTotal: b.otv,
          kdvTotal: b.kdv,
          grandTotal: b.gross,
          lines: {
            create: [{ productId: product.id, qty: body.qty, unitPriceGross: body.unitPriceGross, discount: "0", otvRate: rule.otvRate, kdvRate: rule.kdvRate, netAmount: b.net, otvAmount: b.otv, kdvAmount: b.kdv }],
          },
        },
      });
      await emit(tx, { type: "order.created", orderId: order.id, channelCode: channel.code });
      await emit(tx, { type: "order.confirmed", orderId: order.id });
      await writeAudit(tx, { userId: auth.userId, action: "marketplace.order_pulled", entity: "SalesOrder", entityId: order.id, after: { channel: channel.code, externalOrderNo: body.externalOrderNo, number }, ...clientInfo(req) });
      return order.id;
    });
    return { created: true, orderId };
  }

  /** Stok itme: serbest stok − kanal tamponu (STK-07, channelStockQty). Satışta olmayan ürün 0 gider. */
  @Post("channels/:code/push-stock")
  @RequirePermission("ecommerce", "EDIT")
  async pushStock(@Param("code") code: string) {
    const channel = await this.prisma.salesChannel.findUnique({ where: { code } });
    if (!channel || channel.type !== "MARKETPLACE") throw new NotFoundException({ message: "Pazaryeri kanalı bulunamadı" });
    const listings = await this.prisma.channelListing.findMany({ where: { channelId: channel.id, status: "ACTIVE" }, include: { product: { select: { id: true, sku: true, itemId: true, status: true } } } });
    const items: { sku: string; qty: number }[] = [];
    for (const l of listings) {
      items.push({ sku: l.product.sku, qty: await channelStockQty(this.prisma as unknown as Tx, l.product.itemId, l.product.status === "ACTIVE") });
    }
    const { adapter, ctx } = await this.integrations.marketplace(channel.code);
    await adapter.pushStock(ctx, items);
    await this.prisma.channelListing.updateMany({ where: { channelId: channel.id, status: "ACTIVE" }, data: { stockSynced: true, lastSyncAt: new Date() } });
    return { pushed: items.length, items };
  }
}

