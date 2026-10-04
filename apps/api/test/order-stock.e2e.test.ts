import { createLot, recordMovement, reserveAvailableFefo } from "@atelier/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let locId: string;
let channelId: string;
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function product() {
  const t = tag();
  const item = await ctx.prisma.item.create({ data: { code: `MM-${t}`, name: `Mamul ${t}`, type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await ctx.prisma.product.create({
    data: { itemId: item.id, sku: `OS-${t}`, name: `Ürün ${t}`, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" },
  });
  return { itemId: item.id, productId: p.id, sku: p.sku };
}

async function order(productId: string, qty: number, status: "NEW" | "CONFIRMED" | "CANCELLED") {
  const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Sipariş Test" } });
  const o = await ctx.prisma.salesOrder.create({
    data: { number: `OS-${tag()}`, channelId, customerId: customer.id, status, netTotal: "1000", otvTotal: "0", kdvTotal: "0", grandTotal: "1200" },
  });
  const line = await ctx.prisma.salesOrderLine.create({
    data: { orderId: o.id, productId, qty, unitPriceGross: "120", discount: "0", otvRate: "0", kdvRate: "0.2", netAmount: "1000", otvAmount: "0", kdvAmount: "200" },
  });
  return { orderId: o.id, lineId: line.id };
}

async function stockAndReserve(itemId: string, onHand: number, lineId: string, want: number) {
  await ctx.prisma.$transaction(async (tx) => {
    const lot = await createLot(tx, { itemId, lotNo: `L-${tag()}`, qcStatus: "RELEASED", expiryDate: new Date("2031-01-01") });
    await recordMovement(tx, { type: "RECEIPT", itemId, lotId: lot.id, qty: onHand, toLocationId: locId, refType: "Test", refId: "os" });
    await reserveAvailableFefo(tx, { itemId, qty: String(want), refType: "SalesOrderLine", refId: lineId, orderLineId: lineId });
  });
}

beforeAll(async () => {
  ctx = await setupTestApp();
  const wh = await ctx.prisma.warehouse.create({ data: { code: `OS-${tag()}`, name: "Sipariş stok testi" } });
  locId = (await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "OS-01", pickSequence: 1 } })).id;
  channelId = (await ctx.prisma.salesChannel.create({ data: { code: `OS-${tag()}`, name: "Test kanal", type: "WEBSITE" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("sipariş stok durumu ve sevkiyat koruması", () => {
  it("detay satır bazında ayrılan/eksik miktarı ve sipariş stok durumunu döndürür", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const { itemId, productId } = await product();
    const { orderId, lineId } = await order(productId, 10, "CONFIRMED");
    await stockAndReserve(itemId, 6, lineId, 10); // yalnızca 6 ayrılabilir
    const d = await admin.get(`/sales/orders/${orderId}`).expect(200);
    expect(d.body.stockStatus).toBe("PARTIAL");
    expect(d.body.lines[0]).toMatchObject({ qty: 10, reservedQty: "6", shippedQty: "0", shortageQty: "4" });
    const list = await admin.get("/sales/orders").expect(200);
    expect((list.body as { id: string; stockStatus: string }[]).find((o) => o.id === orderId)?.stockStatus).toBe("PARTIAL");
    const dash = await admin.get("/dashboard/summary").expect(200);
    expect(dash.body.sales.awaitingStock).toBeGreaterThanOrEqual(1);
  });

  it("stoğu eksik ya da onaylanmamış siparişe kargo gönderisi açılmaz", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const carrierId = (await ctx.prisma.carrier.create({ data: { code: `OS-${tag()}`, name: "Kargo" } })).id;
    const { productId, sku } = await product();
    const short = await order(productId, 3, "CONFIRMED");
    const r = await admin.post("/shipping/shipments").send({ orderId: short.orderId, carrierId, desi: "1" }).expect(400);
    expect(r.body.message).toContain(sku);
    const draft = await order(productId, 1, "NEW");
    await admin.post("/shipping/shipments").send({ orderId: draft.orderId, carrierId, desi: "1" }).expect(400);
  });

  it("stoğu tam ayrılmış siparişe gönderi açılır", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const carrierId = (await ctx.prisma.carrier.create({ data: { code: `OS-${tag()}`, name: "Kargo" } })).id;
    const { itemId, productId } = await product();
    const { orderId, lineId } = await order(productId, 2, "CONFIRMED");
    await stockAndReserve(itemId, 5, lineId, 2);
    await admin.post("/shipping/shipments").send({ orderId, carrierId, desi: "1" }).expect(201);
  });
});

describe("iptal sonrası para işlemleri (onaylı)", () => {
  it("iptal edilen siparişte iade/fatura iptali bekleyen işlem olarak görünür; iade yapılır", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const { productId } = await product();
    const { orderId } = await order(productId, 1, "CANCELLED");
    const provider = (await ctx.prisma.paymentProvider.findUnique({ where: { code: "IYZICO" } })) ?? (await ctx.prisma.paymentProvider.create({ data: { code: "IYZICO", name: "iyzico" } }));
    const manual = (await ctx.prisma.paymentProvider.findUnique({ where: { code: "TRANSFER" } })) ?? (await ctx.prisma.paymentProvider.create({ data: { code: "TRANSFER", name: "Havale" } }));
    const card = await ctx.prisma.payment.create({ data: { orderId, providerId: provider.id, amount: "1200", status: "CAPTURED", externalTxId: `tx_${tag()}` } });
    const wire = await ctx.prisma.payment.create({ data: { orderId, providerId: manual.id, amount: "50", status: "CAPTURED" } });
    const inv = await ctx.prisma.invoice.create({ data: { orderId, direction: "SALES", type: "E_ARSIV", status: "SENT", issueDate: new Date(), number: `EMA${tag()}`, netTotal: "1000", otvTotal: "0", kdvBase: "1000", kdvTotal: "200", grandTotal: "1200" } });

    const d = await admin.get(`/sales/orders/${orderId}`).expect(200);
    expect(d.body.pendingActions.refunds.map((r: { paymentId: string }) => r.paymentId).sort()).toEqual([card.id, wire.id].sort());
    expect(d.body.pendingActions.invoices[0].invoiceId).toBe(inv.id);
    expect((await admin.get("/dashboard/summary").expect(200)).body.sales.cancellationsPending).toBeGreaterThanOrEqual(1);

    // Satış rolü (sales:APPROVE yok) iade yapamaz
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.post(`/payments/${card.id}/refund`).send({ reason: "müşteri iptali" }).expect(403);

    await admin.post(`/payments/${card.id}/refund`).send({ reason: "x" }).expect(400); // gerekçe çok kısa
    const r1 = await admin.post(`/payments/${card.id}/refund`).send({ reason: "müşteri iptali" }).expect(201);
    expect(r1.body).toMatchObject({ status: "REFUNDED", method: "PROVIDER", amount: "1200.00" });
    const r2 = await admin.post(`/payments/${wire.id}/refund`).send({ reason: "havale iadesi yapıldı" }).expect(201);
    expect(r2.body.method).toBe("MANUAL");
    await admin.post(`/payments/${card.id}/refund`).send({ reason: "tekrar" }).expect(400); // zaten iade

    const after = await admin.get(`/sales/orders/${orderId}`).expect(200);
    expect(after.body.pendingActions.refunds).toEqual([]);
    expect(await ctx.prisma.auditLog.count({ where: { entityId: card.id, action: "payment.refund" } })).toBe(1);
  });
});
