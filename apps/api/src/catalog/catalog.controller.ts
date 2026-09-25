import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Db, emit, type Tx, writeAudit } from "@atelier/db";
import {
  catalogQuerySchema,
  type ItemCreateRequest,
  itemCreateSchema,
  type ItemUpdateRequest,
  itemUpdateSchema,
  type ProductCreateRequest,
  productCreateSchema,
  type ProductScentRequest,
  productScentSchema,
  type ProductUpdateRequest,
  productUpdateSchema,
} from "@atelier/shared";
import { z } from "zod";
import { Audited } from "../audit/audited.decorator.js";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { PrismaService } from "../prisma.service.js";

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
        item: { select: { id: true, code: true } },
        formula: { select: { code: true, version: true, status: true } },
      },
    });
    return rows;
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
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: body });
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
