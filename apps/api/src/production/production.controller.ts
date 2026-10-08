import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  applicableTests,
  consumeBatchReservations,
  createLot,
  emit,
  getSetting,
  openInspectionForLot,
  Prisma,
  recordMovement,
  releaseReservation,
  setSetting,
  reservableForItem,
  reserveFefo,
  setLotQcStatus,
  StockError,
  type Tx,
  writeAudit,
} from "@atelier/db";
import {
  type BatchAdvanceRequest,
  batchAdvanceSchema,
  type BatchQualityReleaseRequest,
  batchQualityReleaseSchema,
  type BatchCreateRequest,
  batchCreateSchema,
  type BatchOutputRequest,
  batchOutputSchema,
  type BatchStage,
  type RecipeRole,
  type RecipeTemplate,
  recipeTemplateSchema,
  type BatchStageRequest,
  batchStageSchema,
  type BatchUpdateRequest,
  batchUpdateSchema,
  costComponentForItem,
  effectiveUnits,
  expectedUnits,
  fillingBalance,
  gramsForPercents,
  gramsToUom,
  hourlyCost,
  intervalsOverlap,
  liquidCostPerMl,
  mlForGrams,
  percentsForGrams,
  productionHours,
  scaleRequirement,
  splitByConcentration,
  type ScheduleSlotRequest,
  scheduleSlotSchema,
  type ScheduleUpdateRequest,
  scheduleUpdateSchema,
  STAGE_FLOW,
  totalGramsFor,
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
  /** Eldeki ama kalite onayı bekleyen (karantina) miktar; üretimde kullanılamaz. */
  quarantineQty: string;
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
    plannedMl: { toString(): string } | null;
    essenceMl: { toString(): string } | null;
    baseMl: { toString(): string } | null;
    testerMl: { toString(): string };
    scrapMl: { toString(): string };
    macerationStart: Date | null;
    macerationDays: number | null;
    macerationPlace: string | null;
    bottleType: string | null;
    lotNo: string | null;
    densityGPerMl: { toString(): string } | null;
    totalGr: { toString(): string } | null;
    components: {
      itemId: string;
      role: string;
      massPct: { toString(): string };
      grams: { toString(): string };
      item: { code: string; name: string; uom: string };
    }[];
    createdAt: Date;
    product: { id: string; name: string; sku: string; volumeMl: number; item: { code: string } };
    formula: { id: string; code: string; version: number; concentrationPct: { toString(): string } };
  }) {
    // Kütlesel reçeteli parti gram (bileşenlerle); eski partiler hacimle (ml) ya da gramajla.
    const byMass = b.components.length > 0;
    const byVolume = !byMass && b.essenceMl != null && b.baseMl != null;
    const massEssence = b.components
      .filter((c) => c.role === "ESSENCE")
      .reduce((sum, c) => sum.plus(c.grams.toString()), new Prisma.Decimal(0));
    const massTotal = b.components.reduce((sum, c) => sum.plus(c.grams.toString()), new Prisma.Decimal(0));
    const essenceSrc = byMass ? massEssence : byVolume ? b.essenceMl : b.essenceGr;
    const baseSrc = byMass ? massTotal.minus(massEssence) : byVolume ? b.baseMl : b.baseGr;
    const essence = essenceSrc ? Number(essenceSrc.toString()) : 0;
    const base = baseSrc ? Number(baseSrc.toString()) : 0;
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
      plannedMl: b.plannedMl?.toString() ?? null,
      essenceMl: b.essenceMl?.toString() ?? null,
      baseMl: b.baseMl?.toString() ?? null,
      testerMl: b.testerMl.toString(),
      scrapMl: b.scrapMl.toString(),
      /** Karışım birimi: "g" (kütlesel reçete), "ml" (hacimle parti) ya da "gr" (eski gramajlı parti). */
      mixUnit: byMass ? "g" : byVolume ? "ml" : "gr",
      mixEssence: essenceSrc?.toString() ?? null,
      mixBase: baseSrc?.toString() ?? null,
      essencePct: total > 0 ? Number(((essence / total) * 100).toFixed(2)) : null,
      basePct: total > 0 ? Number(((base / total) * 100).toFixed(2)) : null,
      totalGr: byMass ? (b.totalGr?.toString() ?? massTotal.toFixed(2)) : total || null,
      lotNo: b.lotNo,
      densityGPerMl: b.densityGPerMl?.toString() ?? null,
      /** Kütlesel reçete: tartılacak bileşenler (rol, yüzde, gram). Eski partilerde boş. */
      components: b.components.map((c) => ({
        itemId: c.itemId,
        code: c.item.code,
        name: c.item.name,
        uom: c.item.uom,
        role: c.role,
        pct: c.massPct.toString(),
        grams: c.grams.toString(),
      })),
      concentrationPct: b.formula.concentrationPct.toString(),
      macerationDays: b.macerationDays,
      macerationPlace: b.macerationPlace,
      bottleType: b.bottleType,
      maceration,
      createdAt: b.createdAt.toISOString(),
      product: { id: b.product.id, name: b.product.name, sku: b.product.sku, itemCode: b.product.item.code, volumeMl: b.product.volumeMl },
      formula: { id: b.formula.id, code: b.formula.code, version: b.formula.version },
    };
  }

  private static readonly INCLUDE = {
    components: { orderBy: { sortOrder: "asc" as const }, include: { item: { select: { code: true, name: true, uom: true } } } },
    product: { select: { id: true, name: true, sku: true, volumeMl: true, item: { select: { code: true } } } },
    formula: { select: { id: true, code: true, version: true, concentrationPct: true } },
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
    const batch = await this.prisma.productionBatch.findUnique({
      where: { id },
      select: { id: true, plannedQty: true, plannedMl: true, productId: true, formulaId: true },
    });
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
        quarantineQty: l.quarantineQty,
        shortageQty: l.shortageQty,
        ok: l.shortageQty === "0",
      })),
    };
  }

  /**
   * Aktif BOM'u parti büyüklüğüne ölçekler ve her kalem için kullanılabilir stoku karşılaştırır.
   * Hacimle açılan partide etkin adet = ml ÷ şişe ml (kesirli; sıvı tam karşılanır); adet birimli
   * (ambalaj) satırlar yukarı tam sayıya yuvarlanır.
   */
  private async computeRequirements(
    db: Tx | PrismaService,
    batch: { id: string; plannedQty: number; plannedMl?: { toString(): string } | null; productId: string; formulaId: string },
  ) {
    const [bom, components] = await Promise.all([
      db.billOfMaterials.findFirst({
        where: { productId: batch.productId, formulaId: batch.formulaId, isActive: true },
        include: { lines: { include: { item: { select: { id: true, code: true, name: true, type: true } } } } },
      }),
      db.batchComponent.findMany({
        where: { batchId: batch.id },
        orderBy: { sortOrder: "asc" },
        include: { item: { select: { id: true, code: true, name: true, type: true, uom: true } } },
      }),
    ]);
    if (!bom && components.length === 0) return { batchSize: 0, hasBom: false, hasShortage: false, lines: [] as RequirementLine[] };
    let units: number | string = batch.plannedQty;
    if (batch.plannedMl != null) {
      const product = await db.product.findUnique({ where: { id: batch.productId }, select: { volumeMl: true } });
      if (product) units = effectiveUnits(batch.plannedMl.toString(), product.volumeMl);
    }
    // Kütlesel reçeteli parti: sıvı bileşenler partinin tartılacak gramından (kalemin KG/G biriminde);
    // BOM'dan yalnızca ambalaj (adet) satırları ölçeklenir.
    const needs: { itemId: string; code: string; name: string; type: string; uom: string; requiredQty: string }[] = [];
    for (const c of components) {
      if (c.item.uom !== "KG" && c.item.uom !== "G") continue;
      needs.push({ itemId: c.itemId, code: c.item.code, name: c.item.name, type: c.item.type, uom: c.item.uom, requiredQty: gramsToUom(c.grams.toString(), c.item.uom) });
    }
    for (const l of bom?.lines ?? []) {
      if (components.length > 0 && l.uom !== "PCS") continue;
      const scaled = scaleRequirement(l.qty.toString(), l.scrapPct.toString(), units, bom!.batchSize);
      needs.push({ itemId: l.itemId, code: l.item.code, name: l.item.name, type: l.item.type, uom: l.uom, requiredQty: l.uom === "PCS" ? new Prisma.Decimal(scaled).ceil().toString() : scaled });
    }
    const lines: RequirementLine[] = [];
    let hasShortage = false;
    for (const l of needs) {
      const requiredQty = l.requiredQty;
      // Kural 3: yalnızca serbest ve süresi geçmemiş lotlar (rezervasyonla aynı koşul).
      const { reservable: available, quarantine } = await reservableForItem(db as Tx, l.itemId);
      const shortage = new Prisma.Decimal(requiredQty).minus(available);
      const shortageQty = shortage.greaterThan(0) ? shortage.toDecimalPlaces(4).toString() : "0";
      if (shortageQty !== "0") hasShortage = true;
      lines.push({
        itemId: l.itemId,
        code: l.code,
        name: l.name,
        type: l.type,
        uom: l.uom,
        requiredQty,
        availableQty: available.toDecimalPlaces(4).toString(),
        quarantineQty: quarantine.toDecimalPlaces(4).toString(),
        shortageQty,
      });
    }
    return { batchSize: bom?.batchSize ?? 0, hasBom: true, hasShortage, lines };
  }

  /** Varsayılan kütlesel reçete şablonu (yeni ürün kurulumuna gelen oranlar + yoğunluk). */
  @Get("recipe-template")
  @RequirePermission("production", "VIEW")
  async recipeTemplate() {
    const [value, row] = await Promise.all([
      getSetting(this.prisma, "production.recipeTemplate"),
      this.prisma.systemSetting.findUnique({ where: { key: "production.recipeTemplate" }, select: { updatedAt: true } }),
    ]);
    return { ...value, updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  /**
   * Şablonu değiştirir (production:APPROVE). Yalnızca bundan sonra kurulan/güncellenen ürünleri etkiler;
   * kurulu formüller ve açık partiler değişmez. Değişiklik AuditLog'a yazılır (setting.change).
   */
  @Put("recipe-template")
  @RequirePermission("production", "APPROVE")
  @ApiZodBody(recipeTemplateSchema)
  async setRecipeTemplate(@Body(new ZodPipe(recipeTemplateSchema)) body: RecipeTemplate, @CurrentUser() auth: AuthContext) {
    await this.prisma.$transaction((tx) => setSetting(tx, "production.recipeTemplate", body, auth.userId));
    return body;
  }

  /**
   * Parti açma formu için ürünün reçetesi: kütlesel bileşenler (yüzde) + yoğunluk ve atanacak lot no.
   * Formül kütlesel değilse (eski) `mass: false` döner; form konsantrasyonla hacim bölmesine düşer.
   */
  @Get("recipe/:productId")
  @RequirePermission("production", "VIEW")
  async recipe(@Param("productId") productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        itemId: true,
        volumeMl: true,
        formula: {
          select: {
            id: true,
            status: true,
            concentrationPct: true,
            densityGPerMl: true,
            components: { orderBy: { sortOrder: "asc" }, include: { item: { select: { code: true, name: true, uom: true } } } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const f = product.formula;
    const mass = !!f && f.densityGPerMl != null && f.components.length > 0;
    return {
      productId: product.id,
      volumeMl: product.volumeMl,
      formulaStatus: f?.status ?? null,
      concentrationPct: f?.concentrationPct.toString() ?? null,
      mass,
      densityGPerMl: mass ? f!.densityGPerMl!.toString() : null,
      components: mass
        ? f!.components.map((c) => ({ itemId: c.itemId, code: c.item.code, name: c.item.name, uom: c.item.uom, role: c.role, pct: c.massPct.toString() }))
        : [],
      lotNoPreview: await this.nextLotNo(this.prisma as unknown as Tx, product.itemId, product.id, new Date()),
    };
  }

  @Post("batches")
  @RequirePermission("production", "CREATE")
  @ApiZodBody(batchCreateSchema)
  async create(@Body(new ZodPipe(batchCreateSchema)) body: BatchCreateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
      include: {
        formula: {
          select: {
            id: true,
            status: true,
            concentrationPct: true,
            densityGPerMl: true,
            components: { orderBy: { sortOrder: "asc" }, select: { itemId: true, role: true, massPct: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    if (!product.formula)
      throw new BadRequestException({ message: "Ürünün bağlı formülü yok. Önce ürün sayfasında 'Üretim kurulumu' yapın." });
    if (product.formula.status !== "APPROVED")
      throw new BadRequestException({ message: "Parti yalnızca onaylı formülle açılabilir (URT-01)" });
    // Hacimle parti: esans/baz formül konsantrasyonundan bölünür; adet = ⌊ml ÷ şişe ml⌋.
    const plannedQty = expectedUnits(body.plannedMl, product.volumeMl);
    if (plannedQty < 1)
      throw new BadRequestException({ message: `Hacim en az bir şişe (${product.volumeMl} ml) kadar olmalı` });
    // Kütlesel reçete: toplam gram = mL × yoğunluk, bileşen gramları yüzdeden (ya da elle girilen gramdan).
    const massRecipe = product.formula.densityGPerMl != null && product.formula.components.length > 0;
    const mass = massRecipe
      ? this.batchComponents(
          product.formula.components.map((c) => ({ itemId: c.itemId, role: c.role, pct: c.massPct.toString() })),
          body.plannedMl,
          body.densityGPerMl ?? product.formula.densityGPerMl!.toString(),
          body.components,
        )
      : null;
    const split = massRecipe ? null : splitByConcentration(body.plannedMl, product.formula.concentrationPct.toString());
    // URT-14: devam eden üretim doğrudan bir aşamada, geçmiş tarihle kaydedilebilir.
    const stage = body.startStage ?? "FORMULA_APPROVAL";
    const stageIdx = STAGE_FLOW.indexOf(stage);
    const startedAt = body.startedAt ?? new Date();
    const macerationStart =
      stageIdx >= STAGE_FLOW.indexOf("MACERATION")
        ? (body.macerationStart ?? (stage === "MACERATION" ? startedAt : null))
        : null;
    const isExisting = stage !== "FORMULA_APPROVAL";

    const id = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear() % 100;
      const count = await tx.productionBatch.count();
      const number = `P-${year}${String(count + 1).padStart(3, "0")}`;
      // Lot numarası parti açılırken atanır (L-YYAA-harf); dolum çıktısı bu numarayı taşır.
      const lotNo = await this.nextLotNo(tx, product.itemId, product.id, new Date());
      const batch = await tx.productionBatch.create({
        data: {
          number,
          lotNo,
          productId: product.id,
          formulaId: product.formula!.id,
          plannedQty,
          plannedMl: body.plannedMl,
          essenceMl: split?.essenceMl ?? null,
          baseMl: split?.baseMl ?? null,
          ...(mass
            ? {
                densityGPerMl: mass.densityGPerMl,
                totalGr: mass.totalGr,
                components: { create: mass.lines.map((l, i) => ({ itemId: l.itemId, role: l.role, massPct: l.pct, grams: l.grams, sortOrder: i })) },
              }
            : {}),
          macerationDays: body.macerationDays,
          macerationPlace: body.macerationPlace ?? null,
          bottleType: body.bottleType,
          stage,
          macerationStart,
          ownerId: auth.userId,
        },
      });
      await tx.productionStageLog.create({
        data: { batchId: batch.id, stage, startedAt, userId: auth.userId, note: isExisting ? "mevcut üretim kaydı" : null },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.create",
        entity: "ProductionBatch",
        entityId: batch.id,
        after: {
          number,
          product: product.sku,
          plannedMl: body.plannedMl,
          plannedQty,
          lotNo,
          concentrationPct: product.formula!.concentrationPct.toString(),
          essenceMl: split?.essenceMl ?? null,
          baseMl: split?.baseMl ?? null,
          densityGPerMl: mass?.densityGPerMl ?? null,
          totalGr: mass?.totalGr ?? null,
          components: mass?.lines.map((l) => ({ itemId: l.itemId, role: l.role, pct: l.pct, grams: l.grams })) ?? null,
          bottleType: body.bottleType,
          startStage: stage,
          startedAt: startedAt.toISOString(),
          macerationStart: macerationStart?.toISOString() ?? null,
          existingProduction: isExisting,
        },
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
      const b = await tx.productionBatch.findUnique({
        where: { id },
        include: {
          product: { select: { volumeMl: true } },
          formula: { select: { concentrationPct: true } },
          components: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!b) throw new NotFoundException({ message: "Parti bulunamadı" });
      const data: Record<string, unknown> = {};
      const byMass = b.components.length > 0;
      if (!byMass && (body.components !== undefined || body.densityGPerMl !== undefined))
        throw new BadRequestException({ message: "Bu parti kütlesel reçeteyle açılmadı; bileşen gramı düzeltilemez" });
      // Kütlesel reçete: hacim/yoğunluk/gram düzeltmesi bileşenleri yeniden hesaplar (tartımdan önce).
      let massChange: ReturnType<ProductionController["batchComponents"]> | null = null;
      if (byMass && (body.components !== undefined || body.densityGPerMl !== undefined || body.plannedMl !== undefined)) {
        const [reserved, consumed] = await Promise.all([
          tx.stockReservation.count({ where: { refType: "ProductionBatch", refId: id } }),
          tx.batchConsumption.count({ where: { batchId: id } }),
        ]);
        if (reserved + consumed > 0)
          throw new BadRequestException({ message: "Tartım için malzeme ayrıldı/tüketildi; reçete gramları artık değiştirilemez" });
        const density = body.densityGPerMl ?? b.densityGPerMl!.toString();
        const ml = body.plannedMl ?? (body.components ? null : b.plannedMl!.toString());
        massChange = this.batchComponents(
          b.components.map((c) => ({ itemId: c.itemId, role: c.role, pct: c.massPct.toString() })),
          ml,
          density,
          body.components,
        );
        const units = expectedUnits(massChange.plannedMl, b.product.volumeMl);
        if (units < 1) throw new BadRequestException({ message: `Hacim en az bir şişe (${b.product.volumeMl} ml) kadar olmalı` });
        data.plannedMl = massChange.plannedMl;
        data.plannedQty = units;
        data.densityGPerMl = massChange.densityGPerMl;
        data.totalGr = massChange.totalGr;
      }
      for (const k of ["plannedQty", "producedQty", "essenceGr", "baseGr", "macerationDays", "bottleType"] as const) {
        if (body[k] !== undefined) data[k] = body[k];
      }
      // Hacim düzeltmesi: adet ve esans/baz bölünmesi yeniden hesaplanır (açıkça verilen esans/baz önceliklidir).
      if (body.plannedMl !== undefined && !byMass) {
        const units = expectedUnits(body.plannedMl, b.product.volumeMl);
        if (units < 1) throw new BadRequestException({ message: `Hacim en az bir şişe (${b.product.volumeMl} ml) kadar olmalı` });
        const split = splitByConcentration(body.plannedMl, b.formula.concentrationPct.toString());
        data.plannedMl = body.plannedMl;
        data.plannedQty = units;
        data.essenceMl = split.essenceMl;
        data.baseMl = split.baseMl;
      }
      if (body.essenceMl !== undefined) data.essenceMl = body.essenceMl;
      if (body.baseMl !== undefined) data.baseMl = body.baseMl;
      if (body.macerationPlace !== undefined) data.macerationPlace = body.macerationPlace;
      if (body.macerationStart !== undefined) data.macerationStart = body.macerationStart;
      if (Object.keys(data).length === 0) return;
      await tx.productionBatch.update({ where: { id }, data });
      if (massChange) {
        for (const l of massChange.lines) {
          await tx.batchComponent.updateMany({ where: { batchId: id, itemId: l.itemId }, data: { massPct: l.pct, grams: l.grams } });
        }
      }
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.update",
        entity: "ProductionBatch",
        entityId: id,
        before: {
          essenceGr: b.essenceGr?.toString() ?? null,
          baseGr: b.baseGr?.toString() ?? null,
          plannedMl: b.plannedMl?.toString() ?? null,
          essenceMl: b.essenceMl?.toString() ?? null,
          baseMl: b.baseMl?.toString() ?? null,
          macerationDays: b.macerationDays,
          macerationPlace: b.macerationPlace,
          bottleType: b.bottleType,
          plannedQty: b.plannedQty,
          ...(massChange ? { components: b.components.map((c) => ({ itemId: c.itemId, pct: c.massPct.toString(), grams: c.grams.toString() })) } : {}),
        },
        after: {
          fields: Object.keys(data),
          ...(massChange ? { totalGr: massChange.totalGr, components: massChange.lines.map((l) => ({ itemId: l.itemId, pct: l.pct, grams: l.grams })) } : {}),
        },
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
      // Geçmiş üretimi işlerken aşamaya giriş tarihi geriye dönük girilebilir (URT-14).
      const now = body.startedAt ?? new Date();
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
        after: { stage: body.stage, note: body.note ?? null, startedAt: now.toISOString() },
        ...clientInfo(req),
      });
      await emit(tx, { type: "batch.stage_changed", batchId: id, stage: body.stage });
    });
    return { id, stage: body.stage };
  }

  /**
   * Partiyi siler (yanlış/deneme kaydı). Stoğa dokunmuş parti (malzeme tüketimi ya da çıktı lotu) silinmez;
   * bunun yerine aşaması "İptal" yapılır (lot/hareket izlenebilirliği korunur). Açık malzeme rezervasyonları
   * stoğa geri bırakılır. Silme AuditLog'a yazılır.
   */
  @Delete("batches/:id")
  @RequirePermission("production", "DELETE")
  async remove(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProductionBatch" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Parti bulunamadı" });
      const b = await tx.productionBatch.findUniqueOrThrow({ where: { id }, include: { product: { select: { sku: true } } } });
      const [consumed, outputs] = await Promise.all([
        tx.batchConsumption.count({ where: { batchId: id } }),
        tx.lot.count({ where: { batchId: id } }),
      ]);
      if (consumed + outputs > 0)
        throw new BadRequestException({
          message: "Bu partiden stok hareketi oluştu (malzeme tüketimi ya da dolum çıktısı); silinemez. Elle düzenle → Aşama: İptal yapın.",
        });
      const open = await tx.stockReservation.findMany({
        where: { refType: "ProductionBatch", refId: id, releasedAt: null, consumedAt: null },
        select: { id: true },
      });
      for (const r of open) await releaseReservation(tx, r.id);
      await tx.productionStageLog.deleteMany({ where: { batchId: id } });
      await tx.scheduleSlot.deleteMany({ where: { batchId: id } });
      await tx.batchCost.deleteMany({ where: { batchId: id } });
      await tx.batchComponent.deleteMany({ where: { batchId: id } });
      await tx.productionBatch.delete({ where: { id } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.delete",
        entity: "ProductionBatch",
        entityId: id,
        before: { number: b.number, product: b.product.sku, stage: b.stage, plannedQty: b.plannedQty, plannedMl: b.plannedMl?.toString() ?? null },
        after: { releasedReservations: open.length },
        ...clientInfo(req),
      });
      return { id, deleted: true, releasedReservations: open.length };
    });
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

      // URT-06: serbest bırakma yalnızca kalite onayıyla (lotlar serbest kalınca parti RELEASED olur).
      if (b.stage === "QUALITY_CONTROL")
        throw new BadRequestException({ message: "Parti kalite onayıyla serbest bırakılır; 'Kaliteyi onayla, satışa aç' bölümünü kullanın" });
      // URT-05: dolum dağılımı (stok/tester/fire) kaydedilmeden dolumdan çıkılmaz.
      if (b.stage === "FILLING") {
        const outputs = await tx.lot.count({ where: { batchId: b.id } });
        if (outputs === 0) throw new BadRequestException({ message: "Önce dolum dağılımını kaydedin (stoğa giden adet / tester / fire)" });
      }

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
  private async reserveMaterials(
    tx: Tx,
    batch: { id: string; plannedQty: number; plannedMl?: { toString(): string } | null; productId: string; formulaId: string },
    userId?: string | null,
  ) {
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
   * URT-05: dolum çıktısı (FILLING). Üç dağılım girilir:
   *  - `producedQty`: satılabilir stoğa giden adet → mamul lotu (QUARANTINE).
   *  - `testerMl`: testere ayrılan hacim → ürünün ayrı tester kalemine (SAMPLE · ML) kendi lotuyla (QUARANTINE).
   *    Tester satılamaz; satılabilir stoğa karışmaz. Birim maliyeti partinin ml başına sıvı maliyetidir.
   *  - `scrapMl`: fire hacmi (kayıt; stoğa girmez).
   * Lotlar `batch.completed` ile açılır (lot.received değil). Lot no: L-<YYAA>-<harf>.
   */
  @Post("batches/:id/output")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(batchOutputSchema)
  async output(@Param("id") id: string, @Body(new ZodPipe(batchOutputSchema)) body: BatchOutputRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProductionBatch" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Parti bulunamadı" });
      const b = await tx.productionBatch.findUniqueOrThrow({
        where: { id },
        include: { product: { select: { id: true, itemId: true, sku: true, name: true, volumeMl: true, testerItemId: true } } },
      });
      // Dolumda girilir; mevcut üretim sonraki aşamada kaydedildiyse etiket/kalite aşamasında da girilebilir (URT-14).
      if (!["FILLING", "LABEL_PACK", "QUALITY_CONTROL"].includes(b.stage))
        throw new BadRequestException({ message: "Çıktı dolum, etiket/paket ya da kalite kontrol aşamasında girilir" });
      // Tekrar girişi engeli: adet 0 olsa da (yalnızca tester) bu partiye ait çıktı lotu varsa girilmiştir.
      const existingOutput = await tx.lot.count({ where: { batchId: b.id } });
      if (b.producedQty > 0 || existingOutput > 0) throw new BadRequestException({ message: "Bu parti için çıktı zaten girildi" });

      const location = await this.finishedGoodsLocation(tx);
      const now = new Date();
      const testerMl = new Prisma.Decimal(body.testerMl);
      const scrapMl = new Prisma.Decimal(body.scrapMl);

      // MLY-02: parti kapanışında işçilik ve genel gider bileşenleri eklenir (aşama sürelerinden).
      const stages = await tx.productionStageLog.findMany({ where: { batchId: b.id }, select: { startedAt: true, endedAt: true } });
      const hours = productionHours(stages);
      const laborRate = await getSetting(tx, "costing.laborRatePerHour");
      const overheadRate = await getSetting(tx, "costing.overheadRatePerHour");
      const qtyD = new Prisma.Decimal(body.producedQty > 0 ? body.producedQty : 1);
      const laborUnit = new Prisma.Decimal(hourlyCost(hours, laborRate)).div(qtyD).toDecimalPlaces(4);
      const overheadUnit = new Prisma.Decimal(hourlyCost(hours, overheadRate)).div(qtyD).toDecimalPlaces(4);
      for (const [component, unit] of [["DIRECT_LABOR", laborUnit], ["OVERHEAD", overheadUnit]] as const) {
        await tx.batchCost.upsert({
          where: { batchId_component: { batchId: b.id, component } },
          update: { actual: unit },
          create: { batchId: b.id, component, standard: unit, actual: unit },
        });
      }
      // Mamul birim maliyeti = toplam tüketim maliyeti / üretilen adet (BatchCost bileşen toplamı).
      const costs = await tx.batchCost.findMany({ where: { batchId: b.id }, select: { component: true, actual: true } });
      const unitCost = costs.reduce((s, c) => s.plus(c.actual), new Prisma.Decimal(0));

      // 1) Satılabilir stok: mamul lotu
      let stockLot: { id: string; lotNo: string } | null = null;
      if (body.producedQty > 0) {
        const lotNo = await this.outputLotNo(tx, b.lotNo, b.product.itemId, b.product.id, now);
        const lot = await createLot(tx, { itemId: b.product.itemId, lotNo, mfgDate: now, qcStatus: "QUARANTINE" });
        await tx.lot.update({ where: { id: lot.id }, data: { batchId: b.id } });
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
          note: "Dolum · satılabilir stok",
        });
        stockLot = { id: lot.id, lotNo };
      }

      // 2) Tester stoğu: ürünün ayrı tester kalemi (satılamaz)
      let testerLot: { id: string; lotNo: string; unitCostPerMl: string | null } | null = null;
      if (testerMl.greaterThan(0)) {
        const testerItemId = await this.ensureTesterItem(tx, b.product, auth.userId, req);
        // Sıvı maliyeti (esans + alkol/su) toplamı ÷ parti hacmi = ml başına tester maliyeti.
        const liquidPerUnit = costs
          .filter((c) => c.component === "ESSENCE" || c.component === "ALCOHOL_WATER")
          .reduce((s, c) => s.plus(c.actual), new Prisma.Decimal(0));
        const perMl = liquidCostPerMl(liquidPerUnit.times(b.plannedQty).toString(), b.plannedMl?.toString() ?? null);
        const lotNo = await this.outputLotNo(tx, b.lotNo, testerItemId, null, now);
        const lot = await createLot(tx, { itemId: testerItemId, lotNo, mfgDate: now, qcStatus: "QUARANTINE" });
        await tx.lot.update({ where: { id: lot.id }, data: { batchId: b.id } });
        await recordMovement(tx, {
          type: "PRODUCTION_OUTPUT",
          itemId: testerItemId,
          lotId: lot.id,
          qty: testerMl.toString(),
          toLocationId: location.id,
          unitCost: perMl && new Prisma.Decimal(perMl).greaterThan(0) ? perMl : null,
          refType: "ProductionBatch",
          refId: b.id,
          userId: auth.userId,
          note: "Dolum · tester (satılamaz)",
        });
        testerLot = { id: lot.id, lotNo, unitCostPerMl: perMl };
      }

      const balance = b.plannedMl
        ? fillingBalance({
            plannedMl: b.plannedMl.toString(),
            volumeMl: b.product.volumeMl,
            producedQty: body.producedQty,
            testerMl: testerMl.toString(),
            scrapMl: scrapMl.toString(),
          })
        : null;

      await tx.productionBatch.update({
        where: { id },
        data: { producedQty: body.producedQty, testerMl: testerMl.toString(), scrapMl: scrapMl.toString() },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "batch.output",
        entity: "ProductionBatch",
        entityId: id,
        after: {
          stockLotNo: stockLot?.lotNo ?? null,
          producedQty: body.producedQty,
          testerLotNo: testerLot?.lotNo ?? null,
          testerMl: testerMl.toString(),
          scrapMl: scrapMl.toString(),
          scrapQty: body.scrapQty,
          unitCost: unitCost.toString(),
          testerCostPerMl: testerLot?.unitCostPerMl ?? null,
          differenceMl: balance?.differenceMl ?? null,
          note: body.note ?? null,
        },
        ...clientInfo(req),
      });
      const firstLot = stockLot ?? testerLot!;
      await emit(tx, { type: "batch.completed", batchId: b.id, outputLotId: firstLot.id });

      const warnings: string[] = [];
      if (balance && balance.differenceMl !== "0.00") {
        const diff = new Prisma.Decimal(balance.differenceMl);
        warnings.push(
          diff.greaterThan(0)
            ? `Partide ${balance.differenceMl} ml kayıt dışı kaldı (dağıtılan ${balance.distributedMl} ml / parti ${b.plannedMl!.toString()} ml).`
            : `Dağıtılan hacim partiden ${diff.abs().toFixed(2)} ml fazla (dağıtılan ${balance.distributedMl} ml / parti ${b.plannedMl!.toString()} ml).`,
        );
      }
      return {
        id,
        lotId: stockLot?.id ?? null,
        lotNo: stockLot?.lotNo ?? null,
        producedQty: body.producedQty,
        unitCost: unitCost.toFixed(4),
        tester: testerLot ? { lotId: testerLot.id, lotNo: testerLot.lotNo, ml: testerMl.toFixed(2), unitCostPerMl: testerLot.unitCostPerMl } : null,
        scrapMl: scrapMl.toFixed(2),
        warnings,
      };
    });
  }

  /**
   * Ürünün tester kalemi (SAMPLE · ML) yoksa açar ve ürüne bağlar. Kod: TS-<SKU> (çakışırsa sıra eki).
   * Testerler satılamaz; satılabilir mamul stoğundan ayrı tutulur.
   */
  private async ensureTesterItem(
    tx: Tx,
    product: { id: string; sku: string; name: string; testerItemId: string | null },
    userId: string,
    req: AuthedRequest,
  ): Promise<string> {
    if (product.testerItemId) return product.testerItemId;
    const base = product.sku.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "URUN";
    let code = `TS-${base.length >= 2 ? base : `${base}00`}`;
    for (let n = 2; await tx.item.findUnique({ where: { code }, select: { id: true } }); n++) {
      const suffix = String(n);
      code = `TS-${base.slice(0, 10 - suffix.length)}${suffix}`;
    }
    const item = await tx.item.create({
      data: { code, name: `Tester · ${product.name}`.slice(0, 120), type: "SAMPLE", uom: "ML" },
      select: { id: true },
    });
    await tx.product.update({ where: { id: product.id }, data: { testerItemId: item.id } });
    await writeAudit(tx, {
      userId,
      action: "product.tester_item",
      entity: "Product",
      entityId: product.id,
      after: { testerItemCode: code },
      ...clientInfo(req),
    });
    return item.id;
  }

  // ---------------------------------------------------------------------------------------------
  // Parti kalite onayı (tek adım, KAL-02 korunur)
  // ---------------------------------------------------------------------------------------------

  /** Partinin çıktı lotları (mamul + tester) ve her lota uygulanan kalite testleri. */
  @Get("batches/:id/quality")
  @RequirePermission("production", "VIEW")
  async quality(@Param("id") id: string) {
    const b = await this.prisma.productionBatch.findUnique({ where: { id }, select: { id: true, stage: true } });
    if (!b) throw new NotFoundException({ message: "Parti bulunamadı" });
    const lots = await this.prisma.lot.findMany({
      where: { batchId: id },
      orderBy: { lotNo: "asc" },
      select: {
        id: true,
        lotNo: true,
        qcStatus: true,
        item: { select: { code: true, name: true, type: true } },
        inspections: { select: { status: true, results: { select: { testId: true, passed: true } } } },
      },
    });
    const out = [];
    for (const lot of lots) {
      const tests = await applicableTests(this.prisma as unknown as Tx, lot.id);
      const passed = new Set(lot.inspections.flatMap((i) => i.results.filter((r) => r.passed).map((r) => r.testId)));
      out.push({
        lotId: lot.id,
        lotNo: lot.lotNo,
        qcStatus: lot.qcStatus,
        item: lot.item,
        tests: tests.map((t) => ({ id: t.id, code: t.code, name: t.name, passed: passed.has(t.id) })),
      });
    }
    return { stage: b.stage, lots: out };
  }

  /**
   * QUALITY_CONTROL aşamasında partinin karantinadaki lotlarını tek adımda serbest bırakır.
   * Her lotun uygulanabilir tüm testleri `passedTestIds` içinde olmalı (KAL-02); sonuçlar kaydedilir,
   * muayene PASSED, lot RELEASED olur → `lot.released` (worker partiyi RELEASED yapar, URT-06).
   * Kalan bir test varsa bu yol kullanılmaz; Kalite modülünde sonuç girilip DÖF açılır.
   */
  @Post("batches/:id/quality-release")
  @RequirePermission("quality", "APPROVE")
  @ApiZodBody(batchQualityReleaseSchema)
  async qualityRelease(
    @Param("id") id: string,
    @Body(new ZodPipe(batchQualityReleaseSchema)) body: BatchQualityReleaseRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.productionBatch.findUnique({ where: { id }, select: { id: true, number: true, stage: true } });
      if (!b) throw new NotFoundException({ message: "Parti bulunamadı" });
      if (b.stage !== "QUALITY_CONTROL")
        throw new BadRequestException({ message: "Kalite onayı yalnızca Kalite kontrol aşamasında verilir" });
      const lots = await tx.lot.findMany({ where: { batchId: id, qcStatus: "QUARANTINE" }, select: { id: true, lotNo: true } });
      if (lots.length === 0) throw new BadRequestException({ message: "Serbest bırakılacak karantina lotu yok (önce dolum çıktısı girilmeli)" });
      const confirmed = new Set(body.passedTestIds);

      // Önce tüm lotlar doğrulanır: eksik onay varsa hiçbir lot serbest bırakılmaz.
      const plan: { lotId: string; lotNo: string; tests: { id: string; code: string }[] }[] = [];
      for (const lot of lots) {
        const tests = await applicableTests(tx, lot.id);
        const missing = tests.filter((t) => !confirmed.has(t.id));
        if (missing.length > 0)
          throw new BadRequestException({
            message: `${lot.lotNo}: tüm testler onaylanmadan serbest bırakılamaz (KAL-02). Eksik: ${missing.map((t) => t.code).join(", ")}`,
          });
        const failed = await tx.qcInspection.findFirst({ where: { lotId: lot.id, status: "FAILED" }, select: { id: true } });
        if (failed) throw new BadRequestException({ message: `${lot.lotNo}: başarısız muayene var; Kalite modülünden DÖF ile ilerleyin` });
        plan.push({ lotId: lot.id, lotNo: lot.lotNo, tests });
      }

      const now = new Date();
      for (const p of plan) {
        if (p.tests.length > 0) {
          const inspectionId =
            (await tx.qcInspection.findFirst({ where: { lotId: p.lotId }, select: { id: true } }))?.id ??
            (await openInspectionForLot(tx, p.lotId));
          if (inspectionId) {
            const testIds = p.tests.map((t) => t.id);
            await tx.qcResult.deleteMany({ where: { inspectionId, testId: { in: testIds } } });
            await tx.qcResult.createMany({ data: testIds.map((testId) => ({ inspectionId, testId, passed: true, testedById: auth.userId })) });
            await tx.qcInspection.update({ where: { id: inspectionId }, data: { status: "PASSED", releasedById: auth.userId, releasedAt: now } });
          }
        }
        await setLotQcStatus(tx, {
          lotId: p.lotId,
          status: "RELEASED",
          reason: body.note ?? `Parti ${b.number} kalite onayı: ${p.tests.map((t) => t.code).join(", ") || "test gerektirmeyen lot"}`,
          userId: auth.userId,
          ...clientInfo(req),
        });
      }
      return { id, released: plan.map((p) => p.lotNo) };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Hat planı (URT-07)
  // ---------------------------------------------------------------------------------------------

  /** Kaynaklar (tank, dolum/paket hattı). */
  @Get("resources")
  @RequirePermission("production", "VIEW")
  async resources() {
    const rows = await this.prisma.resource.findMany({ orderBy: { code: "asc" } });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind, capacityPerHour: r.capacityPerHour?.toString() ?? null }));
  }

  /** Hat planı slotları (tarih aralığı). */
  @Get("schedule")
  @RequirePermission("production", "VIEW")
  async schedule(@Query("from") from?: string, @Query("to") to?: string) {
    const fromD = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const toD = to ? new Date(to) : new Date(Date.now() + 21 * 86_400_000);
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { startAt: { lt: toD }, endAt: { gt: fromD } },
      orderBy: { startAt: "asc" },
      include: { resource: { select: { code: true, name: true, kind: true } }, batch: { select: { number: true, product: { select: { name: true } } } } },
    });
    return slots.map((s) => ({
      id: s.id,
      resourceId: s.resourceId,
      resource: s.resource,
      batchId: s.batchId,
      batch: { number: s.batch.number, product: s.batch.product.name },
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      isTentative: s.isTentative,
    }));
  }

  /** Slot ekler. Kesin (isTentative=false) slot, aynı kaynakta kesin bir slotla çakışamaz (URT-07). */
  @Post("schedule")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(scheduleSlotSchema)
  async createSlot(@Body(new ZodPipe(scheduleSlotSchema)) body: ScheduleSlotRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const [resource, batch] = await Promise.all([
        tx.resource.findUnique({ where: { id: body.resourceId }, select: { id: true } }),
        tx.productionBatch.findUnique({ where: { id: body.batchId }, select: { id: true } }),
      ]);
      if (!resource) throw new NotFoundException({ message: "Kaynak bulunamadı" });
      if (!batch) throw new NotFoundException({ message: "Parti bulunamadı" });
      await this.assertNoConflict(tx, body.resourceId, body.startAt, body.endAt, body.isTentative, null);
      const slot = await tx.scheduleSlot.create({ data: { resourceId: body.resourceId, batchId: body.batchId, startAt: body.startAt, endAt: body.endAt, isTentative: body.isTentative } });
      await writeAudit(tx, { userId: auth.userId, action: "schedule.create", entity: "ScheduleSlot", entityId: slot.id, after: { resourceId: body.resourceId, batchId: body.batchId, startAt: body.startAt.toISOString(), endAt: body.endAt.toISOString() }, ...clientInfo(req) });
      return { id: slot.id };
    });
  }

  /** Slotu yeniden planlar (sürükle-bırak). Kapasite ihlali engellenir (URT-07). */
  @Patch("schedule/:slotId")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(scheduleUpdateSchema)
  async updateSlot(@Param("slotId") slotId: string, @Body(new ZodPipe(scheduleUpdateSchema)) body: ScheduleUpdateRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.scheduleSlot.findUnique({ where: { id: slotId } });
      if (!slot) throw new NotFoundException({ message: "Slot bulunamadı" });
      const resourceId = body.resourceId ?? slot.resourceId;
      const startAt = body.startAt ?? slot.startAt;
      const endAt = body.endAt ?? slot.endAt;
      const isTentative = body.isTentative ?? slot.isTentative;
      if (endAt.getTime() <= startAt.getTime()) throw new BadRequestException({ message: "Bitiş başlangıçtan sonra olmalı" });
      await this.assertNoConflict(tx, resourceId, startAt, endAt, isTentative, slotId);
      await tx.scheduleSlot.update({ where: { id: slotId }, data: { resourceId, startAt, endAt, isTentative } });
      await writeAudit(tx, { userId: auth.userId, action: "schedule.update", entity: "ScheduleSlot", entityId: slotId, before: { resourceId: slot.resourceId, startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() }, after: { resourceId, startAt: startAt.toISOString(), endAt: endAt.toISOString() }, ...clientInfo(req) });
      return { id: slotId };
    });
  }

  /** URT-07: kesin slot aynı kaynakta başka bir kesin slotla çakışamaz. Tentative slotlar çakışabilir. */
  private async assertNoConflict(tx: Tx, resourceId: string, startAt: Date, endAt: Date, isTentative: boolean, excludeId: string | null) {
    if (isTentative) return; // provisional slotlar kapasite ihlali saymaz
    const candidates = await tx.scheduleSlot.findMany({
      where: { resourceId, isTentative: false, startAt: { lt: endAt }, endAt: { gt: startAt }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      include: { batch: { select: { number: true } } },
    });
    const clash = candidates.find((c) => intervalsOverlap(startAt, endAt, c.startAt, c.endAt));
    if (clash) throw new ConflictException({ message: `Kaynak bu aralıkta dolu (parti ${clash.batch.number}); kapasite aşılamaz (URT-07)` });
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

  /**
   * Sıradaki lot no: L-<YYAA>-<harf> (A…Z, AA, AB…). Ay içinde bu kalemin lotları ve ürünün açık
   * partilerine atanmış numaralar dolu sayılır (iki parti aynı lotu almaz).
   */
  private async nextLotNo(tx: Tx, itemId: string, productId: string | null, now: Date) {
    const yy = String(now.getUTCFullYear() % 100).padStart(2, "0");
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const prefix = `L-${yy}${mm}-`;
    const [lots, batches] = await Promise.all([
      tx.lot.findMany({ where: { itemId, lotNo: { startsWith: prefix } }, select: { lotNo: true } }),
      productId ? tx.productionBatch.findMany({ where: { productId, lotNo: { startsWith: prefix } }, select: { lotNo: true } }) : Promise.resolve([]),
    ]);
    const used = new Set([...lots.map((l) => l.lotNo), ...batches.map((b) => b.lotNo)]);
    for (let n = 0; ; n++) {
      const candidate = prefix + lotLetters(n);
      if (!used.has(candidate)) return candidate;
    }
  }

  /** Dolum çıktısı lotu: partinin atanmış lot numarası (kalemde zaten varsa sıradaki). */
  private async outputLotNo(tx: Tx, batchLotNo: string | null, itemId: string, productId: string | null, now: Date) {
    if (batchLotNo) {
      const taken = await tx.lot.findUnique({ where: { itemId_lotNo: { itemId, lotNo: batchLotNo } }, select: { id: true } });
      if (!taken) return batchLotNo;
    }
    return this.nextLotNo(tx, itemId, productId, now);
  }

  /**
   * Parti reçetesi: formül yüzdelerinden (toplam = mL × yoğunluk) ya da elle girilen gramlardan
   * (toplam = gramların toplamı, yüzde = gram ÷ toplam; hacim = toplam ÷ yoğunluk) bileşen satırları.
   */
  private batchComponents(
    recipe: { itemId: string; role: RecipeRole; pct: string }[],
    plannedMl: string | null,
    densityGPerMl: string,
    grams?: { itemId: string; grams: string }[],
  ) {
    if (grams) {
      const byItem = new Map(grams.map((g) => [g.itemId, g.grams]));
      if (byItem.size !== grams.length || recipe.length !== grams.length || recipe.some((r) => !byItem.has(r.itemId)))
        throw new BadRequestException({ message: "Gram listesi reçete bileşenleriyle uyuşmuyor (her bileşen bir kez)" });
      const ordered = recipe.map((r) => byItem.get(r.itemId)!);
      const { totalGr, pcts } = percentsForGrams(ordered);
      return {
        densityGPerMl,
        totalGr,
        plannedMl: plannedMl ?? mlForGrams(totalGr, densityGPerMl),
        lines: recipe.map((r, i) => ({ itemId: r.itemId, role: r.role, pct: pcts[i]!, grams: new Prisma.Decimal(ordered[i]!).toFixed(2) })),
      };
    }
    if (plannedMl == null) throw new BadRequestException({ message: "Hacim (ml) gerekli" });
    const totalGr = totalGramsFor(plannedMl, densityGPerMl);
    const g = gramsForPercents(totalGr, recipe.map((r) => r.pct));
    return {
      densityGPerMl,
      totalGr,
      plannedMl,
      lines: recipe.map((r, i) => ({ itemId: r.itemId, role: r.role, pct: r.pct, grams: g[i]! })),
    };
  }
}

/** 0 → A, 25 → Z, 26 → AA, 27 → AB … */
function lotLetters(n: number): string {
  let out = "";
  let x = n;
  do {
    out = String.fromCharCode(65 + (x % 26)) + out;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return out;
}
