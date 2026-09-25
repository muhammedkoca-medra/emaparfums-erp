import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type Db, Prisma } from "./index.js";
import { getSetting, setSetting } from "./settings.js";
import {
  availableForItem,
  checkConsistency,
  consumeReservation,
  createLot,
  recordMovement,
  releaseReservation,
  reserveFefo,
  setLotQcStatus,
  StockError,
  validateDirection,
} from "./stock.js";
import { dbTestUrl } from "./test-support/env.js";

let prisma: Db;
let wh: { id: string };
let whB: { id: string };
let locA: string;
let locB: string;
let locOther: string;

beforeAll(async () => {
  prisma = createPrismaClient(dbTestUrl());
  wh = await prisma.warehouse.create({ data: { code: `W-${randomUUID().slice(0, 6)}`, name: "Test depo" } });
  whB = await prisma.warehouse.create({
    data: { code: `W-${randomUUID().slice(0, 6)}`, name: "İkinci depo" },
  });
  locA = (await prisma.location.create({ data: { warehouseId: wh.id, code: "A1", pickSequence: 1 } })).id;
  locB = (await prisma.location.create({ data: { warehouseId: wh.id, code: "B1", pickSequence: 2 } })).id;
  locOther = (await prisma.location.create({ data: { warehouseId: whB.id, code: "X1" } })).id;
});
afterAll(async () => {
  await prisma.$disconnect();
});

const tx = <T>(fn: (t: Db) => Promise<T>) => prisma.$transaction((t) => fn(t as unknown as Db));

async function newItem(minStock?: number) {
  return prisma.item.create({
    data: {
      code: `T-${randomUUID().slice(0, 8)}`,
      name: "Test kalemi",
      type: "FINISHED_GOOD",
      uom: "PCS",
      minStock: minStock !== undefined ? String(minStock) : null,
      shelfLifeDays: 365,
    },
  });
}

async function lotWith(
  itemId: string,
  qty: number,
  opts: { expiry?: Date | null; status?: "QUARANTINE" | "RELEASED"; loc?: string } = {},
) {
  return tx(async (t) => {
    const lot = await createLot(t, {
      itemId,
      lotNo: `L-${randomUUID().slice(0, 6)}`,
      expiryDate: opts.expiry ?? null,
      qcStatus: opts.status ?? "RELEASED",
    });
    if (qty > 0) {
      await recordMovement(t, {
        type: "RECEIPT",
        itemId,
        lotId: lot.id,
        qty,
        toLocationId: opts.loc ?? locA,
      });
    }
    return lot;
  });
}

const balance = (itemId: string, lotId: string, locationId = locA) =>
  prisma.stockBalance.findUnique({ where: { itemId_lotId_locationId: { itemId, lotId, locationId } } });

const events = (type: string, itemId: string) =>
  prisma.outboxEvent.findMany({ where: { type, aggregateId: itemId }, orderBy: { createdAt: "asc" } });

const expectStockError = async (p: Promise<unknown>, code: StockError["code"]) => {
  await expect(p).rejects.toBeInstanceOf(StockError);
  await expect(p).rejects.toMatchObject({ code });
};

