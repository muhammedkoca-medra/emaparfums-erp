import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requisitionOnBelowMin } from "../src/handlers/mrp.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const deps = (id: string) => ({ prisma, log, eventId: id });

beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(() => prisma.$disconnect());

describe("MRP: stock.below_min → satın alma talebi (SAT-01)", () => {
  it("hammadde için talep açar (min − kullanılabilir), tercihli tedarikçi ve teslim süresiyle; ikinci olayda çift açmaz", async () => {
    const item = await prisma.item.create({ data: { code: `HM-${tag()}`, name: "Esans", type: "RAW_MATERIAL", uom: "L", minStock: "20" } });
    const supplier = await prisma.supplier.create({ data: { name: `Tedarikçi ${tag()}` } });
    await prisma.supplierItem.create({ data: { supplierId: supplier.id, itemId: item.id, price: "1500", currency: "TRY", leadTimeDays: 10, isPreferred: true } });

    await requisitionOnBelowMin({ type: "stock.below_min", itemId: item.id, available: "5" }, deps("r1"));
    await requisitionOnBelowMin({ type: "stock.below_min", itemId: item.id, available: "4" }, deps("r2"));
    const reqs = await prisma.purchaseRequisition.findMany({ where: { itemId: item.id } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.qty.toString()).toBe("15");
    expect(reqs[0]!.source).toBe("MRP");
    expect(reqs[0]!.suggestedSupplierId).toBe(supplier.id);
    const days = (reqs[0]!.neededBy.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(10);
    expect(await prisma.outboxEvent.count({ where: { type: "requisition.created", payload: { path: ["requisitionId"], equals: reqs[0]!.id } } })).toBe(1);
  });

  it("sipariş miktarı tanımlıysa onu kullanır; mamul için talep açmaz", async () => {
    const raw = await prisma.item.create({ data: { code: `AM-${tag()}`, name: "Şişe", type: "PACKAGING", uom: "PCS", minStock: "100", reorderQty: "1000" } });
    await requisitionOnBelowMin({ type: "stock.below_min", itemId: raw.id, available: "10" }, deps("r3"));
    expect((await prisma.purchaseRequisition.findFirstOrThrow({ where: { itemId: raw.id } })).qty.toString()).toBe("1000");

    const fg = await prisma.item.create({ data: { code: `MM-${tag()}`, name: "Mamul", type: "FINISHED_GOOD", uom: "PCS", minStock: "50" } });
    await requisitionOnBelowMin({ type: "stock.below_min", itemId: fg.id, available: "1" }, deps("r4"));
    expect(await prisma.purchaseRequisition.count({ where: { itemId: fg.id } })).toBe(0);
  });
});
