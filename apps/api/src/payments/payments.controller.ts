import { randomUUID } from "node:crypto";
import { BadRequestException, Body, Controller, Get, Headers, Inject, NotFoundException, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, type Tx, writeAudit } from "@atelier/db";
import {
  type CheckoutRequest,
  checkoutSchema,
  type PaymentSimulateRequest,
  paymentSimulateSchema,
  type PaymentWebhookPayload,
  paymentWebhookSchema,
} from "@atelier/shared";
import { paymentWebhookSignature } from "@atelier/shared/node";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Public, RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Ödeme (F2-03 · docs/03-moduller/odeme.md). Yerel sandbox sağlayıcı.
 *  - ODM-01: kart verisi hiçbir uçta kabul edilmez; yalnızca sipariş + taksit alınır.
 *  - ODM-04: webhook imzası (HMAC) doğrulanmadan durum değişmez; işleme externalTxId ile idempotent.
 *  - payment.captured yayınlanınca worker siparişi CONFIRMED yapar (satis.md "Dinler").
 */
@ApiTags("payments")
@Controller()
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Sağlayıcı oturumu başlatır: Payment (PENDING) oluşturur, siparişi PAYMENT_PENDING'e alır. */
  @Post("payments/checkout")
  @RequirePermission("sales", "CREATE")
  @ApiZodBody(checkoutSchema)
  async checkout(@Body(new ZodPipe(checkoutSchema)) body: CheckoutRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id: body.orderId } });
    if (!order) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    if (order.status !== "NEW" && order.status !== "PAYMENT_PENDING")
      throw new BadRequestException({ message: "Bu sipariş için ödeme başlatılamaz" });
    const provider = await this.prisma.paymentProvider.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } });
    if (!provider) throw new BadRequestException({ message: "Aktif ödeme sağlayıcısı yok" });

    const externalTxId = `sbx_${randomUUID()}`;
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId: order.id,
          providerId: provider.id,
          amount: order.grandTotal,
          currency: order.currency,
          installments: body.installments,
          status: "PENDING",
          externalTxId,
        },
      });
      if (order.status === "NEW") await tx.salesOrder.update({ where: { id: order.id }, data: { status: "PAYMENT_PENDING" } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "payment.checkout",
        entity: "Payment",
        entityId: p.id,
        after: { orderNumber: order.number, amount: order.grandTotal.toFixed(2), provider: provider.code, installments: body.installments },
        ...clientInfo(req),
      });
      return p;
    });

    // Gerçek sağlayıcıda hosted/iframe URL döner; sandbox'ta yerel simülasyon sayfası.
    return {
      paymentId: payment.id,
      externalTxId,
      provider: provider.code,
      amount: order.grandTotal.toFixed(2),
      redirectUrl: `/odeme/${payment.id}`,
      status: "PENDING",
    };
  }

  /** Sağlayıcı webhook'u (ODM-04): imza doğrulanır, externalTxId ile idempotent işlenir. */
  @Post("webhooks/payments/:provider")
  @Public()
  @ApiZodBody(paymentWebhookSchema)
  async webhook(
    @Param("provider") _provider: string,
    @Body(new ZodPipe(paymentWebhookSchema)) body: PaymentWebhookPayload,
    @Headers("x-signature") signature: string | undefined,
  ) {
    const expected = paymentWebhookSignature(this.config.PAYMENT_WEBHOOK_SECRET, body);
    if (!signature || signature !== expected) throw new UnauthorizedException({ message: "Geçersiz webhook imzası" });
    const result = await this.prisma.$transaction((tx) => this.apply(tx, body.externalTxId, body.outcome, body.failureCode));
    return { ok: true, status: result };
  }

  /** Yerel simülasyon (webhook yerine, oturumlu). Gerçek ortamda kullanılmaz. */
  @Post("payments/:id/simulate")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(paymentSimulateSchema)
  async simulate(@Param("id") id: string, @Body(new ZodPipe(paymentSimulateSchema)) body: PaymentSimulateRequest) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment?.externalTxId) throw new NotFoundException({ message: "Ödeme bulunamadı" });
    const result = await this.prisma.$transaction((tx) => this.apply(tx, payment.externalTxId!, body.outcome, body.failureCode));
    return { id, status: result };
  }

  @Get("payments/order/:orderId")
  @RequirePermission("sales", "VIEW")
  async byOrder(@Param("orderId") orderId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: { provider: { select: { code: true, name: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      status: p.status,
      amount: p.amount.toFixed(2),
      currency: p.currency,
      installments: p.installments,
      provider: p.provider,
      failureCode: p.failureCode,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  /** Ödeme sonucunu uygular (idempotent): durum değiştir + olay yayınla. */
  private async apply(tx: Tx, externalTxId: string, outcome: "CAPTURED" | "FAILED", failureCode?: string): Promise<string> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE "externalTxId" = ${externalTxId} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException({ message: "Ödeme bulunamadı" });
    const p = await tx.payment.findUniqueOrThrow({ where: { id: rows[0].id } });
    // Idempotent: sonuçlanmış ödeme yeniden işlenmez.
    if (p.status === "CAPTURED" || p.status === "FAILED") return p.status;
    const status = outcome === "CAPTURED" ? "CAPTURED" : "FAILED";
    await tx.payment.update({ where: { id: p.id }, data: { status, failureCode: outcome === "FAILED" ? (failureCode ?? "declined") : null } });
    if (outcome === "CAPTURED") await emit(tx, { type: "payment.captured", paymentId: p.id, orderId: p.orderId ?? undefined });
    else await emit(tx, { type: "payment.failed", paymentId: p.id, orderId: p.orderId ?? undefined });
    return status;
  }
}
