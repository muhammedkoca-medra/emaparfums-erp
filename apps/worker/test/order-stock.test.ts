import { createLot, createPrismaClient, type Db, recordMovement } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { earnLoyaltyOnOrderConfirmed, reverseLoyaltyOnOrderCancelled } from "../src/handlers/loyalty.js";
import { backfillOnStockChanged, releaseOnOrderCancelled, reserveOnOrderConfirmed, shipOnShipmentCreated } from "../src/handlers/order-stock.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;
let locId: string;
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const deps = (id: string) => ({ prisma, log, eventId: id });

async function product() {
  const t = tag();
  const item = await prisma.item.create({ data: { code: `MM-${t}`, name: `Mamul ${t}`, type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await prisma.product.create({
    data: { itemId: item.id, sku: `SKU-${t}`, name: `Ürün ${t}`, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" },
  });
  return { itemId: item.id, productId: p.id };
}

async function receive(itemId: string, qty: number, status: "RELEASED" | "QUARANTINE" = "RELEASED") {
  await prisma.$transaction(async (tx) => {
    const lot = await createLot(tx, { itemId, lotNo: `L-${tag()}`, qcStatus: status, expiryDate: new Date("2031-01-01") });
    await recordMovement(tx, { type: "RECEIPT", itemId, lotId: lot.id, qty, toLocationId: locId, refType: "Test", refId: "order-stock" });
  });
}

async function order(productId: string, qty: number, opts: { customerId?: string; status?: "CONFIRMED" | "PICKING" } = {}) {
  const channel = await prisma.salesChannel.create({ data: { code: `C-${tag()}`, name: "K", type: "WEBSITE" } });
  const customerId = opts.customerId ?? (await prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Test Müşteri" } })).id;
  const o = await prisma.salesOrder.create({
    data: { number: `T-${tag()}`, channelId: channel.id, customerId, status: opts.status ?? "CONFIRMED", netTotal: "1000", otvTotal: "0", kdvTotal: "0", grandTotal: "1000" },
  });
  const line = await prisma.salesOrderLine.create({
    data: { orderId: o.id, productId, qty, unitPriceGross: "100", discount: "0", otvRate: "0", kdvRate: "0.2", netAmount: "1000", otvAmount: "0", kdvAmount: "0" },
  });
  return { orderId: o.id, lineId: line.id };
}

const reserved = async (lineId: string) =>
  (await prisma.stockReservation.aggregate({ where: { orderLineId: lineId, releasedAt: null, consumedAt: null }, _sum: { qty: true } }))._sum.qty?.toString() ?? "0";

beforeAll(async () => {
  prisma = createPrismaClient(workerTestDbUrl());
  const wh = await prisma.warehouse.create({ data: { code: `W-${tag()}`, name: "Sipariş testi" } });
  locId = (await prisma.location.create({ data: { warehouseId: wh.id, code: "S-01", pickSequence: 1 } })).id;
});
afterAll(() => prisma.$disconnect());

describe("sipariş ↔ stok zinciri", () => {
  it("onayda serbest stok ayrılır; eksik kısım stok gelince tamamlanır; sevkiyatta SALE ile düşülür", async () => {
    const { itemId, productId } = await product();
    await receive(itemId, 6);
    await receive(itemId, 50, "QUARANTINE"); // karantina sayılmaz (kural 3)
    const { orderId, lineId } = await order(productId, 10);

    await reserveOnOrderConfirmed({ type: "order.confirmed", orderId }, deps("e1"));
    expect(await reserved(lineId)).toBe("6");
    // Idempotent: tekrar teslim çift ayırmaz
    await reserveOnOrderConfirmed({ type: "order.confirmed", orderId }, deps("e1"));
    expect(await reserved(lineId)).toBe("6");
    expect(await prisma.outboxEvent.count({ where: { type: "stock.reserved", payload: { path: ["orderId"], equals: orderId } } })).toBe(1);

    // Stok geldi → bekleyen 4 adet tamamlanır
    await receive(itemId, 5);
    await backfillOnStockChanged({ type: "stock.changed", itemId }, deps("e2"));
    expect(await reserved(lineId)).toBe("10");

    // Sevkiyat → 10 adet SALE, sipariş SHIPPED (CONFIRMED → PICKING → SHIPPED)
    const carrier = await prisma.carrier.create({ data: { code: `K-${tag()}`, name: "Kargo" } });
    const shipment = await prisma.shipment.create({ data: { orderId, carrierId: carrier.id, status: "LABEL_PRINTED" } });
    await shipOnShipmentCreated({ type: "shipment.created", shipmentId: shipment.id }, deps("e3"));
    const sale = await prisma.stockMovement.aggregate({ where: { itemId, type: "SALE", refId: shipment.id }, _sum: { qty: true } });
    expect(sale._sum.qty?.toString()).toBe("10");
    expect(await reserved(lineId)).toBe("0");
    expect((await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("SHIPPED");
    const bal = await prisma.stockBalance.aggregate({ where: { itemId, lot: { qcStatus: "RELEASED" } }, _sum: { qtyOnHand: true } });
    expect(bal._sum.qtyOnHand?.toString()).toBe("1"); // 6 + 5 − 10
  });

  it("stok gelince en eski sipariş önce tamamlanır", async () => {
    const { itemId, productId } = await product();
    const first = await order(productId, 3);
    await new Promise((r) => setTimeout(r, 10));
    const second = await order(productId, 3);
    await receive(itemId, 4);
    await backfillOnStockChanged({ type: "stock.changed", itemId }, deps("e4"));
    expect(await reserved(first.lineId)).toBe("3");
    expect(await reserved(second.lineId)).toBe("1");
  });

  it("iptal: açık rezervasyon stoğa döner, kazanılan sadakat puanı geri alınır", async () => {
    const { itemId, productId } = await product();
    await receive(itemId, 5);
    // Seviye yoksa geçici bir taban seviye; test sonunda (hesap ve hareketleriyle) temizlenir — diğer testleri etkilemesin.
    const existing = await prisma.loyaltyTier.findFirst();
    const temp = existing ? null : await prisma.loyaltyTier.create({ data: { code: `T${tag()}`, name: "Taban", minPoints: 0, earnPct: "1" } });
    const customer = await prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Puanlı Müşteri" } });
    onTestFinished(async () => {
      const acc = await prisma.loyaltyAccount.findUnique({ where: { customerId: customer.id } });
      if (acc) {
        await prisma.loyaltyTransaction.deleteMany({ where: { accountId: acc.id } });
        await prisma.loyaltyAccount.delete({ where: { id: acc.id } });
      }
      if (temp) await prisma.loyaltyTier.delete({ where: { id: temp.id } });
    });
    const { orderId, lineId } = await order(productId, 5, { customerId: customer.id });
    await reserveOnOrderConfirmed({ type: "order.confirmed", orderId }, deps("e5"));
    await earnLoyaltyOnOrderConfirmed({ type: "order.confirmed", orderId }, deps("e5b"));
    const earned = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: customer.id } });
    expect(earned.points).toBeGreaterThan(0);

    await prisma.salesOrder.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    await releaseOnOrderCancelled({ type: "order.cancelled", orderId }, deps("e6"));
    await reverseLoyaltyOnOrderCancelled({ type: "order.cancelled", orderId }, deps("e7"));
    await reverseLoyaltyOnOrderCancelled({ type: "order.cancelled", orderId }, deps("e7")); // idempotent
    expect(await reserved(lineId)).toBe("0");
    const after = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: customer.id } });
    expect(after.points).toBe(0);
    expect(await prisma.loyaltyTransaction.count({ where: { reason: "ORDER_CANCEL", refId: orderId } })).toBe(1);
    // İptal edilen sipariş stok gelince yeniden ayrılmaz
    await backfillOnStockChanged({ type: "stock.changed", itemId }, deps("e8"));
    expect(await reserved(lineId)).toBe("0");
  });
});
