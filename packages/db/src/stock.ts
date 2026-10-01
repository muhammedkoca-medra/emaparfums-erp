/**
 * Stok servisi — StockBalance'ı güncelleyen TEK yer (CLAUDE.md kural 2, docs/03-moduller/stok.md).
 *
 * Tüm fonksiyonlar çağıranın transaction'ı (`tx`) içinde çalışır; hareket, bakiye, rezervasyon ve
 * olaylar (outbox) birlikte kaydedilir ya da hiçbiri kaydedilmez.
 *
 *  - STK-01 Bakiye yalnızca recordMovement / rezervasyon fonksiyonlarıyla değişir.
 *  - STK-02 Kullanılabilir = eldeki − rezerve; 0'ın altına düşemez.
 *  - STK-03 RELEASED olmayan lottan SALE / ISSUE / PRODUCTION_CONSUME yapılamaz.
 *  - STK-04 FEFO: SKT en yakın serbest lot önce; SKT'siz lotlar sona; eşitlikte önce giren.
 *  - STK-05 Kullanılabilir min stok altına düşünce stock.below_min (kalem başına N saatte bir).
 *  - STK-06 Her bakiye değişiminde stock.changed.
 *  - STK-10 checkConsistency: hareket toplamları ile bakiyeleri karşılaştırır.
 */
import { randomUUID } from "node:crypto";
import { parseSetting } from "@atelier/shared";
import { type Tx } from "./client.js";
import { type MovementType, Prisma } from "./generated/prisma/client.js";
import { writeAudit } from "./audit.js";
import { emit } from "./outbox.js";

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
type DecInput = Prisma.Decimal | string | number;

/** Kullanıcıya gösterilebilir (Türkçe) mesajlı iş kuralı hatası. */
export class StockError extends Error {
  constructor(
    public readonly code:
      | "QTY_NOT_POSITIVE"
      | "INVALID_LOCATIONS"
      | "LOT_ITEM_MISMATCH"
      | "LOT_NOT_FOUND"
      | "LOT_NOT_RELEASED"
      | "LOT_EXPIRED"
      | "INSUFFICIENT_AVAILABLE"
      | "RESERVATION_CLOSED",
    message: string,
  ) {
    super(message);
  }
}

const INBOUND: ReadonlySet<MovementType> = new Set(["RECEIPT", "PRODUCTION_OUTPUT", "RETURN"]);
const OUTBOUND: ReadonlySet<MovementType> = new Set(["ISSUE", "SALE", "SCRAP", "PRODUCTION_CONSUME"]);
/** STK-03: karantinadaki/reddedilen lottan yapılamayan çıkışlar. */
const QC_BLOCKED: ReadonlySet<MovementType> = new Set(["SALE", "ISSUE", "PRODUCTION_CONSUME"]);

export interface MovementInput {
  type: MovementType;
  itemId: string;
  lotId: string;
  qty: DecInput;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  unitCost?: DecInput | null;
  refType?: string | null;
  refId?: string | null;
  userId?: string | null;
  deviceId?: string | null;
  /** Elle hareket gerekçesi (düzeltme, transfer). */
  note?: string | null;
}

/** Hareketin yönünü ve lokasyon kurallarını doğrular. */
export function validateDirection(
  input: Pick<MovementInput, "type" | "fromLocationId" | "toLocationId">,
): void {
  const from = input.fromLocationId ?? null;
  const to = input.toLocationId ?? null;
  const bad = (msg: string) => {
    throw new StockError("INVALID_LOCATIONS", msg);
  };
  if (INBOUND.has(input.type)) {
    if (!to || from) bad("Giriş hareketinde yalnızca hedef lokasyon verilmeli");
  } else if (OUTBOUND.has(input.type)) {
    if (!from || to) bad("Çıkış hareketinde yalnızca kaynak lokasyon verilmeli");
  } else if (input.type === "TRANSFER") {
    if (!from || !to) bad("Transferde kaynak ve hedef lokasyon verilmeli");
    if (from === to) bad("Transferde kaynak ve hedef lokasyon farklı olmalı");
  } else if (input.type === "ADJUSTMENT") {
    if (Boolean(from) === Boolean(to))
      bad("Düzeltmede yalnızca biri verilmeli: artış için hedef, azalış için kaynak");
  }
}

interface BalanceRow {
  id: string;
  qtyOnHand: Dec;
  qtyReserved: Dec;
}

