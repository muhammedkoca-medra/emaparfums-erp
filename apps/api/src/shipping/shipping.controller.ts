import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { emit, Prisma, writeAudit } from "@atelier/db";
import {
  type CargoWebhookPayload,
  cargoWebhookSchema,
  type ShipmentCreateRequest,
  shipmentCreateSchema,
  type ShipmentQuery,
  shipmentQuerySchema,
  type ShipmentStatus,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { IntegrationsService } from "../common/integrations.service.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { Public, RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Kargo/sevkiyat (F2-08 · docs/03-moduller/kargo.md). Mock adaptörle etiket, takip, teslim.
 *  - KRG-02: desi verilmezse varsayılan; maliyet = desi × tarife (mock).
 *  - KRG-03: durum güncellemesi webhook veya /track ile; her olay ShipmentEvent.
 *  - KRG-07: maliyet gönderiye yazılır.
 */
@ApiTags("shipping")
@Controller()
export class ShippingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get("shipping/carriers")
  @RequirePermission("shipping", "VIEW")
  async carriers() {
    return this.prisma.carrier.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
  }

  /** KRG-01: mock performans skorları (fiyat/zamanında teslim/hasar). Gerçek veri Faz 4'te. */
  @Get("shipping/carriers/performance")
  @RequirePermission("shipping", "VIEW")
  async performance() {
    const carriers = await this.prisma.carrier.findMany({ select: { id: true, code: true, name: true } });
    return carriers.map((c, i) => ({ ...c, onTimePct: 92 - i * 3, damagePct: 1 + i, priceIndex: 100 + i * 5, score: 88 - i * 4 }));
  }

  @Get("shipping/shipments")
  @RequirePermission("shipping", "VIEW")
  @ApiZodQuery(shipmentQuerySchema)
  async list(@Query(new ZodPipe(shipmentQuerySchema)) q: ShipmentQuery) {
    const rows = await this.prisma.shipment.findMany({
      where: { status: q.status },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { carrier: { select: { code: true, name: true } }, order: { select: { number: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      trackingNo: s.trackingNo,
      status: s.status,
      cost: s.cost?.toFixed(2) ?? null,
      desi: s.desi?.toString() ?? null,
      carrier: s.carrier,
      order: s.order,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  @Get("shipping/shipments/:id")
  @RequirePermission("shipping", "VIEW")
  async get(@Param("id") id: string) {
    const s = await this.prisma.shipment.findUnique({
      where: { id },
      include: { carrier: { select: { code: true, name: true } }, order: { select: { number: true } }, events: { orderBy: { occurredAt: "asc" } } },
    });
    if (!s) throw new NotFoundException({ message: "Gönderi bulunamadı" });
    return {
      id: s.id,
      trackingNo: s.trackingNo,
      status: s.status,
      cost: s.cost?.toFixed(2) ?? null,
      desi: s.desi?.toString() ?? null,
      isDangerousGoods: s.isDangerousGoods,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      carrier: s.carrier,
      order: s.order,
      events: s.events.map((e) => ({ status: e.status, location: e.location, message: e.message, occurredAt: e.occurredAt.toISOString() })),
    };
  }

  @Post("shipping/shipments")
  @RequirePermission("shipping", "CREATE")
  @ApiZodBody(shipmentCreateSchema)
  async create(@Body(new ZodPipe(shipmentCreateSchema)) body: ShipmentCreateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id: body.orderId }, select: { id: true, number: true } });
    if (!order) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    const carrier = await this.prisma.carrier.findUnique({ where: { id: body.carrierId } });
    if (!carrier) throw new NotFoundException({ message: "Kargo firması bulunamadı" });

    const code = await this.carrierCode(carrier.integrationId);
    const { adapter, ctx } = await this.integrations.cargo(code);
    const desi = new Prisma.Decimal(body.desi ?? "1");
    const cost = desi.mul(35).toFixed(2); // mock tarife: desi başına 35₺

    const shipment = await this.prisma.shipment.create({
      data: { orderId: order.id, carrierId: carrier.id, status: "CREATED", desi, cost, isDangerousGoods: body.isDangerousGoods },
    });
    try {
      const res = await adapter.createShipment(ctx, { shipmentId: shipment.id, order: order.number, desi: desi.toString() });
      await this.prisma.$transaction(async (tx) => {
        await tx.shipment.update({ where: { id: shipment.id }, data: { trackingNo: res.trackingNo, status: "LABEL_PRINTED" } });
        await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: "LABEL_PRINTED", message: "Etiket oluşturuldu", occurredAt: new Date() } });
        await emit(tx, { type: "shipment.created", shipmentId: shipment.id });
        await writeAudit(tx, { userId: auth.userId, action: "shipment.create", entity: "Shipment", entityId: shipment.id, after: { order: order.number, carrier: carrier.code, trackingNo: res.trackingNo, cost }, ...clientInfo(req) });
      });
      return { id: shipment.id, trackingNo: res.trackingNo, status: "LABEL_PRINTED" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "hata";
      throw new BadRequestException({ message: `Gönderi oluşturulamadı: ${msg}` });
    }
  }

  @Post("shipping/shipments/:id/label")
  @RequirePermission("shipping", "VIEW")
  async label(@Param("id") id: string, @Res() res: Response) {
    const s = await this.prisma.shipment.findUnique({ where: { id } });
    if (!s?.trackingNo) throw new NotFoundException({ message: "Etiket için takip no yok" });
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 160]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 90>>stream\nBT /F1 12 Tf 14 130 Td (EMA Parfums Kargo Etiketi) Tj 0 -20 Td (${s.trackingNo}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${s.trackingNo}.pdf"`);
    res.end(Buffer.from(pdf));
  }

  @Post("shipping/shipments/:id/track")
  @RequirePermission("shipping", "EDIT")
  async track(@Param("id") id: string) {
    const s = await this.prisma.shipment.findUnique({ where: { id }, include: { carrier: true } });
    if (!s?.trackingNo) throw new NotFoundException({ message: "Takip no yok" });
    const { adapter, ctx } = await this.integrations.cargo(await this.carrierCode(s.carrier.integrationId));
    const r = await adapter.track(ctx, s.trackingNo);
    await this.applyStatus(id, r.status as ShipmentStatus, "Takip sorgusu", undefined);
    return { id, status: r.status };
  }

  /** KRG-03: taşıyıcı webhook'u — takip no ile durum + olay. */
  @Post("webhooks/cargo/:carrier")
  @Public()
  @ApiZodBody(cargoWebhookSchema)
  async webhook(@Param("carrier") _carrier: string, @Body(new ZodPipe(cargoWebhookSchema)) body: CargoWebhookPayload) {
    const s = await this.prisma.shipment.findFirst({ where: { trackingNo: body.trackingNo } });
    if (!s) return { ok: false };
    await this.applyStatus(s.id, body.status, body.message, body.location);
    return { ok: true, status: body.status };
  }

  /** integrationId → Integration.code (mock için CARGO_YURTICI varsayılan). */
  private async carrierCode(integrationId: string | null): Promise<string> {
    if (!integrationId) return "CARGO_YURTICI";
    const integ = await this.prisma.integration.findUnique({ where: { id: integrationId }, select: { code: true } });
    return integ?.code ?? "CARGO_YURTICI";
  }

  private async applyStatus(id: string, status: ShipmentStatus, message?: string, location?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.shipmentEvent.create({ data: { shipmentId: id, status, message: message ?? null, location: location ?? null, occurredAt: new Date() } });
      await tx.shipment.update({ where: { id }, data: { status, ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}) } });
      await emit(tx, { type: "shipment.status_changed", shipmentId: id, status });
      // Teslim → sipariş DELIVERED (geçerliyse).
      if (status === "DELIVERED") {
        const sh = await tx.shipment.findUniqueOrThrow({ where: { id }, select: { orderId: true } });
        const order = await tx.salesOrder.findUnique({ where: { id: sh.orderId }, select: { status: true } });
        if (order?.status === "SHIPPED") await tx.salesOrder.update({ where: { id: sh.orderId }, data: { status: "DELIVERED" } });
      }
    });
  }
}