describe("STK-01 · recordMovement", () => {
  it("giriş hareketi yazar, bakiyeyi aynı transaction'da günceller, stock.changed yayınlar", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 10);
    const bal = await balance(item.id, lot.id);
    expect(bal?.qtyOnHand.toString()).toBe("10");
    const movements = await prisma.stockMovement.findMany({ where: { lotId: lot.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "RECEIPT", toLocationId: locA, fromLocationId: null });
    expect(await events("stock.changed", item.id)).toHaveLength(1);
  });

  it("hata olursa hiçbir şey yazılmaz (hareket + bakiye + olay birlikte)", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 5);
    await expect(
      tx(async (t) => {
        await recordMovement(t, {
          type: "ISSUE",
          itemId: item.id,
          lotId: lot.id,
          qty: 2,
          fromLocationId: locA,
        });
        throw new Error("iptal");
      }),
    ).rejects.toThrow("iptal");
    expect((await balance(item.id, lot.id))?.qtyOnHand.toString()).toBe("5");
    expect(await prisma.stockMovement.count({ where: { lotId: lot.id } })).toBe(1);
  });

  it("ondalıklı miktarlar Decimal ile tam hesaplanır", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 0);
    await tx((t) =>
      recordMovement(t, { type: "RECEIPT", itemId: item.id, lotId: lot.id, qty: "0.1", toLocationId: locA }),
    );
    await tx((t) =>
      recordMovement(t, { type: "RECEIPT", itemId: item.id, lotId: lot.id, qty: "0.2", toLocationId: locA }),
    );
    expect((await balance(item.id, lot.id))?.qtyOnHand.toString()).toBe("0.3");
  });

  it("sıfır/negatif miktar, yanlış lot ve olmayan lot reddedilir", async () => {
    const item = await newItem();
    const other = await newItem();
    const lot = await lotWith(item.id, 1);
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "RECEIPT", itemId: item.id, lotId: lot.id, qty: 0, toLocationId: locA }),
      ),
      "QTY_NOT_POSITIVE",
    );
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "RECEIPT", itemId: item.id, lotId: lot.id, qty: -3, toLocationId: locA }),
      ),
      "QTY_NOT_POSITIVE",
    );
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "RECEIPT", itemId: other.id, lotId: lot.id, qty: 1, toLocationId: locA }),
      ),
      "LOT_ITEM_MISMATCH",
    );
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "RECEIPT", itemId: item.id, lotId: "yok", qty: 1, toLocationId: locA }),
      ),
      "LOT_NOT_FOUND",
    );
  });

  it("yön kuralları", () => {
    const ok = [
      { type: "RECEIPT", toLocationId: "a" },
      { type: "PRODUCTION_OUTPUT", toLocationId: "a" },
      { type: "RETURN", toLocationId: "a" },
      { type: "SALE", fromLocationId: "a" },
      { type: "ISSUE", fromLocationId: "a" },
      { type: "SCRAP", fromLocationId: "a" },
      { type: "PRODUCTION_CONSUME", fromLocationId: "a" },
      { type: "TRANSFER", fromLocationId: "a", toLocationId: "b" },
      { type: "ADJUSTMENT", toLocationId: "a" },
      { type: "ADJUSTMENT", fromLocationId: "a" },
    ] as const;
    for (const input of ok) expect(() => validateDirection(input)).not.toThrow();
    const bad = [
      { type: "RECEIPT", fromLocationId: "a" },
      { type: "RECEIPT", fromLocationId: "a", toLocationId: "b" },
      { type: "SALE", toLocationId: "a" },
      { type: "TRANSFER", fromLocationId: "a" },
      { type: "TRANSFER", fromLocationId: "a", toLocationId: "a" },
      { type: "ADJUSTMENT" },
      { type: "ADJUSTMENT", fromLocationId: "a", toLocationId: "b" },
    ] as const;
    for (const input of bad) expect(() => validateDirection(input)).toThrow(StockError);
  });

  it("transfer lokasyonlar arasında taşır; toplam değişmez", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 10);
    await tx((t) =>
      recordMovement(t, {
        type: "TRANSFER",
        itemId: item.id,
        lotId: lot.id,
        qty: 4,
        fromLocationId: locA,
        toLocationId: locB,
      }),
    );
    expect((await balance(item.id, lot.id, locA))?.qtyOnHand.toString()).toBe("6");
    expect((await balance(item.id, lot.id, locB))?.qtyOnHand.toString()).toBe("4");
    expect((await tx((t) => availableForItem(t, item.id))).toString()).toBe("10");
  });

  it("düzeltme artış ve azalış", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 10);
    await tx((t) =>
      recordMovement(t, { type: "ADJUSTMENT", itemId: item.id, lotId: lot.id, qty: 3, toLocationId: locA }),
    );
    await tx((t) =>
      recordMovement(t, { type: "ADJUSTMENT", itemId: item.id, lotId: lot.id, qty: 5, fromLocationId: locA }),
    );
    expect((await balance(item.id, lot.id))?.qtyOnHand.toString()).toBe("8");
  });
});

describe("STK-02 · kullanılabilir miktar negatife düşemez", () => {
  it("eldekinden fazla çıkış reddedilir", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 3);
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "SALE", itemId: item.id, lotId: lot.id, qty: 4, fromLocationId: locA }),
      ),
      "INSUFFICIENT_AVAILABLE",
    );
  });

  it("rezerve miktar kullanılabilirden düşülür", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 5);
    await tx((t) => reserveFefo(t, { itemId: item.id, qty: 4, refType: "Manual", refId: "r1" }));
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "ISSUE", itemId: item.id, lotId: lot.id, qty: 2, fromLocationId: locA }),
      ),
      "INSUFFICIENT_AVAILABLE",
    );
    await tx((t) =>
      recordMovement(t, { type: "ISSUE", itemId: item.id, lotId: lot.id, qty: 1, fromLocationId: locA }),
    );
  });

  it("olmayan bakiye satırından çıkış reddedilir", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 3);
    await expectStockError(
      tx((t) =>
        recordMovement(t, { type: "ISSUE", itemId: item.id, lotId: lot.id, qty: 1, fromLocationId: locB }),
      ),
      "INSUFFICIENT_AVAILABLE",
    );
  });
});

