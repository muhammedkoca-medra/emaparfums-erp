import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  checkConsistency,
  createLot,
  getSetting,
  recordMovement,
  releaseReservation,
  reserveFefo,
  setLotQcStatus,
  setSetting,
} from "@atelier/db";
import {
  type BalancesQuery,
  balancesQuerySchema,
  expiringQuerySchema,
  isSettingKey,
  type LotQcRequest,
  lotQcRequestSchema,
  type MovementRequest,
  movementRequestSchema,
  movementsQuerySchema,
  type ReservationRequest,
  reservationRequestSchema,
  SETTING_KEYS,
  SETTINGS,
} from "@atelier/shared";
import { z } from "zod";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";
import {
  expiringLots,
  itemDetail,
  listBalances,
  recentMovements,
  stockSummary,
  warehouses,
} from "./stock-queries.js";

const STOCK_RULE_KEYS = SETTING_KEYS.filter((k) => k.startsWith("stock."));

/** Stok takip (docs/03-moduller/stok.md). Tüm yazımlar packages/db/src/stock.ts üzerinden. */
@ApiTags("stock")
@Controller("stock")
export class StockController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("balances")
  @RequirePermission("stock", "VIEW")
  @ApiZodQuery(balancesQuerySchema)
  balances(@Query(new ZodPipe(balancesQuerySchema)) q: BalancesQuery) {
    return listBalances(this.prisma, q);
  }

  @Get("summary")
  @RequirePermission("stock", "VIEW")
  summary() {
    return stockSummary(this.prisma);
  }

  @Get("items/:id")
  @RequirePermission("stock", "VIEW")
  async item(@Param("id") id: string) {
    const d = await itemDetail(this.prisma, id);
    if (!d) throw new NotFoundException({ message: "Kalem bulunamadı" });
    return d;
  }

  @Get("movements")
  @RequirePermission("stock", "VIEW")
  @ApiZodQuery(movementsQuerySchema)
  movements(@Query(new ZodPipe(movementsQuerySchema)) q: z.infer<typeof movementsQuerySchema>) {
    return recentMovements(this.prisma, q);
  }

  @Get("warehouses")
  @RequirePermission("stock", "VIEW")
  warehouses() {
    return warehouses(this.prisma);
  }

  @Get("expiring")
  @RequirePermission("stock", "VIEW")
  @ApiZodQuery(expiringQuerySchema)
  async expiring(@Query(new ZodPipe(expiringQuerySchema)) q: { days?: number }) {
    const days = q.days ?? (await getSetting(this.prisma, "stock.expiryWarningDays"));
    return { days, lots: await expiringLots(this.prisma, days) };
  }

  /** Elle hareket: giriş (açılış/elle kabul), düzeltme, transfer. */
  @Post("movements")
  @RequirePermission("stock", "CREATE")
  @ApiZodBody(movementRequestSchema)
  createMovement(
    @Body(new ZodPipe(movementRequestSchema)) body: MovementRequest,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (body.type === "RECEIPT") {
        if (Boolean(body.lotId) === Boolean(body.newLot)) {
          throw new BadRequestException({ message: "Mevcut bir lot seçin ya da yeni lot bilgisi girin" });
        }
        const lotId =
          body.lotId ??
          (
            await createLot(tx, {
              itemId: body.itemId,
              lotNo: body.newLot!.lotNo,
              expiryDate: body.newLot!.expiryDate ?? null,
              mfgDate: body.newLot!.mfgDate ?? null,
              supplierLotNo: body.newLot!.supplierLotNo ?? null,
            })
          ).id;
        return recordMovement(tx, {
          type: "RECEIPT",
          itemId: body.itemId,
          lotId,
          qty: body.qty,
          toLocationId: body.locationId,
          unitCost: body.unitCost ?? null,
          refType: "ManualReceipt",
          userId: auth.userId,
          note: body.note ?? null,
        });
      }
      if (body.type === "ADJUSTMENT") {
        return recordMovement(tx, {
          type: "ADJUSTMENT",
          itemId: body.itemId,
          lotId: body.lotId,
          qty: body.qty,
          ...(body.direction === "INCREASE"
            ? { toLocationId: body.locationId }
            : { fromLocationId: body.locationId }),
          refType: "ManualAdjustment",
          userId: auth.userId,
          note: body.note,
        });
      }
      return recordMovement(tx, {
        type: "TRANSFER",
        itemId: body.itemId,
        lotId: body.lotId,
        qty: body.qty,
        fromLocationId: body.fromLocationId,
        toLocationId: body.toLocationId,
        refType: "ManualTransfer",
        userId: auth.userId,
        note: body.note ?? null,
      });
    });
  }

  @Get("reservations")
  @RequirePermission("stock", "VIEW")
  reservations(@Query("itemId") itemId?: string) {
    return this.prisma.stockReservation.findMany({
      where: { releasedAt: null, consumedAt: null, ...(itemId ? { itemId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        item: { select: { code: true, name: true, uom: true } },
        lot: { select: { lotNo: true } },
        location: { select: { code: true } },
      },
    });
  }

  /** İç kullanım rezervasyonu (FEFO). Satış rezervasyonu satış modülünden gelir. */
  @Post("reservations")
  @RequirePermission("stock", "CREATE")
  @ApiZodBody(reservationRequestSchema)
  reserve(
    @Body(new ZodPipe(reservationRequestSchema)) body: ReservationRequest,
    @CurrentUser() auth: AuthContext,
  ) {
    return this.prisma.$transaction((tx) =>
      reserveFefo(tx, {
        itemId: body.itemId,
        qty: body.qty,
        warehouseId: body.warehouseId ?? null,
        refType: "Manual",
        refId: randomUUID(),
        userId: auth.userId,
        note: body.note,
      }),
    );
  }

  @Post("reservations/:id/release")
  @RequirePermission("stock", "EDIT")
  async release(@Param("id") id: string) {
    await this.prisma.$transaction((tx) => releaseReservation(tx, id));
    return { id, released: true };
  }

  /** Lot kalite durumu (kalite modülünün temel eylemi; Faz 3'te muayene akışına bağlanır). */
  @Post("lots/:id/qc")
  @RequirePermission("quality", "APPROVE")
  @ApiZodBody(lotQcRequestSchema)
  qc(
    @Param("id") id: string,
    @Body(new ZodPipe(lotQcRequestSchema)) body: LotQcRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUnique({ where: { id }, select: { id: true } });
      if (!lot) throw new NotFoundException({ message: "Lot bulunamadı" });
      return setLotQcStatus(tx, {
        lotId: id,
        status: body.status,
        reason: body.reason,
        userId: auth.userId,
        ...clientInfo(req),
      });
    });
  }

  /** Otomatik kurallar: SKT uyarı günü, kanal tamponu, sayım onay eşiği, min stok bildirim aralığı. */
  @Get("rules")
  @RequirePermission("stock", "VIEW")
  async rules() {
    const out: Record<string, { value: unknown; default: unknown }> = {};
    for (const key of STOCK_RULE_KEYS)
      out[key] = { value: await getSetting(this.prisma, key), default: SETTINGS[key].default };
    return out;
  }

  @Put("rules/:key")
  @RequirePermission("stock", "APPROVE")
  async setRule(
    @Param("key") key: string,
    @Body() body: { value?: unknown },
    @CurrentUser() auth: AuthContext,
  ) {
    if (!isSettingKey(key) || !key.startsWith("stock."))
      throw new NotFoundException({ message: "Kural bulunamadı" });
    const parsed = SETTINGS[key].schema.safeParse(body?.value);
    if (!parsed.success) {
      throw new BadRequestException({ message: parsed.error.issues[0]?.message ?? "Geçersiz değer" });
    }
    await this.prisma.$transaction((tx) => setSetting(tx, key, parsed.data as never, auth.userId));
    return { key, value: parsed.data };
  }

  /** STK-10: hareket toplamları ile bakiyeleri karşılaştırır (gece işi ayrıca worker'da). */
  @Get("consistency")
  @RequirePermission("stock", "APPROVE")
  async consistency() {
    const mismatches = await checkConsistency(this.prisma);
    return { checkedAt: new Date().toISOString(), ok: mismatches.length === 0, mismatches };
  }
}
