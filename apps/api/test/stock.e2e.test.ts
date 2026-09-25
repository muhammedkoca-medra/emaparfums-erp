import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let admin: Awaited<ReturnType<typeof loginAgent>>;
let depo: Awaited<ReturnType<typeof loginAgent>>;
let satis: Awaited<ReturnType<typeof loginAgent>>;
let wh: string;
let locA: string;
let locB: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
  depo = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE"]));
  satis = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
  wh = (
    await ctx.prisma.warehouse.create({ data: { code: `S-${randomUUID().slice(0, 6)}`, name: "E2E depo" } })
  ).id;
  locA = (await ctx.prisma.location.create({ data: { warehouseId: wh, code: "Z1-01", pickSequence: 1 } })).id;
  locB = (await ctx.prisma.location.create({ data: { warehouseId: wh, code: "Z2-01", pickSequence: 2 } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

async function item(minStock?: string) {
  return ctx.prisma.item.create({
    data: {
      code: `E-${randomUUID().slice(0, 8)}`,
      name: "E2E kalemi",
      type: "FINISHED_GOOD",
      uom: "PCS",
      minStock,
    },
  });
}

async function receive(itemId: string, qty: string, lotNo = `L-${randomUUID().slice(0, 5)}`) {
  const res = await depo
    .post("/stock/movements")
    .send({ type: "RECEIPT", itemId, locationId: locA, qty, newLot: { lotNo, expiryDate: "2030-01-01" } })
    .expect(201);
  return res.body as { lotId: string };
}

async function release(lotId: string) {
  await admin
    .post(`/stock/lots/${lotId}/qc`)
    .send({ status: "RELEASED", reason: "Analiz uygun" })
    .expect(201);
}

describe("stok · okuma ve yetki", () => {
  it("satış rolü görüntüler ama hareket oluşturamaz", async () => {
    await satis.get("/stock/balances").expect(200);
    const it0 = await item();
    await satis
      .post("/stock/movements")
      .send({ type: "RECEIPT", itemId: it0.id, locationId: locA, qty: "1", newLot: { lotNo: "X" } })
      .expect(403);
  });

  it("bakiyesi olmayan kalem listede miktar 0 ile görünür; min altıysa KRİTİK", async () => {
    const it0 = await item("5");
    const rows = (await depo.get(`/stock/balances?search=${it0.code}`).expect(200)).body;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: it0.code, lotNo: null, qtyOnHand: "0", status: "CRITICAL" });
  });
});

describe("stok · elle hareketler", () => {
  it("elle giriş yeni lotu karantinada açar; satırda KARANTİNA durumu", async () => {
    const it0 = await item();
    const m = await receive(it0.id, "10");
    const lot = await ctx.prisma.lot.findUniqueOrThrow({ where: { id: m.lotId } });
    expect(lot.qcStatus).toBe("QUARANTINE");
    const rows = (await depo.get(`/stock/balances?search=${it0.code}`).expect(200)).body;
    expect(rows[0]).toMatchObject({ qtyOnHand: "10", status: "QUARANTINE", locationCode: "Z1-01" });
  });

  it("lot ya da yeni lot bilgisi zorunlu; ikisi birden verilemez", async () => {
    const it0 = await item();
    const r = await depo
      .post("/stock/movements")
      .send({ type: "RECEIPT", itemId: it0.id, locationId: locA, qty: "1" })
      .expect(400);
    expect(r.body.message).toBe("Mevcut bir lot seçin ya da yeni lot bilgisi girin");
  });

  it("aynı kalemde aynı lot numarası tekrar açılamaz (409)", async () => {
    const it0 = await item();
    await receive(it0.id, "1", "L-AYNI");
    const r = await depo
      .post("/stock/movements")
      .send({ type: "RECEIPT", itemId: it0.id, locationId: locA, qty: "1", newLot: { lotNo: "L-AYNI" } })
      .expect(409);
    expect(r.body.message).toBe("Bu bilgiyle kayıtlı bir kayıt zaten var");
  });

  it("düzeltme gerekçe ister; kullanılabilirden fazla azaltma 409 ve Türkçe mesaj", async () => {
    const it0 = await item();
    const { lotId } = await receive(it0.id, "3");
    await depo
      .post("/stock/movements")
      .send({ type: "ADJUSTMENT", itemId: it0.id, lotId, locationId: locA, direction: "DECREASE", qty: "1" })
      .expect(400);
    const r = await depo
      .post("/stock/movements")
      .send({
        type: "ADJUSTMENT",
        itemId: it0.id,
        lotId,
        locationId: locA,
        direction: "DECREASE",
        qty: "5",
        note: "Kırık şişe",
      })
      .expect(409);
    expect(r.body.message).toMatch(/^Yetersiz kullanılabilir stok/);
    await depo
      .post("/stock/movements")
      .send({
        type: "ADJUSTMENT",
        itemId: it0.id,
        lotId,
        locationId: locA,
        direction: "DECREASE",
        qty: "1",
        note: "Kırık şişe",
      })
      .expect(201);
    const mv = (await depo.get(`/stock/movements?itemId=${it0.id}`).expect(200)).body;
    expect(mv[0]).toMatchObject({ type: "ADJUSTMENT", qty: "1", from: "Z1-01", note: "Kırık şişe" });
  });

  it("transfer; sayı olmayan miktar 400", async () => {
    const it0 = await item();
    const { lotId } = await receive(it0.id, "4");
    await depo
      .post("/stock/movements")
      .send({ type: "TRANSFER", itemId: it0.id, lotId, fromLocationId: locA, toLocationId: locB, qty: "abc" })
      .expect(400);
    await depo
      .post("/stock/movements")
      .send({ type: "TRANSFER", itemId: it0.id, lotId, fromLocationId: locA, toLocationId: locB, qty: "1.5" })
      .expect(201);
    const d = (await depo.get(`/stock/items/${it0.id}`).expect(200)).body;
    const bals = d.item.lots[0].balances.map((b: { location: { code: string }; qtyOnHand: string }) => [
      b.location.code,
      b.qtyOnHand,
    ]);
    expect(bals.sort()).toEqual([
      ["Z1-01", "2.5"],
      ["Z2-01", "1.5"],
    ]);
  });
});

describe("stok · kalite ve rezervasyon", () => {
  it("lot serbest bırakma yalnızca kalite onayıyla; denetim kaydı yazılır", async () => {
    const it0 = await item();
    const { lotId } = await receive(it0.id, "5");
    await depo
      .post(`/stock/lots/${lotId}/qc`)
      .send({ status: "RELEASED", reason: "Analiz uygun" })
      .expect(403);
    await release(lotId);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity: "Lot", entityId: lotId } });
    expect(audit.after).toMatchObject({ qcStatus: "RELEASED" });
  });

  it("iç rezervasyon FEFO ile ayrılır, iptal edilir", async () => {
    const it0 = await item();
    const { lotId } = await receive(it0.id, "5");
    // Karantinadaki lottan ayrılamaz
    const q = await depo
      .post("/stock/reservations")
      .send({ itemId: it0.id, qty: "2", note: "Numune seti" })
      .expect(409);
    expect(q.body.message).toMatch(/^Rezervasyon için yetersiz stok/);
    await release(lotId);
    const res = (
      await depo
        .post("/stock/reservations")
        .send({ itemId: it0.id, qty: "2", note: "Numune seti" })
        .expect(201)
    ).body;
    expect(res[0]).toMatchObject({ lotId, qty: "2" });
    const rows = (await depo.get(`/stock/balances?search=${it0.code}`).expect(200)).body;
    expect(rows[0]).toMatchObject({ qtyReserved: "2", itemAvailable: "3" });
    await depo.post(`/stock/reservations/${res[0].id}/release`).expect(201);
    await depo.post(`/stock/reservations/${res[0].id}/release`).expect(409);
  });
});

