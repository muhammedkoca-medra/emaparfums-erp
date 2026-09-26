import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let supplierId: string;
let itemId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  const wh = await ctx.prisma.warehouse.create({ data: { code: "ANA", name: "Ana" } });
  await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "A1", pickSequence: 1 } });
  supplierId = (await ctx.prisma.supplier.create({ data: { name: "Esans A.Ş.", currency: "TRY" } })).id;
  itemId = (await ctx.prisma.item.create({ data: { code: "HM-9100", name: "Bergamot", type: "RAW_MATERIAL", uom: "KG", minStock: "50" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("satın alma (F2-14/15, SAT)", () => {
  it("MRP min. stok altındaki kalemi önerir (SAT-01)", async () => {
    const p = await loginAgent(ctx, await createUser(ctx, ["PURCHASING"]));
    const res = await p.get("/purchasing/suggestions").expect(200);
    const row = (res.body as { itemId: string; suggestedQty: string }[]).find((r) => r.itemId === itemId);
    expect(row).toBeDefined();
    expect(Number(row!.suggestedQty)).toBeGreaterThan(0);
  });

  it("küçük sipariş submit'te ORDERED olur; büyük sipariş onay bekler (SAT-03)", async () => {
    const p = await loginAgent(ctx, await createUser(ctx, ["PURCHASING"]));
    const small = await p.post("/purchasing/orders").send({ supplierId, lines: [{ itemId, qty: "10", unitPrice: "100", kdvRate: "0.20" }] }).expect(201);
    const s1 = await p.post(`/purchasing/orders/${small.body.id}/submit`).send({}).expect(201);
    expect(s1.body.status).toBe("ORDERED");
    const big = await p.post("/purchasing/orders").send({ supplierId, lines: [{ itemId, qty: "1000", unitPrice: "100", kdvRate: "0.20" }] }).expect(201);
    const s2 = await p.post(`/purchasing/orders/${big.body.id}/submit`).send({}).expect(201);
    expect(s2.body.status).toBe("PENDING_APPROVAL");
  });

  it("mal kabul lot (QUARANTINE) + RECEIPT hareketi yazar (SAT-04)", async () => {
    const p = await loginAgent(ctx, await createUser(ctx, ["PURCHASING"]));
    const po = await p.post("/purchasing/orders").send({ supplierId, lines: [{ itemId, qty: "100", unitPrice: "80", kdvRate: "0.20" }] }).expect(201);
    await p.post(`/purchasing/orders/${po.body.id}/submit`).send({}).expect(201);
    const poDetail = await p.get(`/purchasing/orders/${po.body.id}`).expect(200);
    const poLineId = poDetail.body.lines[0].id;
    const rec = await p.post(`/purchasing/orders/${po.body.id}/receipts`).send({ lines: [{ poLineId, qty: "100" }] }).expect(201);
    expect(rec.body.status).toBe("CLOSED");
    const lots = await ctx.prisma.lot.findMany({ where: { itemId } });
    expect(lots.some((l) => l.qcStatus === "QUARANTINE")).toBe(true);
    const bal = await ctx.prisma.stockBalance.aggregate({ where: { itemId }, _sum: { qtyOnHand: true } });
    expect(Number(bal._sum.qtyOnHand)).toBe(100);
  });

  it("kabul %10'dan fazla aşarsa engellenir (SAT-05)", async () => {
    const p = await loginAgent(ctx, await createUser(ctx, ["PURCHASING"]));
    const po = await p.post("/purchasing/orders").send({ supplierId, lines: [{ itemId, qty: "100", unitPrice: "80", kdvRate: "0.20" }] }).expect(201);
    await p.post(`/purchasing/orders/${po.body.id}/submit`).send({}).expect(201);
    const poLineId = (await p.get(`/purchasing/orders/${po.body.id}`)).body.lines[0].id;
    await p.post(`/purchasing/orders/${po.body.id}/receipts`).send({ lines: [{ poLineId, qty: "120" }] }).expect(400);
  });

  it("purchasing:VIEW olmayan erişemez", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.get("/purchasing/orders").expect(403);
  });
});