async function lockBalance(
  tx: Tx,
  itemId: string,
  lotId: string,
  locationId: string,
): Promise<BalanceRow | null> {
  const rows = await tx.$queryRaw<BalanceRow[]>`
    SELECT id, "qtyOnHand", "qtyReserved" FROM "StockBalance"
    WHERE "itemId" = ${itemId} AND "lotId" = ${lotId} AND "locationId" = ${locationId}
    FOR UPDATE`;
  const r = rows[0];
  return r ? { id: r.id, qtyOnHand: new D(r.qtyOnHand), qtyReserved: new D(r.qtyReserved) } : null;
}

/** Artış: satır yoksa oluşturur (eşzamanlı eklemede ON CONFLICT ile güvenli). */
async function increaseOnHand(tx: Tx, itemId: string, lotId: string, locationId: string, qty: Dec) {
  await tx.$executeRaw`
    INSERT INTO "StockBalance" (id, "itemId", "lotId", "locationId", "qtyOnHand", "qtyReserved", "updatedAt")
    VALUES (${randomUUID()}, ${itemId}, ${lotId}, ${locationId}, ${qty}, 0, now())
    ON CONFLICT ("itemId", "lotId", "locationId")
    DO UPDATE SET "qtyOnHand" = "StockBalance"."qtyOnHand" + EXCLUDED."qtyOnHand", "updatedAt" = now()`;
}

/** Azalış: satırı kilitler, kullanılabilir miktarı kontrol eder (STK-02). */
async function decreaseOnHand(tx: Tx, itemId: string, lotId: string, locationId: string, qty: Dec) {
  const bal = await lockBalance(tx, itemId, lotId, locationId);
  const available = bal ? bal.qtyOnHand.minus(bal.qtyReserved) : new D(0);
  if (!bal || available.lessThan(qty)) {
    throw new StockError(
      "INSUFFICIENT_AVAILABLE",
      `Yetersiz kullanılabilir stok: istenen ${qty.toString()}, kullanılabilir ${available.toString()}`,
    );
  }
  await tx.stockBalance.update({ where: { id: bal.id }, data: { qtyOnHand: bal.qtyOnHand.minus(qty) } });
}

/** Kalemin tüm lokasyonlardaki kullanılabilir toplamı. */
/**
 * Üretim/satış için FEFO ile ayrılabilir miktar: yalnızca serbest (RELEASED), süresi geçmemiş lotların
 * boştaki miktarı (`reserveFefo` ile aynı koşul, kural 3). Karantinadaki eldeki miktar ayrıca döner;
 * böylece "stok var ama kalite onayı bekliyor" durumu ekranda ayırt edilir.
 */
export async function reservableForItem(tx: Tx, itemId: string, now = new Date()): Promise<{ reservable: Dec; quarantine: Dec }> {
  const rows = await tx.stockBalance.findMany({
    where: { itemId },
    select: { qtyOnHand: true, qtyReserved: true, lot: { select: { qcStatus: true, expiryDate: true } } },
  });
  let reservable = new D(0);
  let quarantine = new D(0);
  for (const r of rows) {
    if (r.lot.qcStatus === "RELEASED" && (!r.lot.expiryDate || r.lot.expiryDate > now)) {
      const free = new D(r.qtyOnHand).minus(r.qtyReserved);
      if (free.greaterThan(0)) reservable = reservable.plus(free);
    } else if (r.lot.qcStatus === "QUARANTINE") {
      quarantine = quarantine.plus(r.qtyOnHand);
    }
  }
  return { reservable, quarantine };
}

export async function availableForItem(tx: Tx, itemId: string): Promise<Dec> {
  const r = await tx.stockBalance.aggregate({
    where: { itemId },
    _sum: { qtyOnHand: true, qtyReserved: true },
  });
  return new D(r._sum.qtyOnHand ?? 0).minus(r._sum.qtyReserved ?? 0);
}

async function getNumberSetting(tx: Tx, key: "stock.belowMinRenotifyHours") {
  const row = await tx.systemSetting.findUnique({ where: { key } });
  return parseSetting(key, row?.value);
}