describe("STK-03 · karantinadaki lot", () => {
  it("SALE, ISSUE ve PRODUCTION_CONSUME yapılamaz; TRANSFER ve SCRAP yapılabilir", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 10, { status: "QUARANTINE" });
    for (const type of ["SALE", "ISSUE", "PRODUCTION_CONSUME"] as const) {
      await expectStockError(
        tx((t) => recordMovement(t, { type, itemId: item.id, lotId: lot.id, qty: 1, fromLocationId: locA })),
        "LOT_NOT_RELEASED",
      );
    }
    await tx((t) =>
      recordMovement(t, {
        type: "TRANSFER",
        itemId: item.id,
        lotId: lot.id,
        qty: 1,
        fromLocationId: locA,
        toLocationId: locB,
      }),
    );
    await tx((t) =>
      recordMovement(t, { type: "SCRAP", itemId: item.id, lotId: lot.id, qty: 1, fromLocationId: locA }),
    );
  });
});

describe("STK-04 · FEFO rezervasyonu", () => {
  const day = (d: number) => new Date(Date.UTC(2027, 0, d));

  it("SKT en yakın serbest lottan başlar; SKT'siz sona; karantina ve süresi geçen atlanır", async () => {
    const item = await newItem();
    const late = await lotWith(item.id, 5, { expiry: day(20) });
    const noExpiry = await lotWith(item.id, 5, { expiry: null });
    const early = await lotWith(item.id, 3, { expiry: day(10) });
    await lotWith(item.id, 50, { expiry: day(1), status: "QUARANTINE" });
    await lotWith(item.id, 50, { expiry: new Date(Date.UTC(2020, 0, 1)) }); // süresi geçmiş

    const res = await tx((t) =>
      reserveFefo(t, { itemId: item.id, qty: 10, refType: "Manual", refId: "fefo" }),
    );
    expect(res.map((r) => [r.lotId, r.qty.toString()])).toEqual([
      [early.id, "3"],
      [late.id, "5"],
      [noExpiry.id, "2"],
    ]);
    expect((await balance(item.id, early.id))?.qtyReserved.toString()).toBe("3");
    expect((await balance(item.id, noExpiry.id))?.qtyReserved.toString()).toBe("2");
  });

  it("SKT eşitse önce giren önce çıkar", async () => {
    const item = await newItem();
    const first = await lotWith(item.id, 2, { expiry: day(5) });
    await lotWith(item.id, 2, { expiry: day(5) });
    const res = await tx((t) => reserveFefo(t, { itemId: item.id, qty: 1, refType: "Manual", refId: "eq" }));
    expect(res[0]!.lotId).toBe(first.id);
  });

  it("depo filtresi uygulanır", async () => {
    const item = await newItem();
    await lotWith(item.id, 5, { loc: locOther });
    await expectStockError(
      tx((t) =>
        reserveFefo(t, { itemId: item.id, qty: 1, refType: "Manual", refId: "w", warehouseId: wh.id }),
      ),
      "INSUFFICIENT_AVAILABLE",
    );
    const r = await tx((t) =>
      reserveFefo(t, { itemId: item.id, qty: 1, refType: "Manual", refId: "w", warehouseId: whB.id }),
    );
    expect(r[0]!.locationId).toBe(locOther);
  });

  it("yetersizse hiçbir şey ayrılmaz (hepsi ya da hiçbiri)", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 3);
    await expectStockError(
      tx((t) => reserveFefo(t, { itemId: item.id, qty: 4, refType: "Manual", refId: "x" })),
      "INSUFFICIENT_AVAILABLE",
    );
    expect((await balance(item.id, lot.id))?.qtyReserved.toString()).toBe("0");
    expect(await prisma.stockReservation.count({ where: { itemId: item.id } })).toBe(0);
    await expectStockError(
      tx((t) => reserveFefo(t, { itemId: item.id, qty: 0, refType: "Manual", refId: "x" })),
      "QTY_NOT_POSITIVE",
    );
  });

  it("eşzamanlı iki rezervasyon aynı son adedi alamaz", async () => {
    const item = await newItem();
    await lotWith(item.id, 1);
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        tx((t) => reserveFefo(t, { itemId: item.id, qty: 1, refType: "Manual", refId: `c${n}` })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "INSUFFICIENT_AVAILABLE" });
    expect(await prisma.stockReservation.count({ where: { itemId: item.id } })).toBe(1);
  });

  it("eşzamanlı çok sayıda rezervasyonda fazla ayırma olmaz", async () => {
    const item = await newItem();
    await lotWith(item.id, 7);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, n) =>
        tx((t) => reserveFefo(t, { itemId: item.id, qty: 1, refType: "Manual", refId: `m${n}` })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(7);
    expect((await tx((t) => availableForItem(t, item.id))).toString()).toBe("0");
  });
});

