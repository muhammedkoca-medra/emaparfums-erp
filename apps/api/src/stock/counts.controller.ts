import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Db, getSetting, Prisma, recordMovement, type Tx, writeAudit } from "@atelier/db";
import {
  type CountCreateRequest,
  countCreateSchema,
  type CountDecisionRequest,
  countDecisionSchema,
  type CountLinesRequest,
  countLinesSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { PermissionService } from "../permissions/permission.service.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";
import { currentCosts } from "./stock-queries.js";

const D = Prisma.Decimal;

/**
 * Web üzerinden sayım (STK-09, F1-07). Mobil kör sayım Faz 3'te aynı uçları kullanır.
 *  1. Oluştur: depodaki bakiyelerin anlık görüntüsü satır olarak alınır (systemQty).
 *  2. Say: countedQty girilir. Kör sayımda onay yetkisi olmayan systemQty'yi görmez.
 *  3. Gönder: fark değeri hesaplanır. Eşik altındaysa farklar hemen ADJUSTMENT olarak yazılır;
 *     eşik üstündeyse ya da farkı olan kalemin maliyeti bilinmiyorsa yönetici onayı beklenir.
 *  4. Onay/ret: onayda farklar yazılır; retle sayım yeniden sayıma açılır.
 */
@ApiTags("stock")
@Controller("stock/counts")
export class CountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  @Get()
  @RequirePermission("stock", "VIEW")
  async list() {
    const counts = await this.prisma.cycleCount.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { warehouse: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return counts.map(({ _count, ...c }) => ({ ...c, lineCount: _count.lines }));
  }

  @Post()
  @RequirePermission("stock", "CREATE")
  @ApiZodBody(countCreateSchema)
  async create(
    @Body(new ZodPipe(countCreateSchema)) body: CountCreateRequest,
    @CurrentUser() auth: AuthContext,
  ) {
    const wh = await this.prisma.warehouse.findUnique({
      where: { id: body.warehouseId },
      select: { id: true },
    });
    if (!wh) throw new NotFoundException({ message: "Depo bulunamadı" });
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        qtyOnHand: { gt: 0 },
        location: {
          warehouseId: body.warehouseId,
          ...(body.zone ? { code: { startsWith: body.zone } } : {}),
        },
      },
      orderBy: [{ location: { pickSequence: "asc" } }, { item: { code: "asc" } }],
      select: { itemId: true, lotId: true, locationId: true, qtyOnHand: true },
    });
    if (balances.length === 0)
      throw new BadRequestException({ message: "Bu depoda/bölgede sayılacak stok yok" });
    return this.prisma.cycleCount.create({
      data: {
        warehouseId: body.warehouseId,
        zone: body.zone ?? null,
        isBlind: body.isBlind,
        createdById: auth.userId,
        lines: {
          create: balances.map((b) => ({
            itemId: b.itemId,
            lotId: b.lotId,
            locationId: b.locationId,
            systemQty: b.qtyOnHand,
          })),
        },
      },
      select: { id: true },
    });
  }

  @Get(":id")
  @RequirePermission("stock", "VIEW")
  async get(@Param("id") id: string, @CurrentUser() auth: AuthContext) {
    const count = await this.prisma.cycleCount.findUnique({
      where: { id },
      include: { warehouse: { select: { name: true } }, lines: true },
    });
    if (!count) throw new NotFoundException({ message: "Sayım bulunamadı" });
    const perms = await this.permissions.forUser(auth.userId);
    // Kör sayım: sayım açıkken sistem miktarı yalnızca onaylayıcı görür
    const hideSystem = count.isBlind && count.status === "OPEN" && !perms.has("stock:APPROVE");

    const itemIds = [...new Set(count.lines.map((l) => l.itemId))];
    const [items, lots, locs] = await Promise.all([
      this.prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, code: true, name: true, uom: true },
      }),
      this.prisma.lot.findMany({
        where: { id: { in: count.lines.map((l) => l.lotId) } },
        select: { id: true, lotNo: true },
      }),
      this.prisma.location.findMany({
        where: { id: { in: count.lines.map((l) => l.locationId) } },
        select: { id: true, code: true },
      }),
    ]);
    const im = new Map(items.map((i) => [i.id, i]));
    const lm = new Map(lots.map((l) => [l.id, l.lotNo]));
    const cm = new Map(locs.map((l) => [l.id, l.code]));
    return {
      ...count,
      systemHidden: hideSystem,
      lines: count.lines
        .map((l) => ({
          id: l.id,
          item: im.get(l.itemId)!,
          lotNo: lm.get(l.lotId)!,
          locationCode: cm.get(l.locationId)!,
          systemQty: hideSystem ? null : l.systemQty.toString(),
          countedQty: l.countedQty?.toString() ?? null,
          diff:
            hideSystem || l.countedQty === null ? null : new D(l.countedQty).minus(l.systemQty).toString(),
        }))
        .sort(
          (a, b) => a.locationCode.localeCompare(b.locationCode) || a.item.code.localeCompare(b.item.code),
        ),
    };
  }

  @Patch(":id/lines")
  @RequirePermission("stock", "EDIT")
  @ApiZodBody(countLinesSchema)
  async setLines(
    @Param("id") id: string,
    @Body(new ZodPipe(countLinesSchema)) body: CountLinesRequest,
    @CurrentUser() auth: AuthContext,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const count = await this.lockCount(tx, id);
      if (count.status !== "OPEN")
        throw new ConflictException({ message: "Sayım gönderilmiş; satırlar değiştirilemez" });
      const now = new Date();
      for (const l of body.lines) {
        const r = await tx.cycleCountLine.updateMany({
          where: { id: l.lineId, countId: id },
          data: { countedQty: l.countedQty, countedById: auth.userId, countedAt: now },
        });
        if (r.count === 0) throw new BadRequestException({ message: "Satır bu sayıma ait değil" });
      }
    });
    return { id, updated: body.lines.length };
  }

  @Post(":id/submit")
  @RequirePermission("stock", "EDIT")
  @HttpCode(200)
  async submit(@Param("id") id: string, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const count = await this.lockCount(tx, id);
      if (count.status !== "OPEN") throw new ConflictException({ message: "Sayım zaten gönderilmiş" });
      const lines = await tx.cycleCountLine.findMany({ where: { countId: id } });
      if (lines.some((l) => l.countedQty === null)) {
        throw new BadRequestException({ message: "Tüm satırlar sayılmadan sayım gönderilemez" });
      }
      const { value, unknownCost } = await varianceValue(tx as unknown as Db, lines);
      const threshold = new D(await getSetting(tx, "stock.countApprovalThreshold"));
      const needsApproval = unknownCost || value.greaterThan(threshold);
      const now = new Date();
      await tx.cycleCount.update({
        where: { id },
        data: { status: "SUBMITTED", submittedAt: now, varianceValue: value.toFixed(2), needsApproval },
      });
      if (!needsApproval) await this.apply(tx, id, auth.userId, req, "auto");
      return {
        id,
        needsApproval,
        varianceValue: value.toFixed(2),
        status: needsApproval ? "SUBMITTED" : "APPROVED",
      };
    });
  }

  @Post(":id/decide")
  @RequirePermission("stock", "APPROVE")
  @HttpCode(200)
  @ApiZodBody(countDecisionSchema)
  async decide(
    @Param("id") id: string,
    @Body(new ZodPipe(countDecisionSchema)) body: CountDecisionRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const count = await this.lockCount(tx, id);
      if (count.status !== "SUBMITTED") throw new ConflictException({ message: "Sayım onay beklemiyor" });
      if (body.decision === "REJECT") {
        await tx.cycleCount.update({
          where: { id },
          data: { status: "OPEN", submittedAt: null, needsApproval: false, varianceValue: null },
        });
        await writeAudit(tx, {
          userId: auth.userId,
          action: "stock.count.reject",
          entity: "CycleCount",
          entityId: id,
          after: { note: body.note ?? null },
          ...clientInfo(req),
        });
        return { id, status: "OPEN" };
      }
      await this.apply(tx, id, auth.userId, req, body.note ?? "onay");
      return { id, status: "APPROVED" };
    });
  }

  private async lockCount(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "CycleCount" WHERE id = ${id} FOR UPDATE`;
    if (!rows[0]) throw new NotFoundException({ message: "Sayım bulunamadı" });
    return tx.cycleCount.findUniqueOrThrow({ where: { id } });
  }

  /** Farkları ADJUSTMENT hareketi olarak yazar ve sayımı onaylar. */
  private async apply(tx: Tx, id: string, userId: string, req: AuthedRequest, note: string) {
    const lines = await tx.cycleCountLine.findMany({ where: { countId: id } });
    let adjustments = 0;
    for (const l of lines) {
      const diff = new D(l.countedQty!).minus(l.systemQty);
      if (diff.isZero()) continue;
      adjustments++;
      await recordMovement(tx, {
        type: "ADJUSTMENT",
        itemId: l.itemId,
        lotId: l.lotId,
        qty: diff.abs(),
        ...(diff.isPositive() ? { toLocationId: l.locationId } : { fromLocationId: l.locationId }),
        refType: "CycleCount",
        refId: id,
        userId,
        note: `Sayım farkı (${note})`,
      });
    }
    await tx.cycleCount.update({
      where: { id },
      data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() },
    });
    await writeAudit(tx, {
      userId,
      action: "stock.count.approve",
      entity: "CycleCount",
      entityId: id,
      after: { adjustments, note },
      ...clientInfo(req),
    });
  }
}

/** Farkların mutlak maliyet değeri; farkı olan kalemin maliyeti yoksa unknownCost. */
async function varianceValue(
  prisma: Db,
  lines: { itemId: string; systemQty: Prisma.Decimal; countedQty: Prisma.Decimal | null }[],
) {
  const withDiff = lines.filter((l) => !new D(l.countedQty!).equals(l.systemQty));
  const costs = await currentCosts(prisma, [...new Set(withDiff.map((l) => l.itemId))]);
  let value = new D(0);
  let unknownCost = false;
  for (const l of withDiff) {
    const c = costs.get(l.itemId);
    if (!c) {
      unknownCost = true;
      continue;
    }
    value = value.plus(new D(l.countedQty!).minus(l.systemQty).abs().mul(c));
  }
  return { value, unknownCost };
}