/** STK-05 ve STK-06: bakiye değişiminden sonra olayları yazar. */
async function afterBalanceChange(tx: Tx, itemId: string, now: Date) {
  await emit(tx, { type: "stock.changed", itemId });
  const item = await tx.item.findUniqueOrThrow({
    where: { id: itemId },
    select: { minStock: true, belowMinNotifiedAt: true },
  });
  if (item.minStock === null) return;
  const available = await availableForItem(tx, itemId);
  if (!available.lessThan(item.minStock)) return;
  const hours = await getNumberSetting(tx, "stock.belowMinRenotifyHours");
  if (item.belowMinNotifiedAt && now.getTime() - item.belowMinNotifiedAt.getTime() < hours * 3_600_000)
    return;
  await tx.item.update({ where: { id: itemId }, data: { belowMinNotifiedAt: now } });
  await emit(tx, { type: "stock.below_min", itemId, available: available.toString() });
}

/**
 * Stok hareketi yazar ve bakiyeyi günceller (STK-01). Yön kuralları:
 *  - RECEIPT, PRODUCTION_OUTPUT, RETURN: yalnızca `toLocationId`
 *  - ISSUE, SALE, SCRAP, PRODUCTION_CONSUME: yalnızca `fromLocationId`
 *  - TRANSFER: ikisi de (farklı)
 *  - ADJUSTMENT: artış için `toLocationId`, azalış için `fromLocationId`
 */
export async function recordMovement(tx: Tx, input: MovementInput, now = new Date()) {
  const qty = new D(input.qty);
  if (!qty.isFinite() || qty.lessThanOrEqualTo(0)) {
    throw new StockError("QTY_NOT_POSITIVE", "Miktar sıfırdan büyük olmalı");
  }
  validateDirection(input);

  const lot = await tx.lot.findUnique({
    where: { id: input.lotId },
    select: { itemId: true, qcStatus: true },
  });
  if (!lot) throw new StockError("LOT_NOT_FOUND", "Lot bulunamadı");
  if (lot.itemId !== input.itemId) throw new StockError("LOT_ITEM_MISMATCH", "Lot bu kaleme ait değil");
  if (QC_BLOCKED.has(input.type) && lot.qcStatus !== "RELEASED") {
    throw new StockError("LOT_NOT_RELEASED", "Kalite onayı almamış (karantinadaki) lottan çıkış yapılamaz");
  }

  if (input.fromLocationId) await decreaseOnHand(tx, input.itemId, input.lotId, input.fromLocationId, qty);
  if (input.toLocationId) await increaseOnHand(tx, input.itemId, input.lotId, input.toLocationId, qty);

  const movement = await tx.stockMovement.create({
    data: {
      type: input.type,
      itemId: input.itemId,
      lotId: input.lotId,
      qty,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      unitCost: input.unitCost != null ? new D(input.unitCost) : null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? null,
      note: input.note ?? null,
      createdAt: now,
    },
  });
  // Transfer toplam kullanılabilir miktarı değiştirmez; kanallara yine bildirilir (lokasyon bazlı stok).
  await afterBalanceChange(tx, input.itemId, now);
  return movement;
}

// ---------------------------------------------------------------------------------------------
// Rezervasyon (STK-04 · FEFO)
// ---------------------------------------------------------------------------------------------

export interface ReserveInput {
  itemId: string;
  qty: DecInput;
  refType: string;
  refId: string;
  orderLineId?: string | null;
  /** Yalnızca bu depodaki lokasyonlardan ayır. */
  warehouseId?: string | null;
  userId?: string | null;
  note?: string | null;
}

interface CandidateRow {
  balanceId: string;
  lotId: string;
  locationId: string;
  qtyOnHand: Dec;
  qtyReserved: Dec;
  expiryDate: Date | null;
}

/**
 * FEFO rezervasyonu: serbest bırakılmış, süresi geçmemiş lotlardan SKT en yakın olandan başlar.
 * Hepsi ya da hiçbiri: yeterli kullanılabilir miktar yoksa hiçbir şey ayrılmaz.
 * Aday bakiye satırları FOR UPDATE ile kilitlenir; eşzamanlı iki rezervasyon aynı son adedi alamaz.
 */
