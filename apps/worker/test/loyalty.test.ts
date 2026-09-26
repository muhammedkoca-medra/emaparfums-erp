import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { earnLoyaltyOnOrderConfirmed } from "../src/handlers/loyalty.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;

beforeAll(async () => {
  prisma = createPrismaClient(workerTestDbUrl());
  await prisma.loyaltyTier.upsert({ where: { code: "DISCOVERY" }, update: {}, create: { code: "DISCOVERY", name: "Keşif", minPoints: 0, earnPct: "0.05", perks: [] } });
});
afterAll(() => prisma.$disconnect());

async function order(net: string) {
  const channel = await prisma.salesChannel.create({ data: { code: `L-${Math.random().toString(36).slice(2, 8)}`, name: "K", type: "WEBSITE" } });
  const customer = await prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "M" } });
  const o = await prisma.salesOrder.create({ data: { number: `LO-${Math.random().toString(36).slice(2, 8)}`, channelId: channel.id, customerId: customer.id, status: "CONFIRMED", netTotal: net, otvTotal: "0", kdvTotal: "0", grandTotal: net } });
  return { orderId: o.id, customerId: customer.id };
}

describe("sadakat kazanımı (SDK-01, worker)", () => {
  it("order.confirmed net×earnPct puan kazandırır; idempotent", async () => {
    const { orderId, customerId } = await order("1000");
    await earnLoyaltyOnOrderConfirmed({ type: "order.confirmed", orderId }, { prisma, log, eventId: "e1" });
    let acc = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.points).toBe(50); // 1000 × 0.05
    // ikinci kez: idempotent
    await earnLoyaltyOnOrderConfirmed({ type: "order.confirmed", orderId }, { prisma, log, eventId: "e1b" });
    acc = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.points).toBe(50);
  });
});
