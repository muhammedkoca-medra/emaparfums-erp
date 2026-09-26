import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSubscriptionBilling } from "../src/scheduled.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;

beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(() => prisma.$disconnect());

describe("abonelik tahsilatı (ODM-08/SDK-05, worker)", () => {
  it("vadesi gelen aboneliğe kutu oluşturur ve tarihi iler; idempotent", async () => {
    const plan = await prisma.subscriptionPlan.create({ data: { code: `WP-${Math.random().toString(36).slice(2, 7)}`, name: "P", price: "199", intervalMonths: 1, samplesPerBox: 2, sampleMl: "2" } });
    const customer = await prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Abone" } });
    const past = new Date(Date.now() - 86_400_000);
    const sub = await prisma.subscription.create({ data: { customerId: customer.id, planId: plan.id, status: "ACTIVE", nextBillingAt: past } });
    const now = new Date();
    await runSubscriptionBilling(prisma, log, now);
    const boxes = await prisma.subscriptionBox.findMany({ where: { subscriptionId: sub.id } });
    expect(boxes.length).toBe(1);
    const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.nextBillingAt.getTime()).toBeGreaterThan(past.getTime());
    // idempotent: aynı dönemde ikinci kutu açılmaz
    await runSubscriptionBilling(prisma, log, now);
    expect((await prisma.subscriptionBox.findMany({ where: { subscriptionId: sub.id } })).length).toBe(1);
  });
});
