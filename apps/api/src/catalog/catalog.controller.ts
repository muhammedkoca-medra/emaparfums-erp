import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Db, emit, Prisma, type Tx, writeAudit } from "@atelier/db";
import {
  BOTTLE_MODELS,
  catalogQuerySchema,
  type ItemCreateRequest,
  itemCreateSchema,
  type ItemUpdateRequest,
  itemUpdateSchema,
  type ProductCreateRequest,
  productCreateSchema,
  type ProductFullCreateRequest,
  productFullCreateSchema,
  type ProductScentRequest,
  productScentSchema,
  type ProductUpdateRequest,
  productUpdateSchema,
} from "@atelier/shared";
import { z } from "zod";
import { Audited } from "../audit/audited.decorator.js";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { PrismaService } from "../prisma.service.js";
import { decodeImageDataUrl, removeProductImages, saveProductImage } from "./product-image.js";

/** Görsel yükleme gövdesi: base64 data URL (JSON içinde). */
const productImageSchema = z.object({ dataUrl: z.string().trim().min(1).max(6_000_000) });
type ProductImageRequest = z.infer<typeof productImageSchema>;

/**
 * VRG-04: vergi kategorisi TaxRule'da tanımlı olmalı; GTİP öneki kuralla uyuşmuyorsa uyarı.
 * Oran burada kullanılmaz (hesap packages/shared/src/tax.ts'te, oran TaxRule'dan).
 */
async function taxCategoryCheck(prisma: Db, category: string, gtip: string): Promise<string[]> {
  const rules = await prisma.taxRule.findMany({ where: { category }, select: { gtipPrefix: true } });
  if (rules.length === 0) {
    throw new BadRequestException({ message: `Vergi kategorisi tanımlı değil: ${category}` });
  }
  const prefixes = rules.map((r) => r.gtipPrefix).filter((p): p is string => Boolean(p));
  const digits = gtip.replace(/\D/g, "");
  if (prefixes.length > 0 && !prefixes.some((p) => digits.startsWith(p.replace(/\D/g, "")))) {
    return [`GTİP (${gtip}) "${category}" kategorisinin GTİP önekiyle (${prefixes.join(", ")}) uyuşmuyor`];
  }
  return [];
}

const loadProduct = (prisma: Db, id: string) =>
  prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      sku: true,
      barcode: true,
      name: true,
      concentration: true,
      volumeMl: true,
      gtip: true,
      taxCategory: true,
      status: true,
    },
  });

