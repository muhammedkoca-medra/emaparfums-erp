import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { applicableTests, emit, setLotQcStatus, writeAudit } from "@atelier/db";
import {
  COMPLIANCE_DOC_TYPES,
  type ComplianceDocType,
  type ComplianceUpsertRequest,
  complianceUpsertSchema,
  computeSalesLock,
  type InspectionResultsRequest,
  inspectionResultsSchema,
  type InspectionStatus,
  type LotReleaseRequest,
  lotReleaseSchema,
  type NonConformanceRequest,
  nonConformanceSchema,
  type RecallRequest,
  recallSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Kalite — muayene ve lot serbest bırakma (F3-04 · docs/03-moduller/kalite.md).
 *  - KAL-01: muayeneler lot.received / batch.completed ile worker'da otomatik açılır.
 *  - KAL-02: tüm uygulanabilir testler geçince lot serbest bırakılır (quality:APPROVE) → lot.released.
 *  - KAL-03: bir test kalırsa lot REJECTED, DÖF otomatik açılır, lot.quarantined yayılır.
 */
@ApiTags("quality")
@Controller("quality")
export class QualityController {
  constructor(private readonly prisma: PrismaService) {}

  /** Lot serbest bırakma kuyruğu. */
  @Get("inspections")
  @RequirePermission("quality", "VIEW")
  async inspections(@Query("status") status?: string) {
    const rows = await this.prisma.qcInspection.findMany({
      where: status ? { status: status as InspectionStatus } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        lot: { select: { id: true, lotNo: true, qcStatus: true, item: { select: { code: true, name: true, type: true } } } },
        results: { include: { test: { select: { code: true, name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      releasedAt: r.releasedAt?.toISOString() ?? null,
      lot: { id: r.lot.id, lotNo: r.lot.lotNo, qcStatus: r.lot.qcStatus, itemCode: r.lot.item.code, itemName: r.lot.item.name },
      results: r.results.map((res) => ({ testId: res.testId, code: res.test.code, name: res.test.name, value: res.value, passed: res.passed })),
    }));
  }

  @Get("inspections/:id")
  @RequirePermission("quality", "VIEW")
  async inspection(@Param("id") id: string) {
    const r = await this.prisma.qcInspection.findUnique({
      where: { id },
      include: { lot: { select: { id: true, lotNo: true, qcStatus: true } }, results: { include: { test: true } } },
    });
    if (!r) throw new NotFoundException({ message: "Muayene bulunamadı" });
    const tests = await this.prisma.$transaction((tx) => applicableTests(tx, r.lot.id));
    const done = new Map(r.results.map((res) => [res.testId, res]));
    return {
      id: r.id,
      status: r.status,
      lot: r.lot,
      tests: tests.map((t) => {
        const res = done.get(t.id);
        return { testId: t.id, code: t.code, name: t.name, spec: t.spec, value: res?.value ?? null, passed: res ? res.passed : null };
      }),
    };
  }

  /**
   * KAL-03: test sonuçlarını kaydeder. Bir sonuç bile kaldıysa muayene FAILED, lot REJECTED,
   * DÖF açılır ve lot.quarantined yayılır. Hepsi geçtiyse muayene TESTING'de kalır (serbest bırakmayı bekler).
   */
  @Post("inspections/:id/results")
  @RequirePermission("quality", "EDIT")
  @ApiZodBody(inspectionResultsSchema)
  async recordResults(
    @Param("id") id: string,
    @Body(new ZodPipe(inspectionResultsSchema)) body: InspectionResultsRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.qcInspection.findUnique({ where: { id }, include: { lot: { select: { id: true } } } });
      if (!insp) throw new NotFoundException({ message: "Muayene bulunamadı" });
      if (insp.status === "PASSED") throw new BadRequestException({ message: "Serbest bırakılmış muayene değiştirilemez" });
      const testIds = body.results.map((r) => r.testId);
      const valid = await tx.qcTest.findMany({ where: { id: { in: testIds } }, select: { id: true } });
      if (valid.length !== new Set(testIds).size) throw new BadRequestException({ message: "Geçersiz test" });
      // Aynı testin önceki sonucunu değiştir (tekrar ölçüm).
      await tx.qcResult.deleteMany({ where: { inspectionId: id, testId: { in: testIds } } });
      await tx.qcResult.createMany({ data: body.results.map((r) => ({ inspectionId: id, testId: r.testId, value: r.value ?? null, passed: r.passed, testedById: auth.userId })) });

      const anyFail = body.results.some((r) => !r.passed);
      if (anyFail) {
        await tx.qcInspection.update({ where: { id }, data: { status: "FAILED" } });
        const count = await tx.nonConformance.count();
        const number = `NC-${new Date().getFullYear() % 100}${String(count + 1).padStart(4, "0")}`;
        await tx.nonConformance.create({ data: { number, lotId: insp.lot.id, description: "Kalite testinde başarısızlık; lot reddedildi", ownerId: auth.userId } });
        await setLotQcStatus(tx, { lotId: insp.lot.id, status: "REJECTED", reason: `Muayene ${id}: test kaldı`, userId: auth.userId, ...clientInfo(req) });
        return { id, status: "FAILED", nonConformance: number };
      }
      await tx.qcInspection.update({ where: { id }, data: { status: "TESTING" } });
      return { id, status: "TESTING" };
    });
  }

  /**
   * KAL-02: lotu serbest bırakır. Uygulanabilir tüm testlerin geçmiş sonucu olmalı; aksi halde 400.
   * setLotQcStatus RELEASED → lot.released (worker partiyi RELEASED yapar, URT-06).
   */
  @Post("inspections/:id/release")
  @RequirePermission("quality", "APPROVE")
  @ApiZodBody(lotReleaseSchema)
  async release(
    @Param("id") id: string,
    @Body(new ZodPipe(lotReleaseSchema)) body: LotReleaseRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.qcInspection.findUnique({ where: { id }, include: { lot: { select: { id: true, qcStatus: true } }, results: true } });
      if (!insp) throw new NotFoundException({ message: "Muayene bulunamadı" });
      if (insp.status === "PASSED" || insp.lot.qcStatus === "RELEASED") return { id, status: "PASSED", lot: insp.lot.id };
      if (insp.status === "FAILED") throw new BadRequestException({ message: "Başarısız muayene serbest bırakılamaz; önce DÖF kapatılmalı" });
      const tests = await applicableTests(tx, insp.lot.id);
      const passed = new Set(insp.results.filter((r) => r.passed).map((r) => r.testId));
      const missing = tests.filter((t) => !passed.has(t.id));
      if (missing.length > 0)
        throw new BadRequestException({ message: `Tüm zorunlu testler geçmeden serbest bırakılamaz (KAL-02). Eksik/başarısız: ${missing.map((t) => t.code).join(", ")}` });
      await tx.qcInspection.update({ where: { id }, data: { status: "PASSED", releasedById: auth.userId, releasedAt: new Date() } });
      await setLotQcStatus(tx, { lotId: insp.lot.id, status: "RELEASED", reason: body.note ?? `Muayene ${id}: tüm testler geçti`, userId: auth.userId, ...clientInfo(req) });
      return { id, status: "PASSED", lot: insp.lot.id };
    });
  }

  /** DÖF listesi. */
  @Get("nonconformances")
  @RequirePermission("quality", "VIEW")
  async nonconformances(@Query("status") status?: string) {
    const rows = await this.prisma.nonConformance.findMany({ where: status ? { status: status as "OPEN" | "INVESTIGATING" | "ACTION" | "CLOSED" } : {}, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((n) => ({ id: n.id, number: n.number, lotId: n.lotId, description: n.description, status: n.status, rootCause: n.rootCause, action: n.action, createdAt: n.createdAt.toISOString(), closedAt: n.closedAt?.toISOString() ?? null }));
  }

  /** DÖF açar (elle). */
  @Post("nonconformances")
  @RequirePermission("quality", "CREATE")
  @ApiZodBody(nonConformanceSchema)
  async createNc(@Body(new ZodPipe(nonConformanceSchema)) body: NonConformanceRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.nonConformance.count();
      const number = `NC-${new Date().getFullYear() % 100}${String(count + 1).padStart(4, "0")}`;
      const nc = await tx.nonConformance.create({ data: { number, lotId: body.lotId ?? null, description: body.description, ownerId: auth.userId } });
      await writeAudit(tx, { userId: auth.userId, action: "nc.create", entity: "NonConformance", entityId: nc.id, after: { number, lotId: body.lotId ?? null }, ...clientInfo(req) });
      return { id: nc.id, number };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Uyum belgeleri (KAL-04/05)
  // ---------------------------------------------------------------------------------------------

  /** Bir ürünün uyum belgeleri (tüm türler; kayıtsız olan MISSING). */
  @Get("compliance")
  @RequirePermission("quality", "VIEW")
  async compliance(@Query("productId") productId?: string) {
    if (!productId) throw new BadRequestException({ message: "productId gerekli" });
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, sku: true, status: true } });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const docs = await this.prisma.complianceDocument.findMany({ where: { productId } });
    const byType = new Map(docs.map((d) => [d.type, d]));
    return {
      product,
      docs: COMPLIANCE_DOC_TYPES.map((type) => {
        const d = byType.get(type as ComplianceDocType);
        return { type, status: d?.status ?? "MISSING", externalRef: d?.externalRef ?? null, fileUrl: d?.fileUrl ?? null, validUntil: d?.validUntil?.toISOString() ?? null };
      }),
    };
  }

  /**
   * KAL-04/05: uyum belgesi ekler/günceller ve ürün satış durumunu yeniden hesaplar.
   * Zorunlu belgelerden biri VALID değilse ürün SALES_LOCKED; hepsi VALID ise ACTIVE. Durum değişirse
   * compliance.changed yayılır (worker pazaryeri listelemesini pasifler).
   */
  @Put("compliance/:productId/:type")
  @RequirePermission("quality", "EDIT")
  @ApiZodBody(complianceUpsertSchema)
  async upsertCompliance(
    @Param("productId") productId: string,
    @Param("type") type: string,
    @Body(new ZodPipe(complianceUpsertSchema)) body: ComplianceUpsertRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    if (!COMPLIANCE_DOC_TYPES.includes(type as ComplianceDocType)) throw new BadRequestException({ message: "Geçersiz belge türü" });
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
      if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
      await tx.complianceDocument.upsert({
        where: { productId_type: { productId, type: type as ComplianceDocType } },
        update: { status: body.status, externalRef: body.externalRef ?? null, fileUrl: body.fileUrl ?? null, validUntil: body.validUntil ?? null },
        create: { productId, type: type as ComplianceDocType, status: body.status, externalRef: body.externalRef ?? null, fileUrl: body.fileUrl ?? null, validUntil: body.validUntil ?? null },
      });
      const docs = await tx.complianceDocument.findMany({ where: { productId }, select: { type: true, status: true } });
      const nextStatus = computeSalesLock(product.status, docs);
      let statusChanged = false;
      if (nextStatus !== product.status) {
        await tx.product.update({ where: { id: productId }, data: { status: nextStatus } });
        statusChanged = true;
      }
      await writeAudit(tx, { userId: auth.userId, action: "compliance.update", entity: "Product", entityId: productId, before: { status: product.status }, after: { type, docStatus: body.status, productStatus: nextStatus }, ...clientInfo(req) });
      if (statusChanged) await emit(tx, { type: "compliance.changed", productId });
      return { productId, type, docStatus: body.status, productStatus: nextStatus, statusChanged };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // İzlenebilirlik ve geri çağırma (KAL-06)
  // ---------------------------------------------------------------------------------------------

  /** Bir mamul lotunun izlenebilirlik zinciri: hammadde/tedarikçi (geri), sipariş/müşteri (ileri), depo. */
  @Get("trace/:lotId")
  @RequirePermission("quality", "VIEW")
  async trace(@Param("lotId") lotId: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      include: { item: { select: { code: true, name: true } }, batch: { select: { id: true, number: true, consumptions: { include: { lot: { select: { id: true, lotNo: true, supplierLotNo: true, item: { select: { code: true, name: true } } } } } } } } },
    });
    if (!lot) throw new NotFoundException({ message: "Lot bulunamadı" });

    // Geri: tüketilen hammadde/ambalaj lotları → tedarikçi (GoodsReceiptLine → receipt → PO → supplier)
    const inputLots = lot.batch?.consumptions.map((c) => c.lot) ?? [];
    const receiptLines = inputLots.length
      ? await this.prisma.goodsReceiptLine.findMany({ where: { lotId: { in: inputLots.map((l) => l.id) } }, include: { receipt: { include: { order: { include: { supplier: { select: { name: true } } } } } } } })
      : [];
    const supplierByLot = new Map(receiptLines.map((rl) => [rl.lotId, rl.receipt.order.supplier.name]));
    const inputs = inputLots.map((l) => ({ lotId: l.id, lotNo: l.lotNo, itemCode: l.item.code, itemName: l.item.name, supplierLotNo: l.supplierLotNo, supplier: supplierByLot.get(l.id) ?? null }));

    // İleri: bu lotu içeren rezervasyonlar → sipariş → müşteri, kanal
    const reservations = await this.prisma.stockReservation.findMany({
      where: { lotId, orderLineId: { not: null } },
      include: { orderLine: { include: { order: { select: { id: true, number: true, customerId: true, customer: { select: { fullName: true } }, channel: { select: { name: true } } } } } } },
    });
    const orders = new Map<string, { orderId: string; number: string; customerId: string | null; customer: string | null; channel: string | null }>();
    for (const r of reservations) {
      const o = r.orderLine?.order;
      if (o && !orders.has(o.id)) orders.set(o.id, { orderId: o.id, number: o.number, customerId: o.customerId, customer: o.customer?.fullName ?? null, channel: o.channel?.name ?? null });
    }

    // Depo: bu lotun kalan bakiyeleri
    const balances = await this.prisma.stockBalance.findMany({ where: { lotId }, include: { location: { select: { code: true } } } });

    return {
      lot: { id: lot.id, lotNo: lot.lotNo, qcStatus: lot.qcStatus, itemCode: lot.item.code, itemName: lot.item.name },
      batch: lot.batch ? { id: lot.batch.id, number: lot.batch.number } : null,
      inputs,
      orders: [...orders.values()],
      affectedCustomers: new Set([...orders.values()].map((o) => o.customerId).filter(Boolean)).size,
      onHand: balances.map((b) => ({ location: b.location.code, qtyOnHand: b.qtyOnHand.toString() })),
    };
  }

  /**
   * KAL-06: geri çağırma. Simülasyon yalnızca etkilenenleri raporlar. Gerçekte ilgili lotlar
   * QUARANTINE'e alınır (lot.quarantined yayılır) ve etkilenen müşteri sayısı kaydedilir.
   * Bildirim metni ayrıca onayla gönderilir (otomatik gönderilmez).
   */
  @Post("recalls")
  @RequirePermission("quality", "APPROVE")
  @ApiZodBody(recallSchema)
  async recall(@Body(new ZodPipe(recallSchema)) body: RecallRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const lots = await this.prisma.lot.findMany({ where: { id: { in: body.lotIds } }, select: { id: true } });
    if (lots.length !== new Set(body.lotIds).size) throw new BadRequestException({ message: "Bir veya daha fazla lot bulunamadı" });
    const reservations = await this.prisma.stockReservation.findMany({ where: { lotId: { in: body.lotIds }, orderLineId: { not: null } }, include: { orderLine: { select: { order: { select: { customerId: true } } } } } });
    const affectedCustomers = new Set(reservations.map((r) => r.orderLine?.order.customerId).filter(Boolean)).size;

    return this.prisma.$transaction(async (tx) => {
      const recall = await tx.recall.create({ data: { lotIds: body.lotIds, reason: body.reason, isSimulation: body.isSimulation, affectedCustomers, status: body.isSimulation ? "SIMULATED" : "OPEN" } });
      if (!body.isSimulation) {
        for (const l of lots) {
          await setLotQcStatus(tx, { lotId: l.id, status: "QUARANTINE", reason: `Geri çağırma ${recall.id}: ${body.reason}`, userId: auth.userId, ...clientInfo(req) });
        }
        await writeAudit(tx, { userId: auth.userId, action: "recall.execute", entity: "Recall", entityId: recall.id, after: { lots: body.lotIds.length, affectedCustomers, reason: body.reason }, ...clientInfo(req) });
      }
      return { id: recall.id, isSimulation: body.isSimulation, lots: body.lotIds.length, affectedCustomers };
    });
  }
}
