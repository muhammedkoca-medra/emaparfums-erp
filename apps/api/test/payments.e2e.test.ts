import { paymentWebhookSignature } from "@atelier/shared/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let channelId: string;
let customerId: string;
let productId: string;

async function makeOrder(ctx: TestContext, agent: Awaited<ReturnType<typeof loginAgent>>) {
  const { body } = await agent
    .post("/sales/orders")
    .send({ channelId, customerId, lines: [{ productId, qty: 1, unitPriceGross: "1000.00" }] })
    .expect(201);
  return body.id as string;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  const channel = await ctx.prisma.salesChannel.upsert({ where: { code: "WEB" }, update: {}, create: { code: "WEB", name: "Web", type: "WEBSITE" } });
  channelId = channel.id;
  const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Test Müşteri" } });
  customerId = customer.id;
  await ctx.prisma.taxRule.create({ data: { category: "PERFUME", kdvRate: "0.20", otvRate: "0.20", validFrom: new Date("2026-01-01"), approvedAt: new Date("2026-01-01") } });
  await ctx.prisma.paymentProvider.create({ data: { code: "SANDBOX", name: "Sandbox" } });
  const item = await ctx.prisma.item.create({ data: { code: "MM-PAY", name: "Pay Ürün", type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await ctx.prisma.product.create({ data: { itemId: item.id, sku: "PAY-1", name: "Pay Ürün", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" } });
  productId = p.id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

const SECRET = "dev-sandbox-payment-webhook-secret-change-me";

describe("ödeme (F2-03, ODM-01/04)", () => {
  it("checkout Payment (PENDING) açar ve siparişi PAYMENT_PENDING yapar; kart verisi alınmaz", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const orderId = await makeOrder(ctx, sales);
    const { body } = await sales.post("/payments/checkout").send({ orderId, installments: 3, cardNumber: "4111111111111111", cvv: "123" }).expect(201);
    expect(body.status).toBe("PENDING");
    expect(body.externalTxId).toMatch(/^sbx_/);
    const order = await ctx.prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe("PAYMENT_PENDING");
    // Kart verisi hiçbir sütunda yok (ODM-01): Payment'ta pan/cvv alanı bulunmaz.
    const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(JSON.stringify(payment)).not.toContain("4111");
    expect(payment.installments).toBe(3);
  });

  it("webhook imzasız/yanlış imzayla reddedilir (ODM-04)", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const orderId = await makeOrder(ctx, sales);
    const co = await sales.post("/payments/checkout").send({ orderId }).expect(201);
    const payload = { externalTxId: co.body.externalTxId, outcome: "CAPTURED" as const };
    await ctx.http().post("/webhooks/payments/SANDBOX").send(payload).expect(401);
    await ctx.http().post("/webhooks/payments/SANDBOX").set("x-signature", "yanlis").send(payload).expect(401);
  });

  it("geçerli imzalı webhook ödemeyi yakalar; idempotenttir", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const orderId = await makeOrder(ctx, sales);
    const co = await sales.post("/payments/checkout").send({ orderId }).expect(201);
    const payload = { externalTxId: co.body.externalTxId, outcome: "CAPTURED" as const };
    const sig = paymentWebhookSignature(SECRET, payload);
    await ctx.http().post("/webhooks/payments/SANDBOX").set("x-signature", sig).send(payload).expect(201);
    const p1 = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(p1.status).toBe("CAPTURED");
    // İkinci kez: idempotent, hâlâ CAPTURED, payment.captured olayı çift yazılmaz.
    await ctx.http().post("/webhooks/payments/SANDBOX").set("x-signature", sig).send(payload).expect(201);
    const events = await ctx.prisma.outboxEvent.findMany({ where: { type: "payment.captured", aggregateId: p1.id } });
    expect(events).toHaveLength(1);
  });

  it("başarısız ödeme payment.failed yayınlar", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const orderId = await makeOrder(ctx, sales);
    const co = await sales.post("/payments/checkout").send({ orderId }).expect(201);
    await sales.post(`/payments/${co.body.paymentId}/simulate`).send({ outcome: "FAILED", failureCode: "insufficient_funds" }).expect(201);
    const p = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(p.status).toBe("FAILED");
    expect(p.failureCode).toBe("insufficient_funds");
  });
});