/** Kalem ve ürün kartları (F1-01). Kalem: stok izni; ürün (ticari kart): satış izni; koku profili: scent izni. */
@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---- Kalemler ----

  @Get("items")
  @RequirePermission("stock", "VIEW")
  @ApiZodQuery(catalogQuerySchema)
  items(@Query(new ZodPipe(catalogQuerySchema)) q: z.infer<typeof catalogQuerySchema>) {
    return this.prisma.item.findMany({
      where: {
        ...(q.type ? { type: q.type } : {}),
        ...(q.search
          ? {
              OR: [
                { code: { contains: q.search, mode: "insensitive" } },
                { name: { contains: q.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        uom: true,
        minStock: true,
        reorderQty: true,
        shelfLifeDays: true,
        storageNote: true,
        isHazardous: true,
        product: { select: { id: true, sku: true } },
      },
    });
  }

  @Post("items")
  @RequirePermission("stock", "CREATE")
  @Audited({ action: "item.create", entity: "Item" })
  @ApiZodBody(itemCreateSchema)
  createItem(@Body(new ZodPipe(itemCreateSchema)) body: ItemCreateRequest) {
    return this.prisma.item.create({ data: body, select: { id: true, code: true } });
  }

  @Patch("items/:id")
  @RequirePermission("stock", "EDIT")
  @Audited({ action: "item.update", entity: "Item", idParam: "id" })
  @ApiZodBody(itemUpdateSchema)
  async updateItem(@Param("id") id: string, @Body(new ZodPipe(itemUpdateSchema)) body: ItemUpdateRequest) {
    const exists = await this.prisma.item.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException({ message: "Kalem bulunamadı" });
    return this.prisma.item.update({ where: { id }, data: body, select: { id: true } });
  }

  // ---- Ürünler ----

  /** Şişe modelleri + bağlı ambalaj kaleminin stoğu (ürün bazlı şişeleme + stok girişi). */
  @Get("bottles")
  @RequirePermission("sales", "VIEW")
  async bottles() {
    const items = await this.prisma.item.findMany({
      where: { code: { in: BOTTLE_MODELS.map((b) => b.itemCode) } },
      select: { id: true, code: true, name: true, uom: true, minStock: true },
    });
    const byCode = new Map(items.map((i) => [i.code, i]));
    const sums = await this.prisma.stockBalance.groupBy({
      by: ["itemId"],
      where: { itemId: { in: items.map((i) => i.id) } },
      _sum: { qtyOnHand: true, qtyReserved: true },
    });
    const stockBy = new Map(sums.map((s) => [s.itemId, s._sum]));
    const usage = await this.prisma.product.groupBy({ by: ["bottleModel"], _count: { _all: true }, where: { bottleModel: { not: null } } });
    const usageBy = new Map(usage.map((u) => [u.bottleModel, u._count._all]));
    return BOTTLE_MODELS.map((m) => {
      const item = byCode.get(m.itemCode) ?? null;
      const st = item ? stockBy.get(item.id) : undefined;
      const onHand = st?.qtyOnHand ?? new Prisma.Decimal(0);
      const reserved = st?.qtyReserved ?? new Prisma.Decimal(0);
      return {
        code: m.code,
        name: m.name,
        objUrl: m.objUrl,
        glass: m.glass,
        volumeMl: m.volumeMl,
        item: item ? { id: item.id, code: item.code, name: item.name, uom: item.uom } : null,
        stock: item ? { onHand: onHand.toString(), reserved: reserved.toString(), available: onHand.minus(reserved).toString(), uom: item.uom } : null,
        productCount: usageBy.get(m.code) ?? 0,
      };
    });
  }

  @Get("products")
  @RequirePermission("sales", "VIEW")
  async products() {
    const rows = await this.prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        concentration: true,
        volumeMl: true,
        gtip: true,
        taxCategory: true,
        status: true,
        itemId: true,
        item: { select: { id: true, code: true } },
        formula: { select: { id: true, code: true, version: true, status: true } },
        media: { where: { role: "NOTES_CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true }, take: 1 },
      },
    });
    const availableByItem = await this.availableByItem(rows.map((r) => r.itemId));
    return rows.map(({ media, itemId, ...r }) => ({
      ...r,
      imageUrl: media[0]?.url ?? null,
      inStock: (availableByItem.get(itemId) ?? 0) > 0,
    }));
  }

  /** Verilen mamul kalemler için kullanılabilir (eldeki − rezerve) miktarı toplar. Stok var/yok rozeti için. */
  private async availableByItem(itemIds: string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const sums = await this.prisma.stockBalance.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds } },
      _sum: { qtyOnHand: true, qtyReserved: true },
    });
    return new Map(
      sums.map((s) => {
        const onHand = s._sum.qtyOnHand ?? new Prisma.Decimal(0);
        const reserved = s._sum.qtyReserved ?? new Prisma.Decimal(0);
        return [s.itemId, onHand.minus(reserved).toNumber()] as const;
      }),
    );
  }

  @Get("products/:id")
  @RequirePermission("sales", "VIEW")
  async product(@Param("id") id: string, @CurrentUser() auth: AuthContext) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, code: true, name: true } },
        formula: {
          select: { id: true, code: true, version: true, name: true, status: true, concentrationPct: true },
        },
        notes: { include: { note: true }, orderBy: [{ tier: "asc" }] },
        accords: { orderBy: { score: "desc" } },
        boms: {
          where: { isActive: true },
          select: { id: true, batchSize: true, _count: { select: { lines: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const perms = await this.permissions.forUser(auth.userId);
    return {
      ...p,
      notes: p.notes.map((n) => ({ name: n.note.name, family: n.note.family, tier: n.tier })),
      canEditScent: perms.has("scent:EDIT"),
      canSeeFormula: perms.has("production:VIEW"),
    };
  }

  /**
   * Ürün genel bakış (görsel merkez): stok, fiyat, formül ve hammadde stoğu tek yerde.
   * Formül ve hammadde stoğu ticari gizli (production:VIEW). Oran/karar burada yapılmaz; okunur.
   */
  @Get("products/:id/overview")
  @RequirePermission("sales", "VIEW")
  async overview(@Param("id") id: string, @CurrentUser() auth: AuthContext) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, code: true, name: true, uom: true, minStock: true } },
        formula: { select: { id: true, code: true, version: true, name: true, status: true, concentrationPct: true } },
        media: { where: { role: "NOTES_CARD" }, orderBy: { sortOrder: "asc" }, select: { url: true }, take: 1 },
      },
    });
    if (!p) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const perms = await this.permissions.forUser(auth.userId);
    const canFormula = perms.has("production:VIEW");

    const bal = await this.prisma.stockBalance.aggregate({
      where: { itemId: p.itemId },
      _sum: { qtyOnHand: true, qtyReserved: true },
    });
    const onHand = bal._sum.qtyOnHand ?? new Prisma.Decimal(0);
    const reserved = bal._sum.qtyReserved ?? new Prisma.Decimal(0);

    const priceRow = await this.prisma.priceListItem.findFirst({
      where: { productId: id, validFrom: { lte: new Date() } },
      orderBy: { validFrom: "desc" },
      include: { priceList: { select: { currency: true, pricesIncludeTax: true } } },
    });

    let rawMaterials: { code: string; name: string; uom: string; onHand: string; minStock: string | null; belowMin: boolean; pct: string }[] | null =
      null;
    if (canFormula && p.formula) {
      const lines = await this.prisma.formulaLine.findMany({
        where: { formulaId: p.formula.id },
        include: { item: { select: { id: true, code: true, name: true, uom: true, minStock: true } } },
        orderBy: { percentage: "desc" },
      });
      const sums = await this.prisma.stockBalance.groupBy({
        by: ["itemId"],
        where: { itemId: { in: lines.map((l) => l.itemId) } },
        _sum: { qtyOnHand: true },
      });
      const onHandBy = new Map(sums.map((s) => [s.itemId, s._sum.qtyOnHand ?? new Prisma.Decimal(0)]));
      rawMaterials = lines.map((l) => {
        const oh = onHandBy.get(l.itemId) ?? new Prisma.Decimal(0);
        return {
          code: l.item.code,
          name: l.item.name,
          uom: l.item.uom,
          onHand: oh.toString(),
          minStock: l.item.minStock?.toString() ?? null,
          belowMin: l.item.minStock ? oh.lessThan(l.item.minStock) : false,
          pct: l.percentage.toString(),
        };
      });
    }

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      concentration: p.concentration,
      volumeMl: p.volumeMl,
      status: p.status,
      taxCategory: p.taxCategory,
      bottleModel: p.bottleModel,
      imageUrl: p.media[0]?.url ?? null,
      scentProfile: p.scentProfile,
      item: { id: p.item.id, code: p.item.code, name: p.item.name, uom: p.item.uom, minStock: p.item.minStock?.toString() ?? null },
      stock: { onHand: onHand.toString(), reserved: reserved.toString(), available: onHand.minus(reserved).toString(), uom: p.item.uom },
      price: priceRow
        ? { amount: priceRow.price.toString(), currency: priceRow.priceList.currency, includesTax: priceRow.priceList.pricesIncludeTax }
        : null,
      formula: canFormula ? p.formula : p.formula ? { id: p.formula.id, code: p.formula.code, version: p.formula.version, status: p.formula.status, name: null, concentrationPct: null } : null,
      canSeeFormula: canFormula,
      rawMaterials,
    };
  }

  @Post("products")
  @RequirePermission("sales", "CREATE")
  @Audited({ action: "product.create", entity: "Product", load: loadProduct })
  @ApiZodBody(productCreateSchema)
  async createProduct(@Body(new ZodPipe(productCreateSchema)) body: ProductCreateRequest) {
    const item = await this.prisma.item.findUnique({
      where: { id: body.itemId },
      include: { product: true },
    });
    if (!item) throw new NotFoundException({ message: "Kalem bulunamadı" });
    if (item.type !== "FINISHED_GOOD")
      throw new BadRequestException({ message: "Ürün kartı yalnızca mamul kalem için açılır" });
    if (item.product) throw new BadRequestException({ message: "Bu kalemin zaten bir ürün kartı var" });
    const warnings = await taxCategoryCheck(this.prisma, body.taxCategory, body.gtip);
    const product = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { ...body, status: "DRAFT" },
        select: { id: true, sku: true },
      });
      await emit(tx, { type: "product.updated", productId: p.id, fields: ["created"] });
      return p;
    });
    return { ...product, warnings };
  }

  /**
   * Tek adımda tam ürün kartı (yönetim ekranı): mamul kalem + ürün + vitrin koku profili birlikte açılır.
   * Kolay ekleme için kalem kodu/adı burada verilir; ayrı kalem oluşturma adımı gerekmez.
   */
  @Post("products/full")
  @RequirePermission("sales", "CREATE")
  @Audited({ action: "product.create", entity: "Product", load: loadProduct })
  @ApiZodBody(productFullCreateSchema)
  async createFullProduct(@Body(new ZodPipe(productFullCreateSchema)) body: ProductFullCreateRequest) {
    const { itemCode, itemName, scentProfile, status, ...rest } = body;
    const codeTaken = await this.prisma.item.findUnique({ where: { code: itemCode }, select: { id: true } });
    if (codeTaken) throw new BadRequestException({ message: `Kalem kodu zaten kullanılıyor: ${itemCode}` });
    const skuTaken = await this.prisma.product.findUnique({ where: { sku: rest.sku }, select: { id: true } });
    if (skuTaken) throw new BadRequestException({ message: `SKU zaten kullanılıyor: ${rest.sku}` });
    const warnings = await taxCategoryCheck(this.prisma, rest.taxCategory, rest.gtip);
    const product = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: { code: itemCode, name: itemName, type: "FINISHED_GOOD", uom: "PCS" },
        select: { id: true },
      });
      const p = await tx.product.create({
        data: {
          ...rest,
          itemId: item.id,
          status,
          ...(scentProfile ? { scentProfile: scentProfile as Prisma.InputJsonValue } : {}),
        },
        select: { id: true, sku: true },
      });
      await emit(tx, { type: "product.updated", productId: p.id, fields: ["created"] });
      return p;
    });
    return { ...product, warnings };
  }

  /** Ürün kart görselini yükler/değiştirir (vitrin ve yönetim kartı). Görsel diske yazılır, ProductMedia güncellenir. */
  @Put("products/:id/image")
  @RequirePermission("sales", "EDIT")
  @Audited({ action: "product.image", entity: "Product", idParam: "id", load: loadProduct })
  @ApiZodBody(productImageSchema)
  async setImage(@Param("id") id: string, @Body(new ZodPipe(productImageSchema)) body: ProductImageRequest) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    let url: string;
    try {
      url = await saveProductImage(this.config.UPLOADS_DIR, id, decodeImageDataUrl(body.dataUrl));
    } catch (e) {
      throw new BadRequestException({ message: e instanceof Error ? e.message : "Görsel yüklenemedi" });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productMedia.deleteMany({ where: { productId: id, role: "NOTES_CARD" } });
      await tx.productMedia.create({ data: { productId: id, role: "NOTES_CARD", url, sortOrder: 0 } });
    });
    return { id, imageUrl: url };
  }

  /** Ürün kart görselini kaldırır. */
  @Delete("products/:id/image")
  @RequirePermission("sales", "EDIT")
  @Audited({ action: "product.image", entity: "Product", idParam: "id", load: loadProduct })
  async removeImage(@Param("id") id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    await this.prisma.productMedia.deleteMany({ where: { productId: id, role: "NOTES_CARD" } });
    await removeProductImages(this.config.UPLOADS_DIR, id);
    return { id, imageUrl: null };
  }

  /**
   * Ürün kartını siler. Satış/üretim/fiyat/uyum kaydı varsa silinmez; bunun yerine durumu
   * "Üretimden kalktı" yapılması önerilir (geçmiş kayıtların bütünlüğü için).
   */
  @Delete("products/:id")
  @RequirePermission("sales", "DELETE")
  async deleteProduct(
    @Param("id") id: string,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const product = await loadProduct(this.prisma, id);
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const [orders, batches, boms, prices, listings, compliance] = await Promise.all([
      this.prisma.salesOrderLine.count({ where: { productId: id } }),
      this.prisma.productionBatch.count({ where: { productId: id } }),
      this.prisma.billOfMaterials.count({ where: { productId: id } }),
      this.prisma.priceListItem.count({ where: { productId: id } }),
      this.prisma.channelListing.count({ where: { productId: id } }),
      this.prisma.complianceDocument.count({ where: { productId: id } }),
    ]);
    if (orders + batches + boms + prices + listings + compliance > 0) {
      throw new BadRequestException({
        message: "Bu ürünün satış, üretim, fiyat veya uyum kaydı var. Silmek yerine durumunu 'Üretimden kalktı' yapın.",
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productNote.deleteMany({ where: { productId: id } });
      await tx.productAccord.deleteMany({ where: { productId: id } });
      await tx.productContent.deleteMany({ where: { productId: id } });
      await tx.recommendation.deleteMany({ where: { productId: id } });
      await tx.productMedia.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "product.delete",
        entity: "Product",
        entityId: id,
        before: product,
        after: null,
        ...clientInfo(req),
      });
    });
    await removeProductImages(this.config.UPLOADS_DIR, id);
    return { id, deleted: true };
  }

  /** Ticari kart değişikliği; vergi kategorisi/GTİP değişirse VRG-04 kontrolü, product.updated olayı. */
  @Patch("products/:id")
  @RequirePermission("sales", "EDIT")
  @Audited({ action: "product.update", entity: "Product", idParam: "id", load: loadProduct })
  @ApiZodBody(productUpdateSchema)
  async updateProduct(
    @Param("id") id: string,
    @Body(new ZodPipe(productUpdateSchema)) body: ProductUpdateRequest,
  ) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException({ message: "Ürün bulunamadı" });
    const warnings =
      body.taxCategory || body.gtip
        ? await taxCategoryCheck(
            this.prisma,
            body.taxCategory ?? current.taxCategory,
            body.gtip ?? current.gtip,
          )
        : [];
    const fields = Object.keys(body);
    const { scentProfile, ...rest } = body;
    const data: Prisma.ProductUpdateInput = {
      ...rest,
      ...(scentProfile !== undefined ? { scentProfile: scentProfile as Prisma.InputJsonValue } : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });
      if (fields.length) await emit(tx, { type: "product.updated", productId: id, fields });
    });
    return { id, warnings };
  }

  /** Koku piramidi ve akor skorları (Koku laboratuvarının girdisi). */
  @Put("products/:id/scent")
  @RequirePermission("scent", "EDIT")
  @ApiZodBody(productScentSchema)
  async setScent(
    @Param("id") id: string,
    @Body(new ZodPipe(productScentSchema)) body: ProductScentRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException({ message: "Ürün bulunamadı" });
    await this.prisma.$transaction(async (tx) => {
      const before = await scentSnapshot(tx, id);
      await tx.productNote.deleteMany({ where: { productId: id } });
      for (const n of body.notes) {
        const note = await tx.scentNote.upsert({
          where: { name: n.name },
          update: {},
          create: { name: n.name, family: n.family },
        });
        await tx.productNote.upsert({
          where: { productId_noteId: { productId: id, noteId: note.id } },
          update: { tier: n.tier },
          create: { productId: id, noteId: note.id, tier: n.tier },
        });
      }
      for (const [accord, score] of Object.entries(body.accords)) {
        await tx.productAccord.upsert({
          where: { productId_accord: { productId: id, accord } },
          update: { score, source: "panel" },
          create: { productId: id, accord, score, source: "panel" },
        });
      }
      await writeAudit(tx, {
        userId: auth.userId,
        action: "product.scent",
        entity: "Product",
        entityId: id,
        before,
        after: await scentSnapshot(tx, id),
        ...clientInfo(req),
      });
      await emit(tx, { type: "product.updated", productId: id, fields: ["notes", "accords"] });
    });
    return { id };
  }
}

async function scentSnapshot(tx: Tx, productId: string) {
  const [notes, accords] = await Promise.all([
    tx.productNote.findMany({ where: { productId }, include: { note: { select: { name: true } } } }),
    tx.productAccord.findMany({ where: { productId }, select: { accord: true, score: true } }),
  ]);
  return {
    notes: notes.map((n) => `${n.tier}:${n.note.name}`).sort(),
    accords: Object.fromEntries(accords.map((a) => [a.accord, a.score])),
  };
}
