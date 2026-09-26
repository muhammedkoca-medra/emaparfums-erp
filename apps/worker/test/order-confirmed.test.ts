import { encryptField, keyringFromEnv } from "@atelier/shared/node";
import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderConfirmed } from "../src/handlers/order-confirmed.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;

async function order(opts: { type: "INDIVIDUAL" | "CORPORATE"; taxNo?: string | null; channel?: "WEBSITE" | "EXPORT" }) {
  const ring = keyringFromEnv();
  const channel = await prisma.salesChannel.create({ data: { code: `C-${Math.random().toString(36).slice(2, 8)}`, name: "K", type: opts.channel ?? "WEBSITE" } });
  const customer = await prisma.customer.create({
    data: { type: opts.type, fullName: "Test", taxNo: opts.taxNo ? encryptField(ring, opts.taxNo) : null },
  });
  const o = await prisma.salesOrder.create({
    data: { number: `T-${Math.random().toString(36).slice(2, 8)}`, channelId: channel.id, customerId: customer.id, status: "CONFIRMED", netTotal: "100", otvTotal: "20", kdvTotal: "24", grandTotal: "144" },
  });
  await prisma.salesOrderLine.create({
    data: { orderId: o.id, productId: null as unknown as string, qty: 1, unitPriceGross: "144", discount: "0", otvRate: "0.2", kdvRate: "0.2", netAmount: "100", otvAmount: "20", kdvAmount: "24" },
  }).catch(() => undefined); // productId zorunluysa atla; fatura satırı yine order.lines'tan gelir
  return o;
}

beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(() => prisma.$disconnect());

describe("order.confirmed → fatura (FTR-01/04)", () => {
  it("bireysel alıcı → e-Arşiv, numara/ETTN entegratörden", async () => {
    const o = await order({ type: "INDIVIDUAL" });
    await orderConfirmed({ type: "order.confirmed", orderId: o.id }, { prisma, log, eventId: "e1" });
    const inv = await prisma.invoice.findFirstOrThrow({ where: { orderId: o.id } });
    expect(inv.type).toBe("E_ARSIV");
    expect(inv.status).toBe("SENT");
    expect(inv.number).toMatch(/^EMA\d{4}\d{9}$/);
    expect(inv.ettn).toBeTruthy();
  });

  it("kurumsal + VKN → e-Fatura", async () => {
    const o = await order({ type: "CORPORATE", taxNo: "1234567890" });
    await orderConfirmed({ type: "order.confirmed", orderId: o.id }, { prisma, log, eventId: "e2" });
    const inv = await prisma.invoice.findFirstOrThrow({ where: { orderId: o.id } });
    expect(inv.type).toBe("E_FATURA");
    expect(inv.status).toBe("SENT");
  });

  it("kurumsal + VKN yok → ERROR (FTR-04)", async () => {
    const o = await order({ type: "CORPORATE", taxNo: null });
    await orderConfirmed({ type: "order.confirmed", orderId: o.id }, { prisma, log, eventId: "e3" });
    const inv = await prisma.invoice.findFirstOrThrow({ where: { orderId: o.id } });
    expect(inv.status).toBe("ERROR");
    expect(inv.number).toBeNull();
  });

  it("idempotent: ikinci kez fatura oluşturmaz", async () => {
    const o = await order({ type: "INDIVIDUAL" });
    await orderConfirmed({ type: "order.confirmed", orderId: o.id }, { prisma, log, eventId: "e4" });
    await orderConfirmed({ type: "order.confirmed", orderId: o.id }, { prisma, log, eventId: "e4b" });
    expect(await prisma.invoice.count({ where: { orderId: o.id } })).toBe(1);
  });
});
