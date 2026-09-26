import { randomUUID } from "node:crypto";
import { createLot, createPrismaClient, type Db, recordMovement } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runComplianceExpiry, runStockConsistency } from "../src/scheduled.js";
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

describe("KAL-05 · uyum belgesi süre kontrolü", () => {
  async function product(status: "ACTIVE" | "SALES_LOCKED" = "ACTIVE") {
    const sfx = randomUUID().slice(0, 6);
    const it = await prisma.item.create({ data: { code: `CX-${sfx}`, name: "CX", type: "FINISHED_GOOD", uom: "PCS" } });
    return prisma.product.create({ data: { itemId: it.id, sku: `CXS-${sfx}`, name: "P", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status } });
  }

  it("süresi dolan zorunlu belge EXPIRED olur ve ürün SALES_LOCKED'a geçer", async () => {
    const log = pino({ level: "silent" });
    const p = await product("ACTIVE");
    // Tüm zorunlu belgeler VALID; biri dün dolmuş.
    for (const type of ["UTS_NOTIFICATION", "SAFETY_ASSESSMENT", "PIF", "LABEL_APPROVAL"] as const) {
      await prisma.complianceDocument.create({ data: { productId: p.id, type, status: "VALID", validUntil: type === "PIF" ? new Date(Date.now() - 86_400_000) : new Date(Date.now() + 86_400_000 * 90) } });
    }
    const res = await runComplianceExpiry(prisma, log);
    expect(res.expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SALES_LOCKED");
    expect((await prisma.complianceDocument.findFirstOrThrow({ where: { productId: p.id, type: "PIF" } })).status).toBe("EXPIRED");
  });
});