export async function reserveFefo(tx: Tx, input: ReserveInput, now = new Date()) {
  const qty = new D(input.qty);
  if (!qty.isFinite() || qty.lessThanOrEqualTo(0)) {
    throw new StockError("QTY_NOT_POSITIVE", "Miktar sıfırdan büyük olmalı");
  }
  const warehouseFilter = input.warehouseId
    ? Prisma.sql`AND loc."warehouseId" = ${input.warehouseId}`
    : Prisma.empty;
  const candidates = await tx.$queryRaw<CandidateRow[]>`
    SELECT b.id AS "balanceId", b."lotId", b."locationId", b."qtyOnHand", b."qtyReserved", l."expiryDate"
    FROM "StockBalance" b
    JOIN "Lot" l ON l.id = b."lotId"
    JOIN "Location" loc ON loc.id = b."locationId"
    WHERE b."itemId" = ${input.itemId}
      AND l."qcStatus" = 'RELEASED'
      AND (l."expiryDate" IS NULL OR l."expiryDate" > ${now})
      AND b."qtyOnHand" - b."qtyReserved" > 0
      ${warehouseFilter}
    ORDER BY l."expiryDate" ASC NULLS LAST, l."createdAt" ASC, loc."pickSequence" ASC NULLS LAST, b.id ASC
    FOR UPDATE OF b`;

  let remaining = qty;
  const plan: { row: CandidateRow; take: Dec }[] = [];
  for (const row of candidates) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const free = new D(row.qtyOnHand).minus(row.qtyReserved);
    const take = D.min(free, remaining);
    plan.push({ row, take });
    remaining = remaining.minus(take);
  }
  if (remaining.greaterThan(0)) {
    throw new StockError(
      "INSUFFICIENT_AVAILABLE",
      `Rezervasyon için yetersiz stok: istenen ${qty.toString()}, ayrılabilir ${qty.minus(remaining).toString()}`,
    );
  }

  const reservations = [];
  for (const { row, take } of plan) {
    await tx.stockBalance.update({
      where: { id: row.balanceId },
      data: { qtyReserved: { increment: take } },
    });
    reservations.push(
      await tx.stockReservation.create({
        data: {
          itemId: input.itemId,
          lotId: row.lotId,
          locationId: row.locationId,
          qty: take,
          refType: input.refType,
          refId: input.refId,
          orderLineId: input.orderLineId ?? null,
          note: input.note ?? null,
          createdById: input.userId ?? null,
          createdAt: now,
        },
      }),
    );
  }
  await afterBalanceChange(tx, input.itemId, now);
  return reservations;
}

