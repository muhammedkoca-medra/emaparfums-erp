import { type Db, getSetting, Prisma } from "@atelier/db";
import { type BalancesQuery, type StockRowStatus } from "@atelier/shared";

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
const s = (v: Dec | null | undefined) => (v == null ? null : new D(v).toString());

/** Kalemlerin geçerli standart maliyeti (yoksa listede yer almaz). Maliyet modülü Faz 4'te dolar. */
export async function currentCosts(
  prisma: Db,
  itemIds: string[],
  at = new Date(),
): Promise<Map<string, Dec>> {
  if (itemIds.length === 0) return new Map();
  const rows = await prisma.standardCost.findMany({
    where: {
      itemId: { in: itemIds },
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    orderBy: { validFrom: "desc" },
  });
  const map = new Map<string, Dec>();
  for (const r of rows) if (!map.has(r.itemId)) map.set(r.itemId, new D(r.amount));
  return map;
}

export function rowStatus(input: {
  type: string;
  qcStatus: string | null;
  expiryDate: Date | null;
  itemAvailable: Dec;
  minStock: Dec | null;
  hasBalance: boolean;
  warnUntil: Date;
  now: Date;
}): StockRowStatus {
  if (input.qcStatus === "QUARANTINE") return "QUARANTINE";
  if (input.qcStatus === "REJECTED") return "REJECTED";
  if (input.minStock && input.itemAvailable.lessThan(input.minStock)) return "CRITICAL";
  if (input.expiryDate && input.expiryDate <= input.warnUntil) return "EXPIRING";
  if (input.type === "SEMI_FINISHED" && input.hasBalance) return "IN_PROCESS";
  return input.hasBalance ? "OK" : "EMPTY";
}

/** Stok listesi: kalem × lot × lokasyon; bakiyesi olmayan kalemler de (miktar 0) listelenir. */
export async function listBalances(prisma: Db, q: BalancesQuery, now = new Date()) {
  const days = await getSetting(prisma, "stock.expiryWarningDays");
  const warnUntil = new Date(now.getTime() + days * 86_400_000);
  const search = q.search?.trim();
  const items = await prisma.item.findMany({
    where: {
      ...(q.type ? { type: q.type } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
              { lots: { some: { lotNo: { contains: search, mode: "insensitive" } } } },
              { product: { barcode: search } },
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
      storageNote: true,
      balances: {
        where: {
          OR: [{ qtyOnHand: { gt: 0 } }, { qtyReserved: { gt: 0 } }],
          ...(q.warehouseId ? { location: { warehouseId: q.warehouseId } } : {}),
        },
        orderBy: [{ lot: { expiryDate: { sort: "asc", nulls: "last" } } }, { lot: { lotNo: "asc" } }],
        select: {
          qtyOnHand: true,
          qtyReserved: true,
          lot: { select: { id: true, lotNo: true, expiryDate: true, qcStatus: true } },
          location: { select: { id: true, code: true, warehouse: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const rows = [];
  for (const it of items) {
    const onHand = it.balances.reduce((a, b) => a.plus(b.qtyOnHand), new D(0));
    const reserved = it.balances.reduce((a, b) => a.plus(b.qtyReserved), new D(0));
    const itemAvailable = onHand.minus(reserved);
    const base = {
      itemId: it.id,
      code: it.code,
      name: it.name,
      type: it.type,
      uom: it.uom,
      minStock: s(it.minStock),
      itemAvailable: itemAvailable.toString(),
    };
    if (it.balances.length === 0) {
      // Depo filtresi varken bakiyesi olmayan kalemleri gösterme
      if (q.warehouseId) continue;
      rows.push({
        ...base,
        lotId: null,
        lotNo: null,
        expiryDate: null,
        qcStatus: null,
        locationId: null,
        locationCode: null,
        warehouseName: null,
        qtyOnHand: "0",
        qtyReserved: "0",
        status: rowStatus({
          ...it,
          qcStatus: null,
          expiryDate: null,
          itemAvailable,
          hasBalance: false,
          warnUntil,
          now,
        }),
      });
      continue;
    }
    for (const b of it.balances) {
      rows.push({
        ...base,
        lotId: b.lot.id,
        lotNo: b.lot.lotNo,
        expiryDate: b.lot.expiryDate?.toISOString() ?? null,
        qcStatus: b.lot.qcStatus,
        locationId: b.location.id,
        locationCode: b.location.code,
        warehouseName: b.location.warehouse.name,
        qtyOnHand: s(b.qtyOnHand)!,
        qtyReserved: s(b.qtyReserved)!,
        status: rowStatus({
          type: it.type,
          minStock: it.minStock,
          qcStatus: b.lot.qcStatus,
          expiryDate: b.lot.expiryDate,
          itemAvailable,
          hasBalance: true,
          warnUntil,
          now,
        }),
      });
    }
  }
  return rows;
}

/** Başlık göstergeleri (stok.md §KPI). Tahmini/uydurma değer üretmez; veri yoksa null döner. */
export async function stockSummary(prisma: Db, now = new Date()) {
  const days = await getSetting(prisma, "stock.expiryWarningDays");
  const warnUntil = new Date(now.getTime() + days * 86_400_000);
  const balances = await prisma.stockBalance.findMany({
    where: { qtyOnHand: { gt: 0 } },
    select: { itemId: true, qtyOnHand: true, qtyReserved: true, item: { select: { type: true } } },
  });
  const costs = await currentCosts(prisma, [...new Set(balances.map((b) => b.itemId))], now);

  let value = new D(0);
  const byType: Record<string, Dec> = {};
  const withoutCost = new Set<string>();
  const available = new Map<string, Dec>();
  for (const b of balances) {
    available.set(b.itemId, (available.get(b.itemId) ?? new D(0)).plus(b.qtyOnHand).minus(b.qtyReserved));
    const c = costs.get(b.itemId);
    if (!c) {
      withoutCost.add(b.itemId);
      continue;
    }
    const v = new D(b.qtyOnHand).mul(c);
    value = value.plus(v);
    byType[b.item.type] = (byType[b.item.type] ?? new D(0)).plus(v);
  }

  const withMin = await prisma.item.findMany({
    where: { minStock: { not: null } },
    select: { id: true, minStock: true },
  });
  const critical = withMin.filter((i) => (available.get(i.id) ?? new D(0)).lessThan(i.minStock!)).length;

  const expiring = await prisma.lot.count({
    where: { expiryDate: { lte: warnUntil }, balances: { some: { qtyOnHand: { gt: 0 } } } },
  });

  return {
    stockValue: withoutCost.size === balances.length && balances.length > 0 ? null : value.toFixed(2),
    stockValueByType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.toFixed(2)])),
    itemsWithoutCost: withoutCost.size,
    criticalItems: critical,
    expiringLots: expiring,
    expiryWarningDays: days,
    /** Stok devir hızı satış verisi gerektirir (Faz 2). */
    turnoverDays: null as number | null,
  };
}

export async function itemDetail(prisma: Db, itemId: string) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      product: { select: { id: true, sku: true, barcode: true, status: true } },
      lots: {
        orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
        include: {
          balances: {
            where: { OR: [{ qtyOnHand: { gt: 0 } }, { qtyReserved: { gt: 0 } }] },
            include: {
              location: { select: { id: true, code: true, warehouse: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!item) return null;
  const [movements, reservations] = await Promise.all([
    recentMovements(prisma, { itemId, limit: 50 }),
    prisma.stockReservation.findMany({
      where: { itemId, releasedAt: null, consumedAt: null },
      orderBy: { createdAt: "desc" },
      include: { lot: { select: { lotNo: true } }, location: { select: { code: true } } },
    }),
  ]);
  return { item, movements, reservations };
}

export async function recentMovements(prisma: Db, q: { itemId?: string; limit: number }) {
  const rows = await prisma.stockMovement.findMany({
    where: q.itemId ? { itemId: q.itemId } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit,
    include: {
      item: { select: { code: true, name: true, uom: true } },
      lot: { select: { lotNo: true } },
    },
  });
  const locIds = [
    ...new Set(rows.flatMap((r) => [r.fromLocationId, r.toLocationId]).filter(Boolean) as string[]),
  ];
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])];
  const [locs, users] = await Promise.all([
    prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, code: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
  ]);
  const loc = new Map(locs.map((l) => [l.id, l.code]));
  const usr = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    qty: r.qty.toString(),
    itemId: r.itemId,
    itemCode: r.item.code,
    itemName: r.item.name,
    uom: r.item.uom,
    lotNo: r.lot.lotNo,
    from: r.fromLocationId ? (loc.get(r.fromLocationId) ?? null) : null,
    to: r.toLocationId ? (loc.get(r.toLocationId) ?? null) : null,
    refType: r.refType,
    refId: r.refId,
    note: r.note,
    user: r.userId ? (usr.get(r.userId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function warehouses(prisma: Db) {
  const rows = await prisma.warehouse.findMany({
    orderBy: { code: "asc" },
    include: {
      locations: {
        orderBy: { pickSequence: "asc" },
        select: {
          id: true,
          code: true,
          tempMinC: true,
          tempMaxC: true,
          _count: { select: { balances: { where: { qtyOnHand: { gt: 0 } } } } },
        },
      },
    },
  });
  return rows.map((w) => {
    const temps = w.locations.filter((l) => l.tempMinC !== null && l.tempMaxC !== null);
    return {
      id: w.id,
      code: w.code,
      name: w.name,
      locations: w.locations.map((l) => ({ id: l.id, code: l.code, used: l._count.balances > 0 })),
      locationCount: w.locations.length,
      usedLocations: w.locations.filter((l) => l._count.balances > 0).length,
      tempMinC: temps.length ? D.min(...temps.map((l) => new D(l.tempMinC!))).toString() : null,
      tempMaxC: temps.length ? D.max(...temps.map((l) => new D(l.tempMaxC!))).toString() : null,
    };
  });
}

export async function expiringLots(prisma: Db, days: number, now = new Date()) {
  const until = new Date(now.getTime() + days * 86_400_000);
  const lots = await prisma.lot.findMany({
    where: { expiryDate: { lte: until }, balances: { some: { qtyOnHand: { gt: 0 } } } },
    orderBy: { expiryDate: "asc" },
    include: {
      item: { select: { id: true, code: true, name: true, uom: true } },
      balances: { where: { qtyOnHand: { gt: 0 } }, select: { qtyOnHand: true, qtyReserved: true } },
    },
  });
  return lots.map((l) => ({
    lotId: l.id,
    lotNo: l.lotNo,
    expiryDate: l.expiryDate!.toISOString(),
    daysLeft: Math.ceil((l.expiryDate!.getTime() - now.getTime()) / 86_400_000),
    expired: l.expiryDate! <= now,
    qcStatus: l.qcStatus,
    item: l.item,
    qtyOnHand: l.balances.reduce((a, b) => a.plus(b.qtyOnHand), new D(0)).toString(),
    qtyReserved: l.balances.reduce((a, b) => a.plus(b.qtyReserved), new D(0)).toString(),
  }));
}
