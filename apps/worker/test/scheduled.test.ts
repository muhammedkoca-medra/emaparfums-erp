import { randomUUID } from "node:crypto";
import { createLot, createPrismaClient, type Db, recordMovement } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runStockConsistency } from "../src/scheduled.js";
import { workerTestDbUrl } from "./env.js";

let prisma: Db;
beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("STK-10 · gece tutarlılık işi", () => {
  it("tutarlıyken boş, bozulunca alarm verir", async () => {
    const lines: { level: number; msg: string }[] = [];
    const log = pino({ level: "info" }, { write: (s: string) => void lines.push(JSON.parse(s)) });
    const wh = await prisma.warehouse.create({ data: { code: `C-${randomUUID().slice(0, 6)}`, name: "T" } });
    const loc = await prisma.location.create({ data: { warehouseId: wh.id, code: "A" } });
    const item = await prisma.item.create({
      data: { code: `C-${randomUUID().slice(0, 6)}`, name: "T", type: "PACKAGING", uom: "PCS" },
    });
    const lot = await prisma.$transaction(async (tx) => {
      const l = await createLot(tx, { itemId: item.id, lotNo: "L1" });
      await recordMovement(tx, {
        type: "RECEIPT",
        itemId: item.id,
        lotId: l.id,
        qty: 5,
        toLocationId: loc.id,
      });
      return l;
    });
    expect(await runStockConsistency(prisma, log)).toEqual([]);

    await prisma.$executeRaw`UPDATE "StockBalance" SET "qtyOnHand" = 7 WHERE "lotId" = ${lot.id}`;
    const found = await runStockConsistency(prisma, log);
    expect(found).toHaveLength(1);
    expect(lines.some((l) => l.level === 50 && l.msg.startsWith("ALARM"))).toBe(true);
    // Test verisini düzelt (diğer testleri etkilemesin)
    await prisma.$executeRaw`UPDATE "StockBalance" SET "qtyOnHand" = 5 WHERE "lotId" = ${lot.id}`;
  });
});
