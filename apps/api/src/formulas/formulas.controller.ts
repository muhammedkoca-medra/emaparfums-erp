import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, type Tx, writeAudit } from "@atelier/db";
import {
  type BomUpdateRequest,
  bomUpdateSchema,
  type FormulaCreateRequest,
  formulaCreateSchema,
  type FormulaDecisionRequest,
  formulaDecisionSchema,
  type FormulaDraftRequest,
  formulaDraftSchema,
  validateFormulaLines,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/** Denetim görüntüsü: formülün tamamı (satırlar kalem koduyla). Formül değişikliği kural 7 kapsamında. */
async function formulaSnapshot(tx: Tx, id: string) {
  const f = await tx.formula.findUniqueOrThrow({
    where: { id },
    include: {
      lines: { include: { item: { select: { code: true } } } },
      allergens: true,
    },
  });
  return {
    code: f.code,
    version: f.version,
    name: f.name,
    status: f.status,
    concentrationPct: f.concentrationPct.toString(),
    ifraCategory: f.ifraCategory,
    lines: f.lines
      .map((l) => ({ item: l.item.code, percentage: l.percentage.toString() }))
      .sort((a, b) => a.item.localeCompare(b.item)),
    allergens: f.allergens.map((a) => ({
      name: a.name,
      pctInFinal: a.pctInFinal.toString(),
      mustLabel: a.mustLabel,
    })),
  };
}

/**
 * Formüller ve reçeteler (F1-02). Formül satırları ticari gizlidir (docs/07): yalnızca production:VIEW.
 *  - Onaylı formül düzenlenmez; yeni sürüm (DRAFT) açılır.
 *  - DRAFT → IN_REVIEW (toplam %100, tekrar yok) → APPROVED (production:APPROVE) ya da DRAFT'a ret.
 *  - Onayda aynı koddaki önceki onaylı sürüm ARCHIVED olur, ürünler yeni sürüme bağlanır.
 *  - IFRA limit kontrolü (URT-09) Faz 3'te onaydan önce çalışacak.
 */
@ApiTags("formulas")
@Controller("formulas")
export class FormulasController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission("production", "VIEW")
  async list() {
    const rows = await this.prisma.formula.findMany({
      orderBy: [{ code: "asc" }, { version: "desc" }],
      select: {
        id: true,
        code: true,
        version: true,
        name: true,
        status: true,
        concentrationPct: true,
        approvedAt: true,
        _count: { select: { lines: true } },
        products: { select: { id: true, name: true } },
      },
    });
    return rows.map(({ _count, ...r }) => ({ ...r, lineCount: _count.lines }));
  }

  @Get(":id")
  @RequirePermission("production", "VIEW")
  async get(@Param("id") id: string) {
    const f = await this.prisma.formula.findUnique({
      where: { id },
      include: {
        lines: {
          include: { item: { select: { id: true, code: true, name: true, type: true } } },
          orderBy: { percentage: "desc" },
        },
        allergens: { orderBy: { name: "asc" } },
        products: { select: { id: true, name: true, sku: true } },
        boms: {
          where: { isActive: true },
          include: {
            product: { select: { id: true, name: true } },
            lines: { include: { item: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    });
    if (!f) throw new NotFoundException({ message: "Formül bulunamadı" });
    const versions = await this.prisma.formula.findMany({
      where: { code: f.code },
      orderBy: { version: "desc" },
      select: { id: true, version: true, status: true, approvedAt: true },
    });
    return { ...f, versions };
  }

  @Post()
  @RequirePermission("production", "CREATE")
  @ApiZodBody(formulaCreateSchema)
  async create(
    @Body(new ZodPipe(formulaCreateSchema)) body: FormulaCreateRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.formula.findFirst({ where: { code: body.code }, select: { id: true } });
      if (exists) throw new ConflictException({ message: "Bu kodla bir formül var; yeni sürüm açın" });
      const f = await tx.formula.create({
        data: {
          code: body.code,
          name: body.name,
          concentrationPct: body.concentrationPct,
          ifraCategory: body.ifraCategory ?? null,
        },
        select: { id: true },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "formula.create",
        entity: "Formula",
        entityId: f.id,
        after: await formulaSnapshot(tx, f.id),
        ...clientInfo(req),
      });
      return f;
    });
  }

  /** Mevcut sürümden yeni taslak sürüm (satırlar ve alerjenler kopyalanır). */
  @Post(":id/versions")
  @RequirePermission("production", "CREATE")
  async newVersion(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const src = await tx.formula.findUnique({ where: { id }, include: { lines: true, allergens: true } });
      if (!src) throw new NotFoundException({ message: "Formül bulunamadı" });
      const draft = await tx.formula.findFirst({
        where: { code: src.code, status: { in: ["DRAFT", "IN_REVIEW"] } },
      });
      if (draft)
        throw new ConflictException({ message: `Bu formülün açık bir taslağı var (sürüm ${draft.version})` });
      const max = await tx.formula.aggregate({ where: { code: src.code }, _max: { version: true } });
      const f = await tx.formula.create({
        data: {
          code: src.code,
          version: (max._max.version ?? 0) + 1,
          name: src.name,
          concentrationPct: src.concentrationPct,
          ifraAmendment: src.ifraAmendment,
          ifraCategory: src.ifraCategory,
          lines: { create: src.lines.map((l) => ({ itemId: l.itemId, percentage: l.percentage })) },
          allergens: {
            create: src.allergens.map((a) => ({
              name: a.name,
              pctInFinal: a.pctInFinal,
              mustLabel: a.mustLabel,
            })),
          },
        },
        select: { id: true, version: true },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "formula.version",
        entity: "Formula",
        entityId: f.id,
        before: { fromVersion: src.version },
        after: await formulaSnapshot(tx, f.id),
        ...clientInfo(req),
      });
      return f;
    });
  }

  /** Taslağı düzenler: satırlar, alerjenler, konsantrasyon. Yalnızca DRAFT. */
  @Put(":id")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(formulaDraftSchema)
  async saveDraft(
    @Param("id") id: string,
    @Body(new ZodPipe(formulaDraftSchema)) body: FormulaDraftRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const f = await this.lock(tx, id);
      if (f.status !== "DRAFT")
        throw new ConflictException({ message: "Yalnızca taslak formül düzenlenebilir; yeni sürüm açın" });
      const items = await tx.item.findMany({
        where: { id: { in: body.lines.map((l) => l.itemId) } },
        select: { id: true, type: true },
      });
      if (items.length !== new Set(body.lines.map((l) => l.itemId)).size)
        throw new BadRequestException({ message: "Formülde bilinmeyen kalem var" });
      if (items.some((i) => i.type !== "RAW_MATERIAL" && i.type !== "SEMI_FINISHED")) {
        throw new BadRequestException({
          message: "Formül satırı yalnızca hammadde ya da yarı mamul olabilir",
        });
      }
      const before = await formulaSnapshot(tx, id);
      await tx.formulaLine.deleteMany({ where: { formulaId: id } });
      await tx.formulaAllergen.deleteMany({ where: { formulaId: id } });
      await tx.formula.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.concentrationPct ? { concentrationPct: body.concentrationPct } : {}),
          ...(body.ifraCategory !== undefined ? { ifraCategory: body.ifraCategory } : {}),
          lines: { create: body.lines.map((l) => ({ itemId: l.itemId, percentage: l.percentage })) },
          allergens: {
            create: body.allergens.map((a) => ({
              name: a.name,
              pctInFinal: a.pctInFinal,
              mustLabel: a.mustLabel,
            })),
          },
        },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "formula.update",
        entity: "Formula",
        entityId: id,
        before,
        after: await formulaSnapshot(tx, id),
        ...clientInfo(req),
      });
      return { id, warnings: validateFormulaLines(body.lines) };
    });
  }

  @Post(":id/submit")
  @RequirePermission("production", "EDIT")
  @HttpCode(200)
  async submit(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const f = await this.lock(tx, id);
      if (f.status !== "DRAFT")
        throw new ConflictException({ message: "Yalnızca taslak onaya gönderilebilir" });
      const lines = await tx.formulaLine.findMany({ where: { formulaId: id } });
      const errors = validateFormulaLines(
        lines.map((l) => ({ itemId: l.itemId, percentage: l.percentage.toString() })),
      );
      if (errors.length)
        throw new BadRequestException({
          message: errors[0],
          issues: errors.map((m) => ({ path: "lines", message: m })),
        });
      await tx.formula.update({ where: { id }, data: { status: "IN_REVIEW" } });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "formula.submit",
        entity: "Formula",
        entityId: id,
        before: { status: "DRAFT" },
        after: { status: "IN_REVIEW" },
        ...clientInfo(req),
      });
      return { id, status: "IN_REVIEW" };
    });
  }

  @Post(":id/decide")
  @RequirePermission("production", "APPROVE")
  @HttpCode(200)
  @ApiZodBody(formulaDecisionSchema)
  async decide(
    @Param("id") id: string,
    @Body(new ZodPipe(formulaDecisionSchema)) body: FormulaDecisionRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const f = await this.lock(tx, id);
      if (f.status !== "IN_REVIEW") throw new ConflictException({ message: "Formül onay beklemiyor" });
      if (body.decision === "REJECT") {
        await tx.formula.update({ where: { id }, data: { status: "DRAFT" } });
        await writeAudit(tx, {
          userId: auth.userId,
          action: "formula.reject",
          entity: "Formula",
          entityId: id,
          before: { status: "IN_REVIEW" },
          after: { status: "DRAFT", note: body.note ?? null },
          ...clientInfo(req),
        });
        return { id, status: "DRAFT" };
      }
      const previous = await tx.formula.findMany({
        where: { code: f.code, status: "APPROVED", id: { not: id } },
        select: { id: true },
      });
      const prevIds = previous.map((p) => p.id);
      await tx.formula.updateMany({ where: { id: { in: prevIds } }, data: { status: "ARCHIVED" } });
      await tx.formula.update({
        where: { id },
        data: { status: "APPROVED", approvedById: auth.userId, approvedAt: new Date() },
      });
      // Ürünler ve etkin reçeteler yeni onaylı sürüme bağlanır
      const products = await tx.product.findMany({
        where: { formulaId: { in: prevIds } },
        select: { id: true },
      });
      await tx.product.updateMany({ where: { formulaId: { in: prevIds } }, data: { formulaId: id } });
      await tx.billOfMaterials.updateMany({
        where: { formulaId: { in: prevIds }, isActive: true },
        data: { formulaId: id },
      });
      for (const p of products)
        await emit(tx, { type: "product.updated", productId: p.id, fields: ["formula"] });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "formula.approve",
        entity: "Formula",
        entityId: id,
        before: { status: "IN_REVIEW", archived: prevIds },
        after: {
          ...(await formulaSnapshot(tx, id)),
          productsRelinked: products.length,
          note: body.note ?? null,
        },
        ...clientInfo(req),
      });
      return { id, status: "APPROVED", archived: prevIds.length, productsRelinked: products.length };
    });
  }

  /** Reçete (1 parti için malzeme listesi). */
  @Put("boms/:bomId")
  @RequirePermission("production", "EDIT")
  @ApiZodBody(bomUpdateSchema)
  async saveBom(
    @Param("bomId") bomId: string,
    @Body(new ZodPipe(bomUpdateSchema)) body: BomUpdateRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const bom = await tx.billOfMaterials.findUnique({ where: { id: bomId }, include: { lines: true } });
      if (!bom) throw new NotFoundException({ message: "Reçete bulunamadı" });
      const before = {
        batchSize: bom.batchSize,
        lines: bom.lines.map((l) => ({ itemId: l.itemId, qty: l.qty.toString(), uom: l.uom })),
      };
      await tx.bomLine.deleteMany({ where: { bomId } });
      await tx.billOfMaterials.update({
        where: { id: bomId },
        data: {
          batchSize: body.batchSize,
          lines: {
            create: body.lines.map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
              uom: l.uom,
              scrapPct: l.scrapPct,
            })),
          },
        },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "bom.update",
        entity: "BillOfMaterials",
        entityId: bomId,
        before,
        after: body,
        ...clientInfo(req),
      });
      return { id: bomId };
    });
  }

  private async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Formula" WHERE id = ${id} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException({ message: "Formül bulunamadı" });
    return tx.formula.findUniqueOrThrow({ where: { id } });
  }
}