describe("rezervasyon iptali ve tüketimi", () => {
  it("iptal rezerveyi geri verir; ikinci iptal reddedilir", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 5);
    const [r] = await tx((t) => reserveFefo(t, { itemId: item.id, qty: 2, refType: "Manual", refId: "rel" }));
    await tx((t) => releaseReservation(t, r!.id));
    expect((await balance(item.id, lot.id))?.qtyReserved.toString()).toBe("0");
    await expectStockError(
      tx((t) => releaseReservation(t, r!.id)),
      "RESERVATION_CLOSED",
    );
  });

  it("tüketim rezerveyi ve eldekini birlikte düşer, SALE hareketi yazar", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 5);
    const [r] = await tx((t) =>
      reserveFefo(t, { itemId: item.id, qty: 5, refType: "SalesOrderLine", refId: "sol-1" }),
    );
    const m = await tx((t) => consumeReservation(t, r!.id, { type: "SALE", userId: null }));
    expect(m).toMatchObject({
      type: "SALE",
      refType: "SalesOrderLine",
      refId: "sol-1",
      fromLocationId: locA,
    });
    const bal = await balance(item.id, lot.id);
    expect([bal?.qtyOnHand.toString(), bal?.qtyReserved.toString()]).toEqual(["0", "0"]);
    expect(
      (await prisma.stockReservation.findUniqueOrThrow({ where: { id: r!.id } })).consumedAt,
    ).not.toBeNull();
    await expectStockError(
      tx((t) => consumeReservation(t, r!.id, { type: "SALE" })),
      "RESERVATION_CLOSED",
    );
  });
});

describe("STK-05 · min stok bildirimi", () => {
  it("kullanılabilir min altına düşünce yayınlanır; pencere içinde tekrar edilmez, pencere sonra edilir", async () => {
    const item = await newItem(10);
    const t0 = new Date("2027-03-01T08:00:00Z");
    const lot = await tx(async (t) => {
      const l = await createLot(t, { itemId: item.id, lotNo: "L-min", qcStatus: "RELEASED" });
      await recordMovement(
        t,
        { type: "RECEIPT", itemId: item.id, lotId: l.id, qty: 12, toLocationId: locA },
        t0,
      );
      return l;
    });
    expect(await events("stock.below_min", item.id)).toHaveLength(0);

    const out = (qty: number, at: Date) =>
      tx((t) =>
        recordMovement(t, { type: "SALE", itemId: item.id, lotId: lot.id, qty, fromLocationId: locA }, at),
      );
    await out(3, t0); // 9 < 10
    const first = await events("stock.below_min", item.id);
    expect(first).toHaveLength(1);
    expect(first[0]!.payload).toMatchObject({ available: "9" });

    await out(1, new Date(t0.getTime() + 3_600_000)); // 1 saat sonra
    expect(await events("stock.below_min", item.id)).toHaveLength(1);

    await out(1, new Date(t0.getTime() + 25 * 3_600_000)); // 25 saat sonra
    expect(await events("stock.below_min", item.id)).toHaveLength(2);
  });

  it("min stok tanımlı değilse yayınlanmaz", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 1);
    await tx((t) =>
      recordMovement(t, { type: "SALE", itemId: item.id, lotId: lot.id, qty: 1, fromLocationId: locA }),
    );
    expect(await events("stock.below_min", item.id)).toHaveLength(0);
  });

  it("bildirim aralığı ayardan okunur", async () => {
    await tx((t) => setSetting(t, "stock.belowMinRenotifyHours", 2, null));
    expect(await tx((t) => getSetting(t, "stock.belowMinRenotifyHours"))).toBe(2);
    const item = await newItem(5);
    const t0 = new Date("2027-04-01T08:00:00Z");
    const lot = await tx(async (t) => {
      const l = await createLot(t, { itemId: item.id, lotNo: "L-set", qcStatus: "RELEASED" });
      await recordMovement(
        t,
        { type: "RECEIPT", itemId: item.id, lotId: l.id, qty: 4, toLocationId: locA },
        t0,
      );
      return l;
    });
    expect(await events("stock.below_min", item.id)).toHaveLength(1);
    await tx((t) =>
      recordMovement(
        t,
        { type: "SALE", itemId: item.id, lotId: lot.id, qty: 1, fromLocationId: locA },
        new Date(t0.getTime() + 3 * 3_600_000),
      ),
    );
    expect(await events("stock.below_min", item.id)).toHaveLength(2);
    await tx((t) => setSetting(t, "stock.belowMinRenotifyHours", 24, null));
  });
});

