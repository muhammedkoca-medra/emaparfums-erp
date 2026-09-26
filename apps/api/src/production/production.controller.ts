import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, writeAudit } from "@atelier/db";
import {
  type BatchAdvanceRequest,
  batchAdvanceSchema,
  type BatchCreateRequest,
  batchCreateSchema,
  type BatchStage,
  type BatchStageRequest,
  batchStageSchema,
  type BatchUpdateRequest,
  batchUpdateSchema,
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
}
