import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createLot, emit, Prisma, recordMovement, writeAudit } from "@atelier/db";
import {
  PO_APPROVAL_THRESHOLD,
  type PoCreateRequest,
  poCreateSchema,
  RECEIPT_BLOCK_PCT,
  RECEIPT_WARN_PCT,
  type ReceiptCreateRequest,
  receiptCreateSchema,
  type SupplierCreateRequest,
  supplierCreateSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Satın alma (F2-14/15 · docs/03-moduller/satin-alma.md).
 *  - SAT-01: MRP önerileri min. stok altındaki kalemler için.
 *  - SAT-03: eşik üstü sipariş PENDING_APPROVAL; onaylayan purchasing:APPROVE.
 *  - SAT-04: mal kabul lot (QUARANTINE) + RECEIPT hareketi yazar (stok kuralı 2/3).
 *  - SAT-05: kabul miktarı sipariş miktarını %5 aşarsa uyarı, %10 aşarsa engel.
 */
@ApiTags("purchasing")
@Controller("purchasing")
export class PurchasingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("suppliers")
  @RequirePermission("purchasing", "VIEW")
  async suppliers() {
    return this.prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, isEInvoice: true } });
  }

  @Post("suppliers")
  @RequirePermission("purchasing", "CREATE")
  @ApiZodBody(supplierCreateSchema)
  async createSupplier(@Body(new ZodPipe(supplierCreateSchema)) body: SupplierCreateRequest) {
    const s = await this.prisma.supplier.create({ data: { ...body } });
    return { id: s.id };
  }

  /** SAT-07: tedarikçi karnesi (mock skorlar; gerçek hesap Faz 4). */
  @Get("suppliers/:id/scorecard")
  @RequirePermission("purchasing", "VIEW")
  async scorecard(@Param("id") id: string) {
    const s = await this.prisma.supplier.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!s) throw new NotFoundException({ message: "Tedarikçi bulunamadı" });
    const orders = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    return { ...s, orders, onTimePct: 90, qualityRejectPct: 2, avgLeadDays: 12, score: 86 };
  }

  /** SAT-01: MRP önerileri — kullanılabilir stok min. seviyenin altındaki kalemler. */
  @Get("suggestions")
  @RequirePermission("purchasing", "VIEW")
  async suggestions() {
    const items = await this.prisma.item.findMany({
      where: { minStock: { not: null }, type: { in: ["RAW_MATERIAL", "PACKAGING", "SEMI_FINISHED"] } },
      select: { id: true, code: true, name: true, uom: true, minStock: true, reorderQty: true, supplierItems: { where: { isPreferred: true }, include: { supplier: { select: { id: true, name: true } } }, take: 1 } },
    });
    const sums = await this.prisma.stockBalance.groupBy({ by: ["itemId"], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { qtyOnHand: true, qtyReserved: true } });
    const by = new Map(sums.map((s) => [s.itemId, s._sum]));
    const out = [];
    for (const it of items) {
      const st = by.get(it.id);
      const available = (st?.qtyOnHand ?? new Prisma.Decimal(0)).minus(st?.qtyReserved ?? new Prisma.Decimal(0));
      const min = it.minStock!;
      if (available.greaterThanOrEqualTo(min)) continue;
      const suggested = it.reorderQty ?? min.minus(available);
      const pref = it.supplierItems[0];
      out.push({
        itemId: it.id,
        code: it.code,
        name: it.name,
        uom: it.uom,
        available: available.toString(),
        minStock: min.toString(),
        suggestedQty: suggested.toString(),
        supplier: pref ? { id: pref.supplier.id, name: pref.supplier.name, leadTimeDays: pref.leadTimeDays } : null,
      });
    }
    return out;
  }

  @Get("orders")
  @RequirePermission("purchasing", "VIEW")
  async orders() {
    const rows = await this.prisma.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { supplier: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return rows.map((o) => ({ id: o.id, number: o.number, status: o.status, total: o.total.toFixed(2), currency: o.currency, supplier: o.supplier, lineCount: o._count.lines, createdAt: o.createdAt.toISOString() }));
  }

  @Get("orders/:id")
  @RequirePermission("purchasing", "VIEW")
  async order(@Param("id") id: string) {
    const o = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: { select: { name: true } }, lines: { include: { item: { select: { code: true, name: true, uom: true } } } }, receipts: { include: { _count: { select: { lines: true } } } } },
    });
    if (!o) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      currency: o.currency,
      total: o.total.toFixed(2),
      supplier: o.supplier,
      lines: o.lines.map((l) => ({ id: l.id, item: l.item, qty: l.qty.toString(), unitPrice: l.unitPrice.toFixed(2), kdvRate: l.kdvRate.toString(), receivedQty: l.receivedQty.toString() })),
      receipts: o.receipts.map((r) => ({ id: r.id, number: r.number, lineCount: r._count.lines, createdAt: r.createdAt.toISOString() })),
    };
  }

  @Post("orders")
  @RequirePermission("purchasing", "CREATE")
  @ApiZodBody(poCreateSchema)
  async createOrder(@Body(new ZodPipe(poCreateSchema)) body: PoCreateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: body.supplierId }, select: { id: true } });
    if (!supplier) throw new NotFoundException({ message: "Tedarikçi bulunamadı" });
    const total = body.lines.reduce((a, l) => a.plus(new Prisma.Decimal(l.qty).mul(l.unitPrice)), new Prisma.Decimal(0));
    const id = await this.prisma.$transaction(async (tx) => {
      const count = await tx.purchaseOrder.count();
      const number = `SA-${String(count + 1).padStart(4, "0")}`;
      const po = await tx.purchaseOrder.create({
        data: {
          number,
          supplierId: supplier.id,
          status: "REQUESTED",
          currency: body.currency,
          total,
          expectedAt: body.expectedAt ?? null,
          lines: { create: body.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, kdvRate: l.kdvRate })) },
        },
      });
      await writeAudit(tx, { userId: auth.userId, action: "po.create", entity: "PurchaseOrder", entityId: po.id, after: { number, total: total.toFixed(2), lines: body.lines.length }, ...clientInfo(req) });
      return po.id;
    });
    return { id };
  }

  /** SAT-03: eşik üstü → PENDING_APPROVAL, aksi halde doğrudan ORDERED. */
  @Post("orders/:id/submit")
  @RequirePermission("purchasing", "CREATE")
  async submit(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    if (po.status !== "REQUESTED") throw new BadRequestException({ message: "Yalnızca talep durumundaki sipariş gönderilir" });
    const rule = await this.prisma.approvalRule.findFirst({ where: { module: "purchasing", entity: "PurchaseOrder", isActive: true } });
    const threshold = rule?.minAmount ?? new Prisma.Decimal(PO_APPROVAL_THRESHOLD);
    const next = po.total.greaterThanOrEqualTo(threshold) ? "PENDING_APPROVAL" : "ORDERED";
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id }, data: { status: next } });
      if (next === "ORDERED") await emit(tx, { type: "po.approved", purchaseOrderId: id });
      await writeAudit(tx, { userId: auth.userId, action: "po.submit", entity: "PurchaseOrder", entityId: id, before: { status: po.status }, after: { status: next }, ...clientInfo(req) });
    });
    return { id, status: next };
  }

  @Post("orders/:id/approve")
  @RequirePermission("purchasing", "APPROVE")
  async approve(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    if (po.status !== "PENDING_APPROVAL") throw new BadRequestException({ message: "Sipariş onay beklemiyor" });
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id }, data: { status: "ORDERED" } });
      await emit(tx, { type: "po.approved", purchaseOrderId: id });
      await writeAudit(tx, { userId: auth.userId, action: "po.approve", entity: "PurchaseOrder", entityId: id, before: { status: "PENDING_APPROVAL" }, after: { status: "ORDERED" }, ...clientInfo(req) });
    });
    return { id, status: "ORDERED" };
  }

  /** SAT-04: mal kabul → lot (QUARANTINE) + RECEIPT hareketi. SAT-05 aşım kontrolü. */
  @Post("orders/:id/receipts")
  @RequirePermission("purchasing", "CREATE")
  @ApiZodBody(receiptCreateSchema)
  async receipt(@Param("id") id: string, @Body(new ZodPipe(receiptCreateSchema)) body: ReceiptCreateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
    if (!po) throw new NotFoundException({ message: "Sipariş bulunamadı" });
    if (!["ORDERED", "IN_TRANSIT", "RECEIVING"].includes(po.status)) throw new BadRequestException({ message: "Bu sipariş için mal kabul yapılamaz (önce onaylayın)" });
    const location = await this.prisma.location.findFirst({ orderBy: { pickSequence: "asc" }, select: { id: true } });
    if (!location) throw new BadRequestException({ message: "Depo konumu tanımlı değil" });

    const warnings: string[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const count = await tx.goodsReceipt.count();
      const gr = await tx.goodsReceipt.create({ data: { number: `MK-${String(count + 1).padStart(4, "0")}`, orderId: id, receivedById: auth.userId } });
      for (const line of body.lines) {
        const poLine = po.lines.find((l) => l.id === line.poLineId);
        if (!poLine) throw new BadRequestException({ message: "Sipariş satırı bulunamadı" });
        const newReceived = poLine.receivedQty.plus(line.qty);
        const overPct = poLine.qty.greaterThan(0) ? newReceived.minus(poLine.qty).div(poLine.qty).mul(100).toNumber() : 0;
        if (overPct > RECEIPT_BLOCK_PCT) throw new BadRequestException({ message: `Kabul miktarı sipariş miktarını %${RECEIPT_BLOCK_PCT}'ten fazla aşıyor` });
        if (overPct > RECEIPT_WARN_PCT) warnings.push(`${poLine.itemId}: %${overPct.toFixed(0)} aşım`);
        const lot = await createLot(tx, { itemId: poLine.itemId, lotNo: line.lotNo ?? `${gr.number}-${poLine.itemId.slice(-4)}`, expiryDate: line.expiryDate ?? null, qcStatus: "QUARANTINE" });
        await recordMovement(tx, { type: "RECEIPT", itemId: poLine.itemId, lotId: lot.id, qty: line.qty, toLocationId: location.id, unitCost: poLine.unitPrice.toString(), refType: "GoodsReceipt", refId: gr.id, userId: auth.userId });
        await tx.goodsReceiptLine.create({ data: { receiptId: gr.id, poLineId: poLine.id, lotId: lot.id, qty: line.qty, damagedQty: line.damagedQty ?? "0" } });
        await tx.purchaseOrderLine.update({ where: { id: poLine.id }, data: { receivedQty: newReceived } });
        await emit(tx, { type: "lot.received", lotId: lot.id });
      }
      // Tüm satırlar tam karşılandıysa CLOSED, aksi halde RECEIVING.
      const fresh = await tx.purchaseOrderLine.findMany({ where: { orderId: id } });
      const fully = fresh.every((l) => l.receivedQty.greaterThanOrEqualTo(l.qty));
      await tx.purchaseOrder.update({ where: { id }, data: { status: fully ? "CLOSED" : "RECEIVING" } });
      await writeAudit(tx, { userId: auth.userId, action: "po.receipt", entity: "GoodsReceipt", entityId: gr.id, after: { po: po.number, lines: body.lines.length }, ...clientInfo(req) });
      return { receiptId: gr.id, status: fully ? "CLOSED" : "RECEIVING" };
    });
    return { ...result, warnings };
  }
}