describe("stok · otomatik kurallar", () => {
  it("kuralları herkes görür; yalnızca onay yetkisi değiştirir; geçersiz değer 400", async () => {
    const rules = (await depo.get("/stock/rules").expect(200)).body;
    expect(rules["stock.expiryWarningDays"]).toEqual({ value: 90, default: 90 });
    await depo.put("/stock/rules/stock.expiryWarningDays").send({ value: 60 }).expect(403);
    await admin.put("/stock/rules/stock.expiryWarningDays").send({ value: -1 }).expect(400);
    await admin.put("/stock/rules/yok.kural").send({ value: 1 }).expect(404);
    await admin.put("/stock/rules/stock.expiryWarningDays").send({ value: 60 }).expect(200);
    expect((await depo.get("/stock/rules").expect(200)).body["stock.expiryWarningDays"].value).toBe(60);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: "setting.change", entityId: "stock.expiryWarningDays" },
    });
    expect([audit.before, audit.after]).toEqual([{ value: 90 }, { value: 60 }]);
    await admin.put("/stock/rules/stock.expiryWarningDays").send({ value: 90 }).expect(200);
  });
});

describe("sayım (STK-09)", () => {
  it("kör sayım: depocu sistem miktarını görmez; eşik altı fark otomatik düzeltilir", async () => {
    const z = `Q${randomUUID().slice(0, 3)}`;
    const loc = (await ctx.prisma.location.create({ data: { warehouseId: wh, code: `${z}-01` } })).id;
    const it0 = await item();
    const lot = (
      await depo
        .post("/stock/movements")
        .send({ type: "RECEIPT", itemId: it0.id, locationId: loc, qty: "10", newLot: { lotNo: "L-S1" } })
        .expect(201)
    ).body;
    await ctx.prisma.standardCost.create({
      data: { itemId: it0.id, amount: "10", validFrom: new Date("2020-01-01") },
    });

    const { id } = (await depo.post("/stock/counts").send({ warehouseId: wh, zone: z }).expect(201)).body;
    const view = (await depo.get(`/stock/counts/${id}`).expect(200)).body;
    expect(view.systemHidden).toBe(true);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].systemQty).toBeNull();
    expect((await admin.get(`/stock/counts/${id}`).expect(200)).body.lines[0].systemQty).toBe("10");

    await depo.post(`/stock/counts/${id}/submit`).expect(400); // sayılmamış satır
    await depo
      .patch(`/stock/counts/${id}/lines`)
      .send({ lines: [{ lineId: view.lines[0].id, countedQty: "8" }] })
      .expect(200);
    const sub = (await depo.post(`/stock/counts/${id}/submit`).expect(200)).body;
    expect(sub).toMatchObject({ needsApproval: false, varianceValue: "20.00", status: "APPROVED" }); // 2 × ₺10 < ₺5.000

    const bal = await ctx.prisma.stockBalance.findFirstOrThrow({ where: { lotId: lot.lotId } });
    expect(bal.qtyOnHand.toString()).toBe("8");
    const mv = await ctx.prisma.stockMovement.findFirstOrThrow({
      where: { refType: "CycleCount", refId: id },
    });
    expect(mv).toMatchObject({ type: "ADJUSTMENT", fromLocationId: loc });
    await depo
      .patch(`/stock/counts/${id}/lines`)
      .send({ lines: [{ lineId: view.lines[0].id, countedQty: "9" }] })
      .expect(409);
  });

  it("maliyeti bilinmeyen fark yönetici onayı ister; ret yeniden sayıma açar, onay düzeltir", async () => {
    const z = `R${randomUUID().slice(0, 3)}`;
    const loc = (await ctx.prisma.location.create({ data: { warehouseId: wh, code: `${z}-01` } })).id;
    const it0 = await item();
    await depo
      .post("/stock/movements")
      .send({ type: "RECEIPT", itemId: it0.id, locationId: loc, qty: "10", newLot: { lotNo: "L-S2" } })
      .expect(201);
    const { id } = (await depo.post("/stock/counts").send({ warehouseId: wh, zone: z }).expect(201)).body;
    const line = (await depo.get(`/stock/counts/${id}`).expect(200)).body.lines[0];
    await depo
      .patch(`/stock/counts/${id}/lines`)
      .send({ lines: [{ lineId: line.id, countedQty: "12" }] })
      .expect(200);
    expect((await depo.post(`/stock/counts/${id}/submit`).expect(200)).body).toMatchObject({
      needsApproval: true,
      status: "SUBMITTED",
    });

    await depo.post(`/stock/counts/${id}/decide`).send({ decision: "APPROVE" }).expect(403);
    await admin
      .post(`/stock/counts/${id}/decide`)
      .send({ decision: "REJECT", note: "Tekrar say" })
      .expect(200);
    await depo
      .patch(`/stock/counts/${id}/lines`)
      .send({ lines: [{ lineId: line.id, countedQty: "11" }] })
      .expect(200);
    await depo.post(`/stock/counts/${id}/submit`).expect(200);
    await admin.post(`/stock/counts/${id}/decide`).send({ decision: "APPROVE" }).expect(200);
    const bal = await ctx.prisma.stockBalance.findFirstOrThrow({ where: { itemId: it0.id } });
    expect(bal.qtyOnHand.toString()).toBe("11");
    expect(await ctx.prisma.auditLog.count({ where: { entity: "CycleCount", entityId: id } })).toBe(2);
  });

  it("stoksuz bölgede sayım açılamaz", async () => {
    await depo.post("/stock/counts").send({ warehouseId: wh, zone: "YOK" }).expect(400);
  });
});

describe("stok · özet ve tutarlılık", () => {
  it("özet göstergeler ve tutarlılık kontrolü", async () => {
    const s = (await depo.get("/stock/summary").expect(200)).body;
    expect(s).toMatchObject({ expiryWarningDays: 90, turnoverDays: null });
    expect(typeof s.criticalItems).toBe("number");
    await depo.get("/stock/consistency").expect(403);
    const c = (await admin.get("/stock/consistency").expect(200)).body;
    expect(c).toMatchObject({ ok: true, mismatches: [] });
    const w = (await depo.get("/stock/warehouses").expect(200)).body;
    expect(w.find((x: { id: string }) => x.id === wh).locationCount).toBeGreaterThanOrEqual(2);
  });
});
