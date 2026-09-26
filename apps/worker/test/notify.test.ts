import { encryptField, keyringFromEnv } from "@atelier/shared/node";
import { createPrismaClient, type Db } from "@atelier/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifyCustomer } from "../src/handlers/notify.js";
import { workerTestDbUrl } from "./env.js";

let prisma: Db;

async function customer(opts: { phone?: string | null; marketing?: boolean }) {
  const ring = keyringFromEnv();
  return prisma.customer.create({
    data: { type: "INDIVIDUAL", fullName: "M", phone: opts.phone ? encryptField(ring, opts.phone) : null, marketingConsentAt: opts.marketing ? new Date() : null },
  });
}

beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(() => prisma.$disconnect());

describe("bildirim (F2-09, İYS)", () => {
  it("işlem bildirimi telefonu olan müşteriye gönderilir", async () => {
    const c = await customer({ phone: "05321234567" });
    await notifyCustomer(prisma, { customerId: c.id, channel: "SMS", purpose: "TRANSACTIONAL", template: "order.confirmed", body: "x" });
    const log = await prisma.notificationLog.findFirstOrThrow({ where: { customerId: c.id } });
    expect(log.status).toBe("SENT");
    expect(log.toMasked).toContain("**");
    expect(log.toMasked).not.toContain("5321234567");
  });

  it("telefon yoksa FAILED", async () => {
    const c = await customer({ phone: null });
    await notifyCustomer(prisma, { customerId: c.id, channel: "SMS", purpose: "TRANSACTIONAL", template: "x", body: "x" });
    expect((await prisma.notificationLog.findFirstOrThrow({ where: { customerId: c.id } })).status).toBe("FAILED");
  });

  it("pazarlama iletisi rıza yoksa BLOCKED (İYS)", async () => {
    const c = await customer({ phone: "05321234567", marketing: false });
    await notifyCustomer(prisma, { customerId: c.id, channel: "SMS", purpose: "MARKETING", template: "campaign", body: "x" });
    expect((await prisma.notificationLog.findFirstOrThrow({ where: { customerId: c.id } })).status).toBe("BLOCKED");
  });

  it("pazarlama iletisi rıza varsa gönderilir", async () => {
    const c = await customer({ phone: "05321234567", marketing: true });
    await notifyCustomer(prisma, { customerId: c.id, channel: "SMS", purpose: "MARKETING", template: "campaign", body: "x" });
    expect((await prisma.notificationLog.findFirstOrThrow({ where: { customerId: c.id } })).status).toBe("SENT");
  });
});
