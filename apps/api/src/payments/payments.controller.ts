import { randomUUID } from "node:crypto";
import { BadRequestException, Body, Controller, Get, Headers, Inject, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, Prisma, type Tx, writeAudit } from "@atelier/db";
import {
  type BankImportRequest,
  bankImportSchema,
  type BankMatchRequest,
  bankMatchSchema,
  type CheckoutRequest,
  checkoutSchema,
  extractOrderTokens,
  type PaymentSimulateRequest,
  paymentSimulateSchema,
  type PaymentWebhookPayload,
  paymentWebhookSchema,
  SETTLEMENT_DIFF_THRESHOLD,
  type SettlementImportRequest,
  settlementExpected,
  settlementImportSchema,
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

  /** Aktif ödeme sağlayıcıları (F2-04: sağlayıcı seçimi + yedek). */
  @Get("payments/providers")
  @RequirePermission("sales", "VIEW")
  async providers() {
    return this.prisma.paymentProvider.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
  }

  /** Sağlayıcı oturumu başlatır: Payment (PENDING) oluşturur, siparişi PAYMENT_PENDING'e alır. */
  @Post("payments/checkout")
  @RequirePermission("sales", "CREATE")
  @ApiZodBody(checkoutSchema)
  async checkout(@Body(new ZodPipe(checkoutSchema)) body: CheckoutRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const order = await this.prisma.salesOrder.findUnique({ where: { id: body.orderId } });
    if (!order) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    if (order.status !== "NEW" && order.status !== "PAYMENT_PENDING")
      throw new BadRequestException({ message: "Bu sipariş için ödeme başlatılamaz" });
    const provider = body.providerId
      ? await this.prisma.paymentProvider.findFirst({ where: { id: body.providerId, isActive: true } })
      : await this.prisma.paymentProvider.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } });
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

  // ---------------------------------------------------------------------------------------------
  // Hakediş mutabakatı (ODM-06) ve banka eşleme (ODM-07)
  // ---------------------------------------------------------------------------------------------

  /** Hakediş listesi (dönem bazında beklenen/yatan/fark). */
  @Get("payments/settlements")
  @RequirePermission("sales", "VIEW")
  async settlements() {
    const rows = await this.prisma.settlement.findMany({ orderBy: { periodEnd: "desc" }, take: 50, include: { channel: { select: { code: true, name: true } }, _count: { select: { lines: true } } } });
    return rows.map((s) => ({
      id: s.id,
      channel: s.channel,
      periodStart: s.periodStart.toISOString().slice(0, 10),
      periodEnd: s.periodEnd.toISOString().slice(0, 10),
      expected: s.expected.toFixed(2),
      received: s.received?.toFixed(2) ?? null,
      diff: s.received != null ? s.expected.minus(s.received).toFixed(2) : null,
      status: s.status,
      lineCount: s._count.lines,
    }));
  }

  /** ODM-06: pazaryeri hakediş ekstresini içe aktarır; satırları siparişlerle eşler, farkı hesaplar. */
  @Post("payments/settlements/import")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(settlementImportSchema)
  async importSettlement(@Body(new ZodPipe(settlementImportSchema)) body: SettlementImportRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const channel = await this.prisma.salesChannel.findUnique({ where: { id: body.channelId }, select: { id: true } });
    if (!channel) throw new NotFoundException({ message: "Kanal bulunamadı" });
    const expected = settlementExpected(body.lines);
    const orderNos = body.lines.map((l) => l.orderNo).filter((n): n is string => !!n);
    const matchedOrders = orderNos.length ? await this.prisma.salesOrder.findMany({ where: { number: { in: orderNos } }, select: { number: true } }) : [];
    const known = new Set(matchedOrders.map((o) => o.number));
    const received = body.received ?? null;
    const diff = received != null ? new Prisma.Decimal(expected).minus(received) : null;
    const status = received == null ? "OPEN" : diff!.abs().lessThanOrEqualTo(SETTLEMENT_DIFF_THRESHOLD) ? "MATCHED" : "DIFF";
    const settlement = await this.prisma.$transaction(async (tx) => {
      const s = await tx.settlement.create({
        data: {
          channelId: body.channelId,
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          expected: new Prisma.Decimal(expected),
          received: received != null ? new Prisma.Decimal(received) : null,
          status,
          lines: { create: body.lines.map((l) => ({ kind: l.kind, orderNo: l.orderNo ?? null, amount: new Prisma.Decimal(l.amount), matched: l.orderNo ? known.has(l.orderNo) : false })) },
        },
      });
      await writeAudit(tx, { userId: auth.userId, action: "settlement.import", entity: "Settlement", entityId: s.id, after: { expected, received, status, lines: body.lines.length }, ...clientInfo(req) });
      return s;
    });
    const unexplained = diff && diff.abs().greaterThan(SETTLEMENT_DIFF_THRESHOLD);
    return { id: settlement.id, expected, received, status, diff: diff?.toFixed(2) ?? null, taskOpened: !!unexplained };
  }

  /** ODM-07: eşleşmemiş banka hareketleri kuyruğu. */
  @Get("payments/bank-transactions")
  @RequirePermission("sales", "VIEW")
  async bankTransactions(@Query("unmatched") unmatched?: string) {
    const where = unmatched === "true" ? { matchedId: null } : {};
    const rows = await this.prisma.bankTransaction.findMany({ where, orderBy: { valueDate: "desc" }, take: 100 });
    return rows.map((t) => ({ id: t.id, bankCode: t.bankCode, iban: t.iban, valueDate: t.valueDate.toISOString().slice(0, 10), amount: t.amount.toFixed(2), description: t.description, matchedType: t.matchedType, matchedId: t.matchedId }));
  }

  /** ODM-07: banka ekstresini içe aktarır; açıklamada sipariş no + tutar tutarsa otomatik eşler, kalanı kuyruğa alır. */
  @Post("payments/bank-transactions/import")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(bankImportSchema)
  async importBank(@Body(new ZodPipe(bankImportSchema)) body: BankImportRequest) {
    let matched = 0;
    for (const t of body.transactions) {
      const tokens = extractOrderTokens(t.description);
      let matchedType: string | null = null;
      let matchedId: string | null = null;
      if (tokens.length) {
        const order = await this.prisma.salesOrder.findFirst({ where: { number: { in: tokens } }, select: { id: true, grandTotal: true } });
        if (order && order.grandTotal.equals(new Prisma.Decimal(t.amount))) {
          matchedType = "Order";
          matchedId = order.id;
          matched++;
        }
      }
      await this.prisma.bankTransaction.create({ data: { bankCode: t.bankCode, iban: t.iban, valueDate: t.valueDate, amount: new Prisma.Decimal(t.amount), description: t.description, matchedType, matchedId } });
    }
    return { imported: body.transactions.length, autoMatched: matched, queued: body.transactions.length - matched };
  }

  /** ODM-07: manuel eşleme. */
  @Post("payments/bank-transactions/:id/match")
  @RequirePermission("sales", "EDIT")
  @ApiZodBody(bankMatchSchema)
  async matchBank(@Param("id") id: string, @Body(new ZodPipe(bankMatchSchema)) body: BankMatchRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException({ message: "Banka hareketi bulunamadı" });
    return this.prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({ where: { id }, data: { matchedType: body.matchedType, matchedId: body.matchedId } });
      await writeAudit(tx, { userId: auth.userId, action: "bank.match", entity: "BankTransaction", entityId: id, after: { matchedType: body.matchedType, matchedId: body.matchedId }, ...clientInfo(req) });
      return { id, matchedType: body.matchedType, matchedId: body.matchedId };
    });
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
