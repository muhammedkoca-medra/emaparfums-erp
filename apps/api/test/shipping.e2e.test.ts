import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let orderId: string;
let carrierId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const channel = await ctx.prisma.salesChannel.upsert({ where: { code: "WEB" }, update: {}, create: { code: "WEB", name: "Web", type: "WEBSITE" } });
  const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "M" } });
  const order = await ctx.prisma.salesOrder.create({
    data: { number: "WB-0001", channelId: channel.id, customerId: customer.id, status: "SHIPPED", netTotal: "100", otvTotal: "0", kdvTotal: "0", grandTotal: "100" },
  });
  orderId = order.id;
  carrierId = (await ctx.prisma.carrier.create({ data: { code: "YURTICI", name: "Yurtiçi" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("kargo (F2-08, KRG)", () => {
  it("gönderi oluşturur; takip no + maliyet + LABEL_PRINTED", async () => {
    const wh = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE"]));
    const res = await wh.post("/shipping/shipments").send({ orderId, carrierId, desi: "2" }).expect(201);
    expect(res.body.trackingNo).toBeTruthy();
    expect(res.body.status).toBe("LABEL_PRINTED");
    const s = await ctx.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    expect(s.cost?.toString()).toBe("70"); // 2 desi × 35
  });

  it("etiket PDF döndürür", async () => {
    const wh = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE"]));
    const s = await ctx.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    const res = await wh.post(`/shipping/shipments/${s.id}/label`).expect(201);
    expect(res.headers["content-type"]).toContain("application/pdf");
  });

  it("webhook teslim → gönderi DELIVERED, sipariş DELIVERED", async () => {
    const s = await ctx.prisma.shipment.findFirstOrThrow({ where: { orderId } });
    await ctx.http().post("/webhooks/cargo/YURTICI").send({ trackingNo: s.trackingNo, status: "DELIVERED", location: "İstanbul" }).expect(201);
    const after = await ctx.prisma.shipment.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.status).toBe("DELIVERED");
    expect(after.deliveredAt).not.toBeNull();
    expect((await ctx.prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("DELIVERED");
    expect(await ctx.prisma.shipmentEvent.count({ where: { shipmentId: s.id } })).toBeGreaterThanOrEqual(2);
  });

  it("firma performansı skorları döner", async () => {
    const wh = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE"]));
    const res = await wh.get("/shipping/carriers/performance").expect(200);
    expect(res.body[0]).toHaveProperty("score");
  });

  it("shipping:VIEW olmayan erişemez", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    await prod.get("/shipping/shipments").expect(403);
  });
});
