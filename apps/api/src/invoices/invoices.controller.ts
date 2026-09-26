import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { emit, writeAudit } from "@atelier/db";
import {
  type EInvoiceWebhookPayload,
  einvoiceWebhookSchema,
  type InvoiceCancelRequest,
  invoiceCancelSchema,
  type InvoiceQuery,
  invoiceQuerySchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { IntegrationsService } from "../common/integrations.service.js";
import { PiiService } from "../common/pii.service.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { Public, RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Fatura (F2-05/06 · docs/03-moduller/fatura.md). Kesim order.confirmed ile worker'da; burada
 * listeleme, PDF, yeniden gönderme (FTR-04 hatalı kuyruk), iptal ve iade (FTR-06), webhook (durum).
 */
@ApiTags("invoices")
@Controller()
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly pii: PiiService,
  ) {}

  @Get("invoices")
  @RequirePermission("invoicing", "VIEW")
  @ApiZodQuery(invoiceQuerySchema)
  async list(@Query(new ZodPipe(invoiceQuerySchema)) q: InvoiceQuery) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        direction: q.direction,
        type: q.type,
        status: q.status,
        ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" } }, { customer: { fullName: { contains: q.q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        type: true,
        direction: true,
        status: true,
        issueDate: true,
        grandTotal: true,
        errorMessage: true,
        customer: { select: { fullName: true } },
        order: { select: { number: true } },
      },
    });
    return rows.map((r) => ({ ...r, grandTotal: r.grandTotal.toFixed(2), issueDate: r.issueDate.toISOString() }));
  }

  @Get("invoices/:id")
  @RequirePermission("invoicing", "VIEW")
  async get(@Param("id") id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: true, customer: { select: { fullName: true } }, order: { select: { number: true } } },
    });
    if (!inv) throw new NotFoundException({ message: "Fatura bulunamadı" });
    const m = (d: { toFixed(n: number): string }) => d.toFixed(2);
    return {
      id: inv.id,
      number: inv.number,
      ettn: inv.ettn,
      type: inv.type,
      direction: inv.direction,
      status: inv.status,
      issueDate: inv.issueDate.toISOString(),
      currency: inv.currency,
      customer: inv.customer,
      order: inv.order,
      errorMessage: inv.errorMessage,
      netTotal: m(inv.netTotal),
      otvTotal: m(inv.otvTotal),
      kdvTotal: m(inv.kdvTotal),
      grandTotal: m(inv.grandTotal),
      lines: inv.lines.map((l) => ({
        id: l.id,
        description: l.description,
        qty: l.qty.toString(),
        unitPrice: l.unitPrice.toFixed(2),
        netAmount: l.netAmount.toFixed(2),
        otvAmount: l.otvAmount.toFixed(2),
        kdvAmount: l.kdvAmount.toFixed(2),
      })),
    };
  }

  @Get("invoices/:id/pdf")
  @RequirePermission("invoicing", "VIEW")
  async pdf(@Param("id") id: string, @Res() res: Response) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv?.ettn) throw new NotFoundException({ message: "Belge PDF'i hazır değil" });
    const { adapter, ctx } = await this.integrations.einvoice();
    const bytes = await adapter.pdf(ctx, inv.ettn);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${inv.number ?? inv.id}.pdf"`);
    res.end(Buffer.from(bytes));
  }

  /** FTR-04: hatalı belgeyi yeniden gönderir (tutar değişmez). */
  @Post("invoices/:id/retry")
  @RequirePermission("invoicing", "EDIT")
  async retry(@Param("id") id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { customer: true } });
    if (!inv) throw new NotFoundException({ message: "Fatura bulunamadı" });
    if (inv.status !== "ERROR") throw new BadRequestException({ message: "Yalnızca hatalı belge yeniden gönderilir" });
    const taxNo = inv.customer?.taxNo ? this.pii.dec(inv.customer.taxNo) : null;
    if (inv.customer?.type === "CORPORATE" && !taxNo)
      throw new BadRequestException({ message: "Kurumsal alıcıda VKN hâlâ eksik; önce müşteri kartını düzeltin" });
    const { adapter, ctx } = await this.integrations.einvoice();
    try {
      const r = await adapter.send(ctx, { invoiceId: inv.id, type: inv.type, taxNo });
      await this.prisma.$transaction(async (tx) => {
        await tx.invoice.update({ where: { id }, data: { number: r.number, ettn: r.ettn, status: "SENT", errorMessage: null } });
        await emit(tx, { type: "invoice.issued", invoiceId: id });
      });
      return { id, status: "SENT" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "hata";
      await this.prisma.invoice.update({ where: { id }, data: { errorMessage: msg } });
      throw new BadRequestException({ message: `Gönderilemedi: ${msg}` });
    }
  }

  /** FTR-06: fatura iptali. */
  @Post("invoices/:id/cancel")
  @RequirePermission("invoicing", "APPROVE")
  @ApiZodBody(invoiceCancelSchema)
  async cancel(@Param("id") id: string, @Body(new ZodPipe(invoiceCancelSchema)) body: InvoiceCancelRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException({ message: "Fatura bulunamadı" });
    if (inv.status === "CANCELLED") throw new BadRequestException({ message: "Fatura zaten iptal" });
    const { adapter, ctx } = await this.integrations.einvoice();
    if (inv.ettn) await adapter.cancel(ctx, inv.ettn, body.reason);
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", errorMessage: body.reason } });
      await writeAudit(tx, { userId: auth.userId, action: "invoice.cancel", entity: "Invoice", entityId: id, before: { status: inv.status }, after: { status: "CANCELLED", reason: body.reason }, ...clientInfo(req) });
    });
    return { id, status: "CANCELLED" };
  }

  /** FTR-06: iade faturası (RETURN) oluşturur ve gönderir. */
  @Post("invoices/:id/return")
  @RequirePermission("invoicing", "CREATE")
  async createReturn(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const src = await this.prisma.invoice.findUnique({ where: { id }, include: { lines: true, customer: true } });
    if (!src) throw new NotFoundException({ message: "Fatura bulunamadı" });
    if (src.type === "RETURN") throw new BadRequestException({ message: "İade faturasının iadesi olmaz" });
    const taxNo = src.customer?.taxNo ? this.pii.dec(src.customer.taxNo) : null;
    const { adapter, ctx } = await this.integrations.einvoice();
    const created = await this.prisma.invoice.create({
      data: {
        direction: "SALES",
        type: "RETURN",
        status: "DRAFT",
        issueDate: new Date(),
        orderId: src.orderId,
        customerId: src.customerId,
        currency: src.currency,
        netTotal: src.netTotal,
        otvTotal: src.otvTotal,
        kdvBase: src.kdvBase,
        kdvTotal: src.kdvTotal,
        grandTotal: src.grandTotal,
        lines: {
          create: src.lines.map((l) => ({
            productId: l.productId,
            description: `İADE · ${l.description}`,
            qty: l.qty,
            unitPrice: l.unitPrice,
            netAmount: l.netAmount,
            otvRate: l.otvRate,
            otvAmount: l.otvAmount,
            kdvRate: l.kdvRate,
            kdvAmount: l.kdvAmount,
          })),
        },
      },
    });
    const r = await adapter.send(ctx, { invoiceId: created.id, type: "RETURN", taxNo });
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: created.id }, data: { number: r.number, ettn: r.ettn, status: "SENT" } });
      await emit(tx, { type: "invoice.issued", invoiceId: created.id });
      await writeAudit(tx, { userId: auth.userId, action: "invoice.return", entity: "Invoice", entityId: created.id, after: { source: src.number, number: r.number }, ...clientInfo(req) });
    });
    return { id: created.id, number: r.number, status: "SENT" };
  }

  /** e-Belge webhook'u: ETTN ile durum güncellemesi (mock; imza gerçek entegratörde). */
  @Post("webhooks/einvoice")
  @Public()
  @ApiZodBody(einvoiceWebhookSchema)
  async webhook(@Body(new ZodPipe(einvoiceWebhookSchema)) body: EInvoiceWebhookPayload) {
    const inv = await this.prisma.invoice.findUnique({ where: { ettn: body.ettn } });
    if (!inv) return { ok: false };
    await this.prisma.invoice.update({ where: { id: inv.id }, data: { status: body.status } });
    return { ok: true, status: body.status };
  }
}
