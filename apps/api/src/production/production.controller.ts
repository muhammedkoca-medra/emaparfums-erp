import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { availableForItem, consumeBatchReservations, createLot, emit, Prisma, recordMovement, reserveFefo, StockError, type Tx, writeAudit } from "@atelier/db";
import {
  type BatchAdvanceRequest,
  batchAdvanceSchema,
  type BatchCreateRequest,
  batchCreateSchema,
  type BatchOutputRequest,
  batchOutputSchema,
  type BatchStage,
  type BatchStageRequest,
  batchStageSchema,
  type BatchUpdateRequest,
  batchUpdateSchema,
  costComponentForItem,
  scaleRequirement,
  STAGE_FLOW,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Üretim partileri (F3-01 · docs/03-moduller/uretim.md). EMA karışım kartı: esans + parfüm bazı,
 * demlenme (maserasyon) süresi/yeri, şişe türü.
 *  - URT-01: parti yalnızca APPROVED formül sürümüyle açılır.
 *  - URT-04: maserasyon süresi dolmadan sonraki aşamaya geçilemez; erken geçiş yönetici (production:APPROVE)
 *    gerekçesiyle yapılır.
 *  - URT-08: her aşama değişikliği ProductionStageLog ve batch.stage_changed yazar.
 */
interface RequirementLine {
  itemId: string;
  code: string;
  name: string;
  type: string;
  uom: string;
  requiredQty: string;
  availableQty: string;
  shortageQty: string;
}

@ApiTags("production")
@Controller("production")
export class ProductionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  private view(b: {
    id: string;
    number: string;
    stage: string;
    plannedQty: number;
    producedQty: number;
    essenceGr: { toString(): string } | null;
    baseGr: { toString(): string } | null;
    macerationStart: Date | null;
    macerationDays: number | null;
    macerationPlace: string | null;
    bottleType: string | null;
    createdAt: Date;
    product: { id: string; name: string; sku: string; item: { code: string } };
    formula: { id: string; code: string; version: number };
  }) {
    const essence = b.essenceGr ? Number(b.essenceGr.toString()) : 0;
    const base = b.baseGr ? Number(b.baseGr.toString()) : 0;
    const total = essence + base;
    // Maserasyon: geçen/kalan gün.
    let maceration: { start: string; days: number; elapsedMs: number; remainingMs: number; done: boolean } | null = null;
    if (b.macerationStart && b.macerationDays != null) {
      const endMs = b.macerationStart.getTime() + b.macerationDays * 86_400_000;
      const remainingMs = endMs - Date.now();
      maceration = {
        start: b.macerationStart.toISOString(),
        days: b.macerationDays,
        elapsedMs: Date.now() - b.macerationStart.getTime(),
        remainingMs,
        done: remainingMs <= 0,
      };
    }
    return {
      id: b.id,
      number: b.number,
      stage: b.stage,
      plannedQty: b.plannedQty,
      producedQty: b.producedQty,
      essenceGr: b.essenceGr?.toString() ?? null,
      baseGr: b.baseGr?.toString() ?? null,
      essencePct: total > 0 ? Number(((essence / total) * 100).toFixed(2)) : null,
      basePct: total > 0 ? Number(((base / total) * 100).toFixed(2)) : null,
      totalGr: total || null,
      macerationDays: b.macerationDays,
      macerationPlace: b.macerationPlace,
      bottleType: b.bottleType,
      maceration,
      createdAt: b.createdAt.toISOString(),
      product: { id: b.product.id, name: b.product.name, sku: b.product.sku, itemCode: b.product.item.code },
      formula: b.formula,
    };
  }

  private static readonly INCLUDE = {
    product: { select: { id: true, name: true, sku: true, item: { select: { code: true } } } },
    formula: { select: { id: true, code: true, version: true } },
  };

  @Get("batches")
  @RequirePermission("production", "VIEW")
  async list(@Query("stage") stage?: string) {
    const batches = await this.prisma.productionBatch.findMany({
      where: stage ? { stage: stage as BatchStage } : {},
      orderBy: { createdAt: "desc" },
      include: ProductionController.INCLUDE,
    });
    return batches.map((b) => this.view(b));
  }

  @Get("batches/:id")
  @RequirePermission("production", "VIEW")
  async get(@Param("id") id: string) {
    const b = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: {
        ...ProductionController.INCLUDE,
        stageLogs: { orderBy: { startedAt: "asc" } },
      },
    });
    if (!b) throw new NotFoundException({ message: "Parti bulunamadı" });
    return { ...this.view(b), stageLogs: b.stageLogs.map((l) => ({ stage: l.stage, startedAt: l.startedAt.toISOString(), endedAt: l.endedAt?.toISOString() ?? null, note: l.note })) };
  }

  /**
   * URT-02: parti adedine ölçeklenmiş malzeme ihtiyacı ve stok uygunluğu. Aktif BOM'dan hesaplanır;
   * eksik kalemler işaretlenir (parti FORMULA_APPROVAL'da kalır, satın alma önerilir).
   */
  @Get("batches/:id/materials")
  @RequirePermission("production", "VIEW")
  async materials(@Param("id") id: string) {
    const batch = await this.prisma.productionBatch.findUnique({ where: { id }, select: { id: true, plannedQty: true, productId: true, formulaId: true } });
    if (!batch) throw new NotFoundException({ message: "Parti bulunamadı" });
    const req = await this.computeRequirements(this.prisma, batch);
    return {
      batchSize: req.batchSize,
      hasBom: req.hasBom,
      hasShortage: req.hasShortage,
      lines: req.lines.map((l) => ({
        itemId: l.itemId,
        code: l.code,
        name: l.name,
        uom: l.uom,
        requiredQty: l.requiredQty,
        availableQty: l.availableQty,
        shortageQty: l.shortageQty,
        ok: l.shortageQty === "0",
      })),
    };
  }

  /** Aktif BOM'u parti adedine ölçekler ve her kalem için kullanılabilir stoku karşılaştırır. */
  private async computeRequirements(
    db: Tx | PrismaService,
    batch: { id: string; plannedQty: number; productId: string; formulaId: string },
  ) {
    const bom = await db.billOfMaterials.findFirst({
      where: { productId: batch.productId, formulaId: batch.formulaId, isActive: true },
      include: { lines: { include: { item: { select: { id: true, code: true, name: true, type: true } } } } },
    });
    if (!bom) return { batchSize: 0, hasBom: false, hasShortage: false, lines: [] as RequirementLine[] };
    const lines: RequirementLine[] = [];
    let hasShortage = false;
    for (const l of bom.lines) {
      const requiredQty = scaleRequirement(l.qty.toString(), l.scrapPct.toString(), batch.plannedQty, bom.batchSize);
      const available = await availableForItem(db as Tx, l.itemId);
      const shortage = new Prisma.Decimal(requiredQty).minus(available);
      const shortageQty = shortage.greaterThan(0) ? shortage.toDecimalPlaces(4).toString() : "0";
      if (shortageQty !== "0") hasShortage = true;
      lines.push({
        itemId: l.itemId,
        code: l.item.code,
        name: l.item.name,
        type: l.item.type,
        uom: l.uom,
        requiredQty,
        availableQty: available.toDecimalPlaces(4).toString(),
        shortageQty,
      });
    }
    return { batchSize: bom.batchSize, hasBom: true, hasShortage, lines };
  }

  @Post("batches")
  @RequirePermission("production", "CREATE")
  @ApiZodBody(batchCreateSchema)
  async create(@Body(new ZodPipe(batchCreateSchema)) body: BatchCreateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
      include: { formula: { select: { id: true, status: true } } },
    });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    if (!product.formula) throw new BadRequestException({ message: "Ürünün bağlı formülü yok" });
    if (product.formula.status !== "APPROVED")
      throw new BadRequestException({ message: "Parti yalnızca onaylı formülle açılabilir (URT-01)" });

    const id = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear() % 100;
      const count = await tx.productionBatch.count();
      const number = `P-${year}${String(count + 1).padStart(3, "0")}`;
      const batch = await tx.productionBatch.create({
        data: {
          number,
          productId: product.id,
          formulaId: product.formula!.id,
          plannedQty: body.plannedQty,
          essenceGr: body.essenceGr,
          baseGr: body.baseGr,
          macerationDays: body.macerationDays,
          macerationPlace: body.macerationPlace ?? null,
          bottleType: body.bottleType,
          stage: "FORMULA_APPROVAL",
          ownerId: auth.userId,
        },
      });
      await tx.productionStageLog.create({ data: { batchId: batch.id, stage: "FORMULA_APPROVAL", startedAt: new Date(), userId: auth.userId } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.create",
        entity: "ProductionBatch",
        entityId: batch.id,
        after: { number, product: product.sku, plannedQty: body.plannedQty, essenceGr: body.essenceGr, baseGr: body.baseGr, bottleType: body.bottleType },
        ...clientInfo(req),
      });
      return batch.id;
    });
    return { id };
  }

  /** Parti değerlerini elle düzenler (esans/baz gramaj, demlenme süresi/yeri/başlangıç, şişe, adet). */
  @Patch("batches/:id")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(batchUpdateSchema)
  async update(
    @Param("id") id: string,
    @Body(new ZodPipe(batchUpdateSchema)) body: BatchUpdateRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const b = await tx.productionBatch.findUnique({ where: { id } });
      if (!b) throw new NotFoundException({ message: "Parti bulunamadı" });
      const data: Record<string, unknown> = {};
      for (const k of ["plannedQty", "producedQty", "essenceGr", "baseGr", "macerationDays", "bottleType"] as const) {
        if (body[k] !== undefined) data[k] = body[k];
      }
      if (body.macerationPlace !== undefined) data.macerationPlace = body.macerationPlace;
      if (body.macerationStart !== undefined) data.macerationStart = body.macerationStart;
      if (Object.keys(data).length === 0) return;
      await tx.productionBatch.update({ where: { id }, data });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.update",
        entity: "ProductionBatch",
        entityId: id,
        before: { essenceGr: b.essenceGr?.toString() ?? null, baseGr: b.baseGr?.toString() ?? null, macerationDays: b.macerationDays, macerationPlace: b.macerationPlace, bottleType: b.bottleType, plannedQty: b.plannedQty },
        after: { fields: Object.keys(data) },
        ...clientInfo(req),
      });
    });
    return { id };
  }

  /** Aşamayı manuel ayarlar (süreç düzeltme). Serbest geçiş; ProductionStageLog + olay yazar (URT-08). */
  @Patch("batches/:id/stage")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(batchStageSchema)
  async setStage(
    @Param("id") id: string,
    @Body(new ZodPipe(batchStageSchema)) body: BatchStageRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const b = await tx.productionBatch.findUnique({ where: { id } });
      if (!b) throw new NotFoundException({ message: "Parti bulunamadı" });
      if (b.stage === body.stage) return;
      const now = new Date();
      await tx.productionStageLog.updateMany({ where: { batchId: id, stage: b.stage, endedAt: null }, data: { endedAt: now } });
      await tx.productionBatch.update({
        where: { id },
        data: {
          stage: body.stage,
          ...(body.stage === "MACERATION" && !b.macerationStart ? { macerationStart: now } : {}),
        },
      });
      await tx.productionStageLog.create({ data: { batchId: id, stage: body.stage, startedAt: now, userId: auth.userId, note: body.note ?? "manuel düzeltme" } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.stage.manual",
        entity: "ProductionBatch",
        entityId: id,
        before: { stage: b.stage },
        after: { stage: body.stage, note: body.note ?? null },
        ...clientInfo(req),
      });
      await emit(tx, { type: "batch.stage_changed", batchId: id, stage: body.stage });
    });
    return { id, stage: body.stage };
  }

  /** Sonraki aşamaya geçer. Maserasyona girişte sayaç başlar; süre dolmadan çıkış yönetici gerekçesiyle. */
  @Post("batches/:id/advance")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(batchAdvanceSchema)
  async advance(
    @Param("id") id: string,
    @Body(new ZodPipe(batchAdvanceSchema)) body: BatchAdvanceRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProductionBatch" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Parti bulunamadı" });
      const b = await tx.productionBatch.findUniqueOrThrow({ where: { id } });
      const idx = STAGE_FLOW.indexOf(b.stage as BatchStage);
      if (idx < 0 || idx >= STAGE_FLOW.length - 1)
        throw new BadRequestException({ message: "Bu aşamadan ileri geçilemez" });
      const next = STAGE_FLOW[idx + 1]!;

      // URT-04: maserasyon kilidi
      if (b.stage === "MACERATION") {
        const endMs = (b.macerationStart?.getTime() ?? 0) + (b.macerationDays ?? 0) * 86_400_000;
        if (Date.now() < endMs) {
          if (!body.overrideReason)
            throw new BadRequestException({ message: "Demlenme süresi dolmadan geçilemez. Erken geçiş için gerekçe gerekli (URT-04)." });
          const canOverride = (await this.permissions.forUser(auth.userId)).has("production:APPROVE");
          if (!canOverride) throw new ForbiddenException({ message: "Erken geçiş yalnızca yönetici (production:APPROVE) onayıyla yapılır" });
        }
      }

      // URT-02/03: tartım & karışıma girişte hammaddeler FEFO ile rezerve edilir (eksikse geçiş engellenir).
      if (next === "WEIGHING_MIXING") await this.reserveMaterials(tx, b, auth.userId);
      // URT-03: tartım & karışım tamamlanınca (çıkışta) tüketim + maliyet yazılır.
      if (b.stage === "WEIGHING_MIXING") await this.consumeAndCost(tx, b.id, b.plannedQty, auth.userId);

      const now = new Date();
      await tx.productionStageLog.updateMany({ where: { batchId: id, stage: b.stage, endedAt: null }, data: { endedAt: now } });
      await tx.productionBatch.update({
        where: { id },
        data: {
          stage: next,
          ...(next === "MACERATION" ? { macerationStart: now } : {}),
        },
      });
      await tx.productionStageLog.create({ data: { batchId: id, stage: next, startedAt: now, userId: auth.userId, note: body.overrideReason ?? null } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.advance",
        entity: "ProductionBatch",
        entityId: id,
        before: { stage: b.stage },
        after: { stage: next, overrideReason: body.overrideReason ?? null },
        ...clientInfo(req),
      });
      await emit(tx, { type: "batch.stage_changed", batchId: id, stage: next });
      return next;
    });
    return { id, stage: result };
  }

  /** URT-02/03: partinin hammaddelerini FEFO ile rezerve eder. Eksik varsa geçişi engeller; tekrar çağrıda idempotenttir. */
  private async reserveMaterials(tx: Tx, batch: { id: string; plannedQty: number; productId: string; formulaId: string }, userId?: string | null) {
    const req = await this.computeRequirements(tx, batch);
    // Aktif BOM yoksa (yalnızca esans/baz karışım kartıyla çalışılan parti) rezervasyon/tüketim atlanır.
    if (!req.hasBom) return;
    // Idempotent: bu parti için açık rezervasyon varsa yeniden ayırma.
    const already = await tx.stockReservation.count({ where: { refType: "ProductionBatch", refId: batch.id, releasedAt: null, consumedAt: null } });
    if (already > 0) return;
    if (req.hasShortage) {
      const missing = req.lines.filter((l) => l.shortageQty !== "0").map((l) => `${l.code} (eksik ${l.shortageQty} ${l.uom})`).join(", ");
      throw new BadRequestException({ message: `Yetersiz malzeme; parti tartım aşamasına alınamaz (URT-02): ${missing}` });
    }
    try {
      for (const l of req.lines) {
        await reserveFefo(tx, { itemId: l.itemId, qty: l.requiredQty, refType: "ProductionBatch", refId: batch.id, userId, note: `Üretim partisi ${batch.id}` });
      }
    } catch (e) {
      if (e instanceof StockError) throw new BadRequestException({ message: e.message });
      throw e;
    }
  }

  /** URT-03: partinin rezervasyonlarını tüketir (PRODUCTION_CONSUME + BatchConsumption) ve maliyeti bileşen bazında yazar. */
  private async consumeAndCost(tx: Tx, batchId: string, plannedQty: number, userId?: string | null) {
    const results = await consumeBatchReservations(tx, { batchId, userId });
    if (results.length === 0) return;
    const items = await tx.item.findMany({ where: { id: { in: results.map((r) => r.itemId) } }, select: { id: true, code: true, name: true, type: true } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const totals = new Map<string, Prisma.Decimal>();
    for (const r of results) {
      const item = byId.get(r.itemId);
      if (!item) continue;
      const comp = costComponentForItem({ code: item.code, type: item.type, name: item.name });
      totals.set(comp, (totals.get(comp) ?? new Prisma.Decimal(0)).plus(r.lineCost));
    }
    const qty = new Prisma.Decimal(plannedQty > 0 ? plannedQty : 1);
    for (const [component, total] of totals) {
      const perUnit = total.dividedBy(qty).toDecimalPlaces(4);
      await tx.batchCost.upsert({
        where: { batchId_component: { batchId, component: component as Prisma.BatchCostCreateInput["component"] } },
        update: { actual: perUnit },
        create: { batchId, component: component as Prisma.BatchCostCreateInput["component"], standard: perUnit, actual: perUnit },
      });
    }
  }

  /**
   * URT-05: dolum çıktısı. FILLING aşamasında üretilen adet girilir; mamul lotu QUARANTINE açılır
   * (batch.completed olayı ile, lot.received değil). Lot no: L-<YYAA>-<harf>. PRODUCTION_OUTPUT hareketi yazılır.
   */
  @Post("batches/:id/output")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(batchOutputSchema)
  async output(@Param("id") id: string, @Body(new ZodPipe(batchOutputSchema)) body: BatchOutputRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProductionBatch" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Parti bulunamadı" });
      const b = await tx.productionBatch.findUniqueOrThrow({ where: { id }, include: { product: { select: { itemId: true, sku: true } } } });
      if (b.stage !== "FILLING") throw new BadRequestException({ message: "Çıktı yalnızca Dolum (FILLING) aşamasında girilir" });
      if (b.producedQty > 0) throw new BadRequestException({ message: "Bu parti için çıktı zaten girildi" });

      const location = await this.finishedGoodsLocation(tx);
      const now = new Date();
      const lotNo = await this.nextOutputLotNo(tx, b.product.itemId, now);
      const lot = await createLot(tx, { itemId: b.product.itemId, lotNo, mfgDate: now, qcStatus: "QUARANTINE" });
      await tx.lot.update({ where: { id: lot.id }, data: { batchId: b.id } });

      // Mamul birim maliyeti = toplam tüketim maliyeti / üretilen adet (BatchCost bileşen toplamı).
      const costs = await tx.batchCost.findMany({ where: { batchId: b.id }, select: { actual: true } });
      const unitCost = costs.reduce((s, c) => s.plus(c.actual), new Prisma.Decimal(0));

      await recordMovement(tx, {
        type: "PRODUCTION_OUTPUT",
        itemId: b.product.itemId,
        lotId: lot.id,
        qty: body.producedQty,
        toLocationId: location.id,
        unitCost: unitCost.greaterThan(0) ? unitCost : null,
        refType: "ProductionBatch",
        refId: b.id,
        userId: auth.userId,
      });
      await tx.productionBatch.update({ where: { id }, data: { producedQty: body.producedQty } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.output",
        entity: "ProductionBatch",
        entityId: id,
        after: { lotNo, producedQty: body.producedQty, scrapQty: body.scrapQty, unitCost: unitCost.toString() },
        ...clientInfo(req),
      });
      await emit(tx, { type: "batch.completed", batchId: b.id, outputLotId: lot.id });
      return { id, lotId: lot.id, lotNo, producedQty: body.producedQty, unitCost: unitCost.toFixed(4) };
    });
  }

  /** Mamul deposundaki ilk lokasyon (ETICARET → ANA → herhangi). */
  private async finishedGoodsLocation(tx: Tx) {
    const preferred = ["ETICARET", "ANA"];
    for (const code of preferred) {
      const loc = await tx.location.findFirst({ where: { warehouse: { code } }, orderBy: { pickSequence: "asc" } });
      if (loc) return loc;
    }
    const any = await tx.location.findFirst({ orderBy: { pickSequence: "asc" } });
    if (!any) throw new BadRequestException({ message: "Mamul için lokasyon bulunamadı; önce depo tanımlayın" });
    return any;
  }

  /** L-<YYAA>-<harf>: ay içinde bu kalem için sıradaki harf (A, B, …). */
  private async nextOutputLotNo(tx: Tx, itemId: string, now: Date) {
    const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const prefix = `L-${yy}${mm}-`;
    const count = await tx.lot.count({ where: { itemId, lotNo: { startsWith: prefix } } });
    const letter = String.fromCharCode(65 + (count % 26));
    return `${prefix}${letter}`;
  }
}
