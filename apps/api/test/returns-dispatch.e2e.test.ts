import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let orderId: string;
let orderLineId: string;
let productId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  // ANA deposu + lokasyon (iade girişi için)
  const wh = await ctx.prisma.warehouse.upsert({ where: { code: "ANA" }, update: {}, create: { code: "ANA", name: "Ana depo" } });
  await ctx.prisma.location.upsert({ where: { warehouseId_code: { warehouseId: wh.id, code: "RET-01" } }, update: {}, create: { warehouseId: wh.id, code: "RET-01", pickSequence: 1 } });
  const channel = await ctx.prisma.salesChannel.upsert({ where: { code: "WEB" }, update: {}, create: { code: "WEB", name: "Web", type: "WEBSITE" } });
  const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "İade Müşteri" } });
  const item = await ctx.prisma.item.create({ data: { code: `MD-${Math.random().toString(36).slice(2, 7)}`, name: "Mamul", type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await ctx.prisma.product.create({ data: { itemId: item.id, sku: `SD-${Math.random().toString(36).slice(2, 7)}`, name: "Ürün", concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status: "ACTIVE" } });
  productId = p.id;
  const order = await ctx.prisma.salesOrder.create({ data: { number: `DO-${Math.random().toString(36).slice(2, 8)}`, channelId: channel.id, customerId: customer.id, status: "DELIVERED", netTotal: "100", otvTotal: "0", kdvTotal: "0", grandTotal: "100" } });
  orderId = order.id;
  const line = await ctx.prisma.salesOrderLine.create({ data: { orderId: order.id, productId: p.id, qty: 2, unitPriceGross: "100", otvRate: "0", kdvRate: "0.20", netAmount: "100", otvAmount: "0", kdvAmount: "0" } });
  orderLineId = line.id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("iade ve e-İrsaliye (F3-12, KRG-06/FTR-07)", () => {
  it("iade: talep → muayene → hasarsız onay karantinaya RETURN hareketi yazar", async () => {
    const depo = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const rr = (await depo.post("/shipping/returns").send({ orderId, reason: "beğenmedi", lines: [{ orderLineId, qty: 1 }] }).expect(201)).body;
    expect(rr.returnCode).toMatch(/^IADE-/);
    await depo.post(`/shipping/returns/${rr.id}/receive`).expect(201);
    const insp = await depo.post(`/shipping/returns/${rr.id}/inspect`).send({ damaged: false }).expect(201);
    expect(insp.body.status).toBe("APPROVED");
    const mv = await ctx.prisma.stockMovement.findFirst({ where: { refType: "ReturnRequest", refId: rr.id, type: "RETURN" } });
    expect(mv).toBeTruthy();
    // Karantinada açıldı
    const lot = await ctx.prisma.lot.findFirstOrThrow({ where: { id: mv!.lotId } });
    expect(lot.qcStatus).toBe("QUARANTINE");
  });

  it("iade: hasarlı → fire (SCRAP) ve REJECTED", async () => {
    const depo = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const rr = (await depo.post("/shipping/returns").send({ orderId, reason: "kırık", lines: [{ orderLineId, qty: 1 }] }).expect(201)).body;
    await depo.post(`/shipping/returns/${rr.id}/receive`).expect(201);
    const insp = await depo.post(`/shipping/returns/${rr.id}/inspect`).send({ damaged: true }).expect(201);
    expect(insp.body.status).toBe("REJECTED");
    expect(await ctx.prisma.stockMovement.findFirst({ where: { refType: "ReturnRequest", refId: rr.id, type: "SCRAP" } })).toBeTruthy();
  });

  it("e-İrsaliye oluşturulur ve entegratörden numara/ETTN alır (FTR-07)", async () => {
    const depo = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const dn = (await depo.post("/dispatch-notes").send({ orderId, lines: [{ productId, lotNo: "L-X", qty: 2 }] }).expect(201)).body;
    expect(dn.status).toBe("SENT");
    expect(dn.ettn).toBeTruthy();
    const list = await depo.get("/dispatch-notes").expect(200);
    expect(list.body.some((d: { id: string }) => d.id === dn.id)).toBe(true);
  });
});