describe("lot", () => {
  it("SKT verilmezse üretim tarihi + raf ömrü", async () => {
    const item = await newItem();
    const lot = await tx((t) =>
      createLot(t, { itemId: item.id, lotNo: "L-shelf", mfgDate: new Date("2027-01-01T00:00:00Z") }),
    );
    expect(lot.qcStatus).toBe("QUARANTINE");
    expect(lot.expiryDate?.toISOString()).toBe("2028-01-01T00:00:00.000Z");
  });

  it("kalite durumu değişikliği denetim kaydı ve olay yazar", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 1, { status: "QUARANTINE" });
    await tx((t) =>
      setLotQcStatus(t, { lotId: lot.id, status: "RELEASED", reason: "Analiz uygun", userId: null }),
    );
    await tx((t) => setLotQcStatus(t, { lotId: lot.id, status: "RELEASED", reason: "tekrar", userId: null })); // değişmez
    await tx((t) =>
      setLotQcStatus(t, { lotId: lot.id, status: "REJECTED", reason: "Koku sapması", userId: null }),
    );
    const audit = await prisma.auditLog.findMany({
      where: { entity: "Lot", entityId: lot.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => [a.before, a.after])).toEqual([
      [{ qcStatus: "QUARANTINE" }, { qcStatus: "RELEASED", reason: "Analiz uygun" }],
      [{ qcStatus: "RELEASED" }, { qcStatus: "REJECTED", reason: "Koku sapması" }],
    ]);
    expect(await prisma.outboxEvent.count({ where: { type: "lot.released", aggregateId: lot.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { type: "lot.quarantined", aggregateId: lot.id } })).toBe(
      1,
    );
  });
});

describe("STK-10 · tutarlılık kontrolü", () => {
  it("normal işlemlerden sonra fark yok; bakiye elle bozulursa bulunur", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 10);
    await tx((t) => reserveFefo(t, { itemId: item.id, qty: 2, refType: "Manual", refId: "cc" }));
    const mine = async () => (await tx((t) => checkConsistency(t))).filter((m) => m.itemId === item.id);
    expect(await mine()).toEqual([]);

    // Test amaçlı kural dışı yazım: servis dışı güncelleme tutarsızlık yaratır
    await prisma.$executeRaw`UPDATE "StockBalance" SET "qtyOnHand" = 11, "qtyReserved" = 3
      WHERE "itemId" = ${item.id} AND "lotId" = ${lot.id}`;
    const found = await mine();
    expect(found.map((f) => [f.kind, f.expected, f.actual]).sort()).toEqual([
      ["ON_HAND", "10", "11"],
      ["RESERVED", "2", "3"],
    ]);
  });

  it("veritabanı negatif bakiyeyi reddeder (CHECK)", async () => {
    const item = await newItem();
    const lot = await lotWith(item.id, 1);
    await expect(
      prisma.$executeRaw`UPDATE "StockBalance" SET "qtyOnHand" = -1 WHERE "itemId" = ${item.id} AND "lotId" = ${lot.id}`,
    ).rejects.toThrow();
    await expect(
      prisma.stockMovement.create({
        data: {
          type: "RECEIPT",
          itemId: item.id,
          lotId: lot.id,
          qty: new Prisma.Decimal(0),
          toLocationId: locA,
        },
      }),
    ).rejects.toThrow();
  });
});
