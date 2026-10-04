import { createPrismaClient, type Db } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runShipmentDelay, runSocialPublish } from "../src/scheduled.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const DAY = 86_400_000;

beforeAll(() => {
  prisma = createPrismaClient(workerTestDbUrl());
});
afterAll(() => prisma.$disconnect());

describe("KRG · gecikmiş kargo işi", () => {
  it("eşiği aşan yoldaki kargo DELAYED olur ve olay yayınlanır; teslim edilen ve yeni olan dokunulmaz; tekrar çalışınca yeniden işlenmez", async () => {
    const channel = await prisma.salesChannel.create({ data: { code: `WB-${tag()}`, name: "Web", type: "WEBSITE" } });
    const customer = await prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Kargo Müşteri" } });
    const order = await prisma.salesOrder.create({ data: { number: `KD-${tag()}`, channelId: channel.id, customerId: customer.id, status: "SHIPPED", netTotal: "100", otvTotal: "0", kdvTotal: "0", grandTotal: "100" } });
    const carrier = await prisma.carrier.create({ data: { code: `K-${tag()}`, name: "Kargo" } });
    const now = new Date();
    const old = new Date(now.getTime() - 10 * DAY);
    const late = await prisma.shipment.create({ data: { orderId: order.id, carrierId: carrier.id, status: "IN_TRANSIT", createdAt: old } });
    const delivered = await prisma.shipment.create({ data: { orderId: order.id, carrierId: carrier.id, status: "DELIVERED", createdAt: old } });
    const fresh = await prisma.shipment.create({ data: { orderId: order.id, carrierId: carrier.id, status: "IN_TRANSIT" } });

    const res = await runShipmentDelay(prisma, log, now);
    expect(res.delayed).toBeGreaterThanOrEqual(1);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: late.id } })).status).toBe("DELAYED");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: delivered.id } })).status).toBe("DELIVERED");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("IN_TRANSIT");
    const events = await prisma.outboxEvent.findMany({ where: { payload: { path: ["shipmentId"], equals: late.id } } });
    expect(events.map((e) => e.type).sort()).toEqual(["shipment.delayed", "shipment.status_changed"]);
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: late.id, status: "DELAYED" } })).toBe(1);

    await runShipmentDelay(prisma, log, now);
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: late.id, status: "DELAYED" } })).toBe(1);
  });
});

describe("SOS · zamanlanmış gönderi yayını", () => {
  it("zamanı gelen gönderi yayınlanır ve post.published yayınlanır; ileri tarihli ve adaptörü olmayan bekler", async () => {
    const now = new Date();
    const ig = await prisma.socialAccount.create({ data: { platform: "INSTAGRAM", handle: `@ema${tag()}` } });
    const unknown = await prisma.socialAccount.create({ data: { platform: `XNET${tag()}`, handle: "@x" } });
    const due = await prisma.socialPost.create({ data: { accountId: ig.id, caption: "Yeni koleksiyon", status: "SCHEDULED", scheduledAt: new Date(now.getTime() - 60_000) } });
    const later = await prisma.socialPost.create({ data: { accountId: ig.id, caption: "Yarın", status: "SCHEDULED", scheduledAt: new Date(now.getTime() + DAY) } });
    const orphan = await prisma.socialPost.create({ data: { accountId: unknown.id, caption: "Bilinmeyen", status: "SCHEDULED", scheduledAt: new Date(now.getTime() - 60_000) } });

    await runSocialPublish(prisma, log, now);
    const p = await prisma.socialPost.findUniqueOrThrow({ where: { id: due.id } });
    expect(p.status).toBe("PUBLISHED");
    expect(p.externalId).toBeTruthy();
    expect(await prisma.outboxEvent.count({ where: { type: "post.published", payload: { path: ["postId"], equals: due.id } } })).toBe(1);
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("SCHEDULED");
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: orphan.id } })).status).toBe("SCHEDULED");
  });
});
