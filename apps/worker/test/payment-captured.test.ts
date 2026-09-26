import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentCaptured } from "../src/handlers/payment-captured.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;

async function order(status: "NEW" | "PAYMENT_PENDING" | "SHIPPED") {
  const channel = await prisma.salesChannel.create({ data: { code: `C-${Math.random().toString(36).slice(2, 8)}`, name: "K", type: "WEBSITE" } });
  const customer = await prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "M" } });
  return prisma.salesOrder.create({
    data: {
      number: `T-${Math.random().toString(36).slice(2, 8)}`,
      channelId: channel.id,
      customerId: customer.id,
      status,
      netTotal: "100",
      otvTotal: "0",
      kdvTotal: "0",
      grandTotal: "100",
    },
  });
}

beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(() => prisma.$disconnect());

describe("payment.captured → sipariş onayı", () => {
  it("PAYMENT_PENDING siparişi CONFIRMED yapar ve order.confirmed yazar", async () => {
    const o = await order("PAYMENT_PENDING");
    await paymentCaptured({ type: "payment.captured", paymentId: "p1", orderId: o.id }, { prisma, log, eventId: "e1" });
    const updated = await prisma.salesOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(updated.status).toBe("CONFIRMED");
    const ev = await prisma.outboxEvent.findFirst({ where: { type: "order.confirmed", aggregateId: o.id } });
    expect(ev).not.toBeNull();
  });

  it("uygun olmayan durumdaki siparişe dokunmaz (idempotent/guard)", async () => {
    const o = await order("SHIPPED");
    await paymentCaptured({ type: "payment.captured", paymentId: "p2", orderId: o.id }, { prisma, log, eventId: "e2" });
    const updated = await prisma.salesOrder.findUniqueOrThrow({ where: { id: o.id } });
    expect(updated.status).toBe("SHIPPED");
  });
});