async function lockOpenReservation(tx: Tx, reservationId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "StockReservation" WHERE id = ${reservationId}
      AND "releasedAt" IS NULL AND "consumedAt" IS NULL FOR UPDATE`;
  if (!rows[0]) throw new StockError("RESERVATION_CLOSED", "Rezervasyon bulunamadı ya da kapanmış");
  return tx.stockReservation.findUniqueOrThrow({ where: { id: reservationId } });
}

async function decreaseReserved(tx: Tx, r: { itemId: string; lotId: string; locationId: string; qty: Dec }) {
  const bal = await lockBalance(tx, r.itemId, r.lotId, r.locationId);
  if (!bal) throw new StockError("RESERVATION_CLOSED", "Rezervasyonun bakiyesi bulunamadı");
  await tx.stockBalance.update({
    where: { id: bal.id },
    data: { qtyReserved: D.max(bal.qtyReserved.minus(r.qty), 0) },
  });
}

/** Rezervasyonu iptal eder (sipariş iptali, parti iptali). */
export async function releaseReservation(tx: Tx, reservationId: string, now = new Date()) {
  const r = await lockOpenReservation(tx, reservationId);
  await decreaseReserved(tx, { ...r, qty: new D(r.qty) });
  await tx.stockReservation.update({ where: { id: r.id }, data: { releasedAt: now } });
  await afterBalanceChange(tx, r.itemId, now);
}

/** Rezervasyonu tüketir: rezerve miktarı düşer ve aynı lot/lokasyondan çıkış hareketi yazılır. */
export async function consumeReservation(
  tx: Tx,
  reservationId: string,
  opts: {
    type: "SALE" | "PRODUCTION_CONSUME" | "ISSUE";
    refType?: string;
    refId?: string;
    userId?: string | null;
    deviceId?: string | null;
  },
  now = new Date(),
) {
  const r = await lockOpenReservation(tx, reservationId);
  await decreaseReserved(tx, { ...r, qty: new D(r.qty) });
  await tx.stockReservation.update({ where: { id: r.id }, data: { consumedAt: now } });
  return recordMovement(
    tx,
    {
      type: opts.type,
      itemId: r.itemId,
      lotId: r.lotId,
      qty: r.qty,
      fromLocationId: r.locationId,
      refType: opts.refType ?? r.refType,
      refId: opts.refId ?? r.refId,
      userId: opts.userId,
      deviceId: opts.deviceId,
    },
    now,
  );
}

// ---------------------------------------------------------------------------------------------
// Üretim tüketimi (URT-03)
// ---------------------------------------------------------------------------------------------

/**
 * Bir lotun birim maliyeti: önce girişteki (RECEIPT/PRODUCTION_OUTPUT) `unitCost`, yoksa kalemin
 * geçerli StandardCost'u, o da yoksa 0. Üretim tüketiminde BatchConsumption.unitCost için kullanılır.
 */
export async function lotUnitCost(tx: Tx, lotId: string, itemId: string, now = new Date()): Promise<Dec> {
  const mv = await tx.stockMovement.findFirst({
    where: { lotId, unitCost: { not: null }, type: { in: ["RECEIPT", "PRODUCTION_OUTPUT"] } },
    orderBy: { createdAt: "asc" },
    select: { unitCost: true },
  });
  if (mv?.unitCost != null) return new D(mv.unitCost);
  const sc = await tx.standardCost.findFirst({
    where: { itemId, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] },
    orderBy: { validFrom: "desc" },
    select: { amount: true },
  });
  return sc ? new D(sc.amount) : new D(0);
}

export interface BatchConsumptionResult {
  itemId: string;
  lotId: string;
  qty: Dec;
  unitCost: Dec;
  lineCost: Dec;
}

/**
 * URT-03: partinin açık rezervasyonlarını tüketir. Her rezervasyon için rezerve düşer, PRODUCTION_CONSUME
 * hareketi (lot maliyetiyle) ve BatchConsumption kaydı yazılır. Karantinadaki lottan çıkış recordMovement
 * ile zaten engellenir (STK-03). Dönüş: kalem/lot bazında tüketim ve satır maliyeti.
 */
export async function consumeBatchReservations(
  tx: Tx,
  input: { batchId: string; userId?: string | null },
  now = new Date(),
): Promise<BatchConsumptionResult[]> {
  const open = await tx.stockReservation.findMany({
    where: { refType: "ProductionBatch", refId: input.batchId, releasedAt: null, consumedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const results: BatchConsumptionResult[] = [];
  for (const { id } of open) {
    const r = await lockOpenReservation(tx, id);
    const qty = new D(r.qty);
    await decreaseReserved(tx, { ...r, qty });
    await tx.stockReservation.update({ where: { id: r.id }, data: { consumedAt: now } });
    const unitCost = await lotUnitCost(tx, r.lotId, r.itemId, now);
    await recordMovement(
      tx,
      {
        type: "PRODUCTION_CONSUME",
        itemId: r.itemId,
        lotId: r.lotId,
        qty,
        fromLocationId: r.locationId,
        unitCost,
        refType: "ProductionBatch",
        refId: input.batchId,
        userId: input.userId,
      },
      now,
    );
    await tx.batchConsumption.create({ data: { batchId: input.batchId, lotId: r.lotId, qty, unitCost } });
    results.push({ itemId: r.itemId, lotId: r.lotId, qty, unitCost, lineCost: qty.times(unitCost) });
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Lot
// ---------------------------------------------------------------------------------------------

/** Kalem için lot oluşturur (giriş öncesi). Yeni lot varsayılan olarak karantinadadır. */
export async function createLot(
  tx: Tx,
  input: {
    itemId: string;
    lotNo: string;
    expiryDate?: Date | null;
    mfgDate?: Date | null;
    supplierLotNo?: string | null;
    qcStatus?: "QUARANTINE" | "RELEASED";
  },
) {
  const item = await tx.item.findUniqueOrThrow({
    where: { id: input.itemId },
    select: { shelfLifeDays: true },
  });
  // SKT verilmemişse üretim tarihi + raf ömrü
  const expiry =
    input.expiryDate ??
    (input.mfgDate && item.shelfLifeDays
      ? new Date(input.mfgDate.getTime() + item.shelfLifeDays * 86_400_000)
      : null);
  return tx.lot.create({
    data: {
      itemId: input.itemId,
      lotNo: input.lotNo,
      expiryDate: expiry,
      mfgDate: input.mfgDate ?? null,
      supplierLotNo: input.supplierLotNo ?? null,
      qcStatus: input.qcStatus ?? "QUARANTINE",
    },
  });
}

/**
 * Lot kalite durumunu değiştirir; AuditLog (kural 7: lot durumu) ve olay yazar.
 * RELEASED → lot.released; QUARANTINE/REJECTED → lot.quarantined.
 */
export async function setLotQcStatus(
  tx: Tx,
  input: {
    lotId: string;
    status: "QUARANTINE" | "RELEASED" | "REJECTED";
    reason: string;
    userId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  const before = await tx.lot.findUniqueOrThrow({ where: { id: input.lotId } });
  if (before.qcStatus === input.status) return before;
  const after = await tx.lot.update({ where: { id: input.lotId }, data: { qcStatus: input.status } });
  await writeAudit(tx, {
    userId: input.userId,
    action: "lot.qc_status",
    entity: "Lot",
    entityId: input.lotId,
    before: { qcStatus: before.qcStatus },
    after: { qcStatus: after.qcStatus, reason: input.reason },
    ip: input.ip,
    userAgent: input.userAgent,
  });
  if (input.status === "RELEASED") await emit(tx, { type: "lot.released", lotId: input.lotId });
  else await emit(tx, { type: "lot.quarantined", lotId: input.lotId, reason: input.reason });
  await emit(tx, { type: "stock.changed", itemId: before.itemId });
  return after;
}

// ---------------------------------------------------------------------------------------------
// STK-10 · Tutarlılık
// ---------------------------------------------------------------------------------------------

export interface ConsistencyMismatch {
  itemId: string;
  lotId: string;
  locationId: string;
  kind: "ON_HAND" | "RESERVED";
  expected: string;
  actual: string;
}

/**
 * Hareket toplamlarını (giriş +, çıkış −) bakiyelerle, açık rezervasyon toplamlarını
 * qtyReserved ile karşılaştırır. Boş liste = tutarlı.
 */
export async function checkConsistency(tx: Tx): Promise<ConsistencyMismatch[]> {
  const onHand = await tx.$queryRaw<
    { itemId: string; lotId: string; locationId: string; expected: Dec | null; actual: Dec | null }[]
  >`
    WITH m AS (
      SELECT "itemId", "lotId", "toLocationId" AS loc, qty FROM "StockMovement" WHERE "toLocationId" IS NOT NULL
      UNION ALL
      SELECT "itemId", "lotId", "fromLocationId" AS loc, -qty FROM "StockMovement" WHERE "fromLocationId" IS NOT NULL
    ), s AS (SELECT "itemId", "lotId", loc, SUM(qty) AS total FROM m GROUP BY 1, 2, 3)
    SELECT COALESCE(s."itemId", b."itemId") AS "itemId", COALESCE(s."lotId", b."lotId") AS "lotId",
           COALESCE(s.loc, b."locationId") AS "locationId", s.total AS expected, b."qtyOnHand" AS actual
    FROM s FULL OUTER JOIN "StockBalance" b
      ON b."itemId" = s."itemId" AND b."lotId" = s."lotId" AND b."locationId" = s.loc
    WHERE COALESCE(s.total, 0) <> COALESCE(b."qtyOnHand", 0)`;

  const reserved = await tx.$queryRaw<
    { itemId: string; lotId: string; locationId: string; expected: Dec | null; actual: Dec | null }[]
  >`
    WITH r AS (
      SELECT "itemId", "lotId", "locationId", SUM(qty) AS total FROM "StockReservation"
      WHERE "releasedAt" IS NULL AND "consumedAt" IS NULL GROUP BY 1, 2, 3
    )
    SELECT COALESCE(r."itemId", b."itemId") AS "itemId", COALESCE(r."lotId", b."lotId") AS "lotId",
           COALESCE(r."locationId", b."locationId") AS "locationId", r.total AS expected, b."qtyReserved" AS actual
    FROM r FULL OUTER JOIN "StockBalance" b
      ON b."itemId" = r."itemId" AND b."lotId" = r."lotId" AND b."locationId" = r."locationId"
    WHERE COALESCE(r.total, 0) <> COALESCE(b."qtyReserved", 0)`;

  const fmt = (v: Dec | null) => new D(v ?? 0).toString();
  return [
    ...onHand.map((r) => ({
      ...r,
      kind: "ON_HAND" as const,
      expected: fmt(r.expected),
      actual: fmt(r.actual),
    })),
    ...reserved.map((r) => ({
      ...r,
      kind: "RESERVED" as const,
      expected: fmt(r.expected),
      actual: fmt(r.actual),
    })),
  ];
}
