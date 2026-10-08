import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, getSetting, Prisma, type Tx, writeAudit } from "@atelier/db";
import {
  checkIfraLimits,
  computeSalesLock,
  formulaCodeForSku,
  type ProductionSetupRequest,
  productionSetupSchema,
  type RecipeRole,
  recipeBomQty,
  SETUP_BATCH_SIZE,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { PrismaService } from "../prisma.service.js";

type ItemChoice = ProductionSetupRequest["components"][number]["item"];
const MASS_UOMS: readonly string[] = ["KG", "G"];
const ROLE_LABEL: Record<RecipeRole, string> = { ESSENCE: "Esans", ALCOHOL: "Etil alkol", WATER: "Saf su", GLYCERIN: "Gliserin", OTHER: "Bileşen" };

/**
 * Hızlı üretim kurulumu — kütlesel reçete (esans, alkol, su, gliserin… kütle yüzdesiyle + yoğunluk).
 * Ürün sayfasından tek adımda:
 *  - Formül: FormulaComponent satırları + yoğunluk; konsantre (FormulaLine) esans kalemleri,
 *    konsantrasyon = esans payları toplamı. Yetki varsa onaylanır (URT-09 IFRA kontrolü
 *    onaydan önce), yoksa onaya gönderilir. Aynı koddaki önceki onaylı sürüm ARCHIVED olur.
 *  - Reçete (BOM, 1.000 adet): her bileşen kütle biriminde (KG/G) + seçilen ambalaj (adet).
 *  - Bileşen kalemleri kütleyle tutulur; hacim birimli (L/ML) kalem hiç stok hareketi görmediyse KG'a çevrilir.
 *  - Ürün yeni onaylı formüle bağlanır (URT-01 için parti açılabilir hale gelir).
 * Formül değişikliği AuditLog yazar (kural 7); formül değişince geçerli etiket onayı düşer (KAL-07).
 */
@ApiTags("production")
@Controller("production/setup")
export class ProductionSetupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  /** Ürünün mevcut üretim kurulumu + seçilebilir kalemler. */
  @Get(":productId")
  @RequirePermission("production", "VIEW")
  async get(@Param("productId") productId: string, @CurrentUser() auth: AuthContext) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        sku: true,
        name: true,
        volumeMl: true,
        formula: {
          select: {
            id: true,
            code: true,
            version: true,
            status: true,
            concentrationPct: true,
            ifraCategory: true,
            densityGPerMl: true,
            lines: { select: { percentage: true, item: { select: { id: true, code: true, name: true, uom: true } } } },
            components: {
              orderBy: { sortOrder: "asc" },
              select: { role: true, massPct: true, item: { select: { id: true, code: true, name: true, uom: true } } },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const bom = product.formula
      ? await this.prisma.billOfMaterials.findFirst({
          where: { productId, formulaId: product.formula.id, isActive: true },
          select: {
            id: true,
            batchSize: true,
            lines: { select: { qty: true, uom: true, item: { select: { id: true, code: true, name: true, type: true } } } },
          },
        })
      : null;
    const [raw, packaging, perms, template] = await Promise.all([
      this.prisma.item.findMany({
        where: { type: "RAW_MATERIAL" },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, uom: true, _count: { select: { movements: true } } },
      }),
      this.prisma.item.findMany({
        where: { type: "PACKAGING", uom: "PCS" },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      this.permissions.forUser(auth.userId),
      getSetting(this.prisma, "production.recipeTemplate"),
    ]);
    // Kütle birimli kalemler seçilebilir; hacim birimli ama hiç hareketi olmayan kalem KG'a çevrilerek kullanılabilir.
    const materials = raw
      .filter((i) => MASS_UOMS.includes(i.uom) || (i.uom !== "PCS" && i._count.movements === 0))
      .map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom, convertsToKg: !MASS_UOMS.includes(i.uom) }));
    return {
      product: { id: product.id, sku: product.sku, name: product.name, volumeMl: product.volumeMl },
      formula: product.formula
        ? {
            id: product.formula.id,
            code: product.formula.code,
            version: product.formula.version,
            status: product.formula.status,
            concentrationPct: product.formula.concentrationPct.toString(),
            ifraCategory: product.formula.ifraCategory,
            densityGPerMl: product.formula.densityGPerMl?.toString() ?? null,
            lines: product.formula.lines.map((l) => ({ percentage: l.percentage.toString(), item: l.item })),
            components: product.formula.components.map((c) => ({ role: c.role, pct: c.massPct.toString(), item: c.item })),
          }
        : null,
      bom: bom
        ? {
            id: bom.id,
            batchSize: bom.batchSize,
            lines: bom.lines.map((l) => ({ qty: l.qty.toString(), uom: l.uom, item: l.item })),
          }
        : null,
      options: { materials, packaging },
      template,
      suggestedFormulaCode: formulaCodeForSku(product.sku),
      canApprove: perms.has("production:APPROVE"),
      canCreateItems: perms.has("stock:CREATE"),
    };
  }

  /** Formül + reçeteyi oluşturur (ya da yeni sürümle günceller) ve ürüne bağlar. */
  @Post(":productId")
  @RequirePermission("production", "CREATE")
  @ApiZodBody(productionSetupSchema)
  async setup(
    @Param("productId") productId: string,
    @Body(new ZodPipe(productionSetupSchema)) body: ProductionSetupRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const perms = await this.permissions.forUser(auth.userId);
    const canApprove = perms.has("production:APPROVE");
    const wantsNewItem = body.components.some((c) => "newItem" in c.item);
    if (wantsNewItem && !perms.has("stock:CREATE"))
      throw new ForbiddenException({ message: "Yeni hammadde kartı açmak için stok oluşturma yetkisi gerekir" });

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, name: true, volumeMl: true, status: true, formulaId: true },
      });
      if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });

      const resolved: { id: string; code: string; uom: "KG" | "G"; role: RecipeRole; pct: string }[] = [];
      for (const c of body.components) {
        const item = await this.resolveMaterial(tx, c.item, ROLE_LABEL[c.role], auth, req);
        if (resolved.some((r) => r.id === item.id))
          throw new BadRequestException({ message: `${item.code}: aynı kalem reçetede iki kez kullanılamaz` });
        resolved.push({ ...item, role: c.role, pct: c.pct });
      }
      // Konsantrasyon = esans payları toplamı; konsantre (FormulaLine) esansların kendi içindeki payı.
      const essences = resolved.filter((r) => r.role === "ESSENCE");
      const concentration = essences.reduce((sum, e) => sum.plus(e.pct), new Prisma.Decimal(0));
      const concentrateLines = essences.map((e) => ({
        itemId: e.id,
        code: e.code,
        percentage: new Prisma.Decimal(e.pct).times(100).dividedBy(concentration).toDecimalPlaces(4).toString(),
      }));

      const packIds = [...new Set(body.packagingItemIds)];
      const packaging = packIds.length
        ? await tx.item.findMany({ where: { id: { in: packIds } }, select: { id: true, code: true, type: true, uom: true } })
        : [];
      if (packaging.length !== packIds.length) throw new BadRequestException({ message: "Ambalaj kalemlerinden biri bulunamadı" });
      const badPack = packaging.find((p) => p.type !== "PACKAGING" || p.uom !== "PCS");
      if (badPack) throw new BadRequestException({ message: `${badPack.code}: ambalaj kalemi (adet birimli) olmalı` });

      // --- Formül (tek satır: esans %100) ---
      const code = formulaCodeForSku(product.sku);
      const open = await tx.formula.findFirst({ where: { code, status: { in: ["DRAFT", "IN_REVIEW"] } }, select: { version: true } });
      if (open)
        throw new ConflictException({
          message: `${code} formülünün onay bekleyen bir taslağı var (v${open.version}). Önce Formüller ekranından onaylayın ya da reddedin.`,
        });
      const max = await tx.formula.aggregate({ where: { code }, _max: { version: true } });
      const version = (max._max.version ?? 0) + 1;
      const ifraCategory = body.ifraCategory ?? null;

      if (canApprove) {
        // URT-09: IFRA madde limiti onaydan önce (limitler parametrik).
        const limits = await getSetting(tx, "ifra.limits");
        const violations = checkIfraLimits(
          concentrateLines.map((l) => ({ itemId: l.itemId, code: l.code, percentage: l.percentage })),
          concentration.toString(),
          ifraCategory,
          limits,
        );
        if (violations.length)
          throw new BadRequestException({
            message: `IFRA limiti aşıldı; formül onaylanamaz (URT-09): ${violations.map((v) => `${v.code} son üründe %${v.finalPct} > %${v.limit}`).join("; ")}`,
          });
      }

      const formula = await tx.formula.create({
        data: {
          code,
          version,
          name: product.name,
          concentrationPct: concentration.toString(),
          densityGPerMl: body.densityGPerMl,
          ifraCategory,
          status: canApprove ? "APPROVED" : "IN_REVIEW",
          ...(canApprove ? { approvedById: auth.userId, approvedAt: new Date() } : {}),
          lines: { create: concentrateLines.map((l) => ({ itemId: l.itemId, percentage: l.percentage })) },
          components: { create: resolved.map((r, i) => ({ itemId: r.id, role: r.role, massPct: r.pct, sortOrder: i })) },
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: version === 1 ? "formula.create" : "formula.version",
        entity: "Formula",
        entityId: formula.id,
        after: {
          code,
          version,
          concentrationPct: concentration.toString(),
          densityGPerMl: body.densityGPerMl,
          ifraCategory,
          components: resolved.map((r) => ({ role: r.role, item: r.code, massPct: r.pct })),
          via: "production.setup",
        },
        ...clientInfo(req),
      });

      let archived: string[] = [];
      if (canApprove) {
        const previous = await tx.formula.findMany({ where: { code, status: "APPROVED", id: { not: formula.id } }, select: { id: true } });
        archived = previous.map((p) => p.id);
        if (archived.length) await tx.formula.updateMany({ where: { id: { in: archived } }, data: { status: "ARCHIVED" } });
        await writeAudit(tx, {
          userId: auth.userId,
          action: "formula.approve",
          entity: "Formula",
          entityId: formula.id,
          before: { status: "IN_REVIEW", archived },
          after: { status: "APPROVED", via: "production.setup" },
          ...clientInfo(req),
        });
      } else {
        await writeAudit(tx, {
          userId: auth.userId,
          action: "formula.submit",
          entity: "Formula",
          entityId: formula.id,
          before: { status: "DRAFT" },
          after: { status: "IN_REVIEW", via: "production.setup" },
          ...clientInfo(req),
        });
      }

      // --- Ürüne bağla: onaylıysa ya da ürünün hiç formülü yoksa (onaydan sonra parti açılabilir) ---
      const previousFormulaId = product.formulaId;
      const linked = canApprove || !previousFormulaId;
      if (linked) await tx.product.update({ where: { id: product.id }, data: { formulaId: formula.id } });

      // KAL-07: geçerli bir etiket onayı varsa formül değişince düşer; ürün durumu yeniden hesaplanır.
      if (linked && previousFormulaId && previousFormulaId !== formula.id) {
        const label = await tx.complianceDocument.findUnique({
          where: { productId_type: { productId: product.id, type: "LABEL_APPROVAL" } },
          select: { status: true },
        });
        if (label?.status === "VALID") {
          await tx.complianceDocument.update({
            where: { productId_type: { productId: product.id, type: "LABEL_APPROVAL" } },
            data: { status: "EXPIRED" },
          });
          const docs = await tx.complianceDocument.findMany({ where: { productId: product.id }, select: { type: true, status: true } });
          const next = computeSalesLock(product.status, docs);
          if (next !== product.status) await tx.product.update({ where: { id: product.id }, data: { status: next } });
          await emit(tx, { type: "compliance.changed", productId: product.id });
        }
      }

      // --- Reçete (1.000 adet): bileşenler kütle biriminde, ambalaj adedi ---
      await tx.billOfMaterials.updateMany({ where: { productId: product.id, isActive: true }, data: { isActive: false } });
      const lines: Prisma.BomLineCreateWithoutBomInput[] = [
        ...resolved.map((r) => ({
          item: { connect: { id: r.id } },
          qty: recipeBomQty(product.volumeMl, body.densityGPerMl, r.pct, r.uom, SETUP_BATCH_SIZE),
          uom: r.uom,
          scrapPct: "0",
        })),
        ...packaging.map((p) => ({ item: { connect: { id: p.id } }, qty: String(SETUP_BATCH_SIZE), uom: "PCS" as const, scrapPct: "0" })),
      ];
      const bom = await tx.billOfMaterials.create({
        data: { productId: product.id, formulaId: formula.id, batchSize: SETUP_BATCH_SIZE, isActive: true, lines: { create: lines } },
        select: { id: true, lines: { select: { qty: true, uom: true, item: { select: { code: true, name: true } } } } },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "bom.create",
        entity: "BillOfMaterials",
        entityId: bom.id,
        after: { product: product.sku, formula: `${code} v${version}`, batchSize: SETUP_BATCH_SIZE, lines: bom.lines.map((l) => ({ item: l.item.code, qty: l.qty.toString(), uom: l.uom })) },
        ...clientInfo(req),
      });
      await emit(tx, { type: "product.updated", productId: product.id, fields: ["formula"] });

      return {
        formula: { id: formula.id, code, version, status: canApprove ? "APPROVED" : "IN_REVIEW" },
        linked,
        archived: archived.length,
        bom: { id: bom.id, batchSize: SETUP_BATCH_SIZE, lines: bom.lines.map((l) => ({ code: l.item.code, name: l.item.name, qty: l.qty.toString(), uom: l.uom })) },
      };
    });
  }

  /**
   * Reçete bileşeni kalemi: var olanı doğrula (hammadde · KG/G) ya da yenisini aç (hammadde · KG).
   * Hacim birimli (L/ML) kalem hiç stok hareketi görmediyse KG'a çevrilir (denetime yazılır);
   * hareketi varsa çevrilemez (stok miktarı bozulur).
   */
  private async resolveMaterial(tx: Tx, choice: ItemChoice, label: string, auth: AuthContext, req: AuthedRequest) {
    if ("itemId" in choice) {
      const item = await tx.item.findUnique({ where: { id: choice.itemId }, select: { id: true, code: true, type: true, uom: true } });
      if (!item) throw new BadRequestException({ message: `${label} kalemi bulunamadı` });
      if (item.type !== "RAW_MATERIAL") throw new BadRequestException({ message: `${item.code}: ${label} bir hammadde olmalı` });
      if (item.uom === "KG" || item.uom === "G") return { id: item.id, code: item.code, uom: item.uom };
      const moved = await tx.stockMovement.count({ where: { itemId: item.id } });
      if (moved > 0 || item.uom === "PCS")
        throw new BadRequestException({
          message: `${item.code}: reçete gramla çalışır; kalem kütle birimiyle (KG ya da G) tutulmalı. Bu kalemin ${item.uom} birimli stok hareketi olduğu için çevrilemez — yeni bir KG kalemi açın.`,
        });
      await tx.item.update({ where: { id: item.id }, data: { uom: "KG" } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "item.uom_convert",
        entity: "Item",
        entityId: item.id,
        before: { uom: item.uom },
        after: { uom: "KG", via: "production.setup" },
        ...clientInfo(req),
      });
      return { id: item.id, code: item.code, uom: "KG" as const };
    }
    const taken = await tx.item.findUnique({ where: { code: choice.newItem.code }, select: { id: true } });
    if (taken) throw new BadRequestException({ message: `Kalem kodu zaten kullanılıyor: ${choice.newItem.code}. Listeden seçin.` });
    const item = await tx.item.create({
      data: { code: choice.newItem.code, name: choice.newItem.name, type: "RAW_MATERIAL", uom: "KG" },
      select: { id: true, code: true },
    });
    await writeAudit(tx, {
      userId: auth.userId,
      action: "item.create",
      entity: "Item",
      entityId: item.id,
      after: { code: item.code, name: choice.newItem.name, type: "RAW_MATERIAL", uom: "KG", via: "production.setup" },
      ...clientInfo(req),
    });
    return { id: item.id, code: item.code, uom: "KG" as const };
  }
}
