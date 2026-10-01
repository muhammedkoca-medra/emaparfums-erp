import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let pkgId: string;

async function makeProduct(sku: string, status: "ACTIVE" | "DRAFT" = "ACTIVE") {
  const item = await ctx.prisma.item.create({ data: { code: `EM-${sku}`, name: `Ürün ${sku}`, type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await ctx.prisma.product.create({
    data: { itemId: item.id, sku, name: `Koku ${sku}`, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status },
  });
  return p.id;
}

beforeAll(async () => {
  ctx = await setupTestApp();
  pkgId = (await ctx.prisma.item.create({ data: { code: "AM-SET01", name: "50 ml şişe", type: "PACKAGING", uom: "PCS" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("hızlı üretim kurulumu (formül + reçete)", () => {
  it("yeni esans/baz kartlarıyla formülü onaylar, reçeteyi kurar, ürüne bağlar; parti açılabilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETA01");

    const before = await admin.get(`/production/setup/${productId}`).expect(200);
    expect(before.body.formula).toBeNull();
    expect(before.body.suggestedFormulaCode).toBe("F-SETA01");
    expect(before.body.canApprove).toBe(true);

    const res = await admin
      .post(`/production/setup/${productId}`)
      .send({
        concentrationPct: "20",
        essence: { newItem: { code: "ES-SETA01", name: "Esans · Koku SETA01" } },
        base: { newItem: { code: "BZ-SET01", name: "Parfüm bazı (alkol)" } },
        packagingItemIds: [pkgId],
      })
      .expect(201);
    expect(res.body.formula).toMatchObject({ code: "F-SETA01", version: 1, status: "APPROVED" });
    expect(res.body.linked).toBe(true);
    // 50 ml × 1.000 adet × %20 = 10 L esans, 40 L baz, 1.000 şişe
    const lines = Object.fromEntries((res.body.bom.lines as { code: string; qty: string; uom: string }[]).map((l) => [l.code, `${l.qty} ${l.uom}`]));
    expect(lines["ES-SETA01"]).toBe("10 L");
    expect(lines["BZ-SET01"]).toBe("40 L");
    expect(lines["AM-SET01"]).toBe("1000 PCS");

    // Kalemler hammadde · L olarak açıldı
    const essence = await ctx.prisma.item.findUniqueOrThrow({ where: { code: "ES-SETA01" } });
    expect(essence.type).toBe("RAW_MATERIAL");
    expect(essence.uom).toBe("L");
    // Formül tek satır %100
    const formula = await ctx.prisma.formula.findUniqueOrThrow({ where: { id: res.body.formula.id }, include: { lines: true } });
    expect(formula.lines).toHaveLength(1);
    expect(formula.lines[0]!.percentage.toString()).toBe("100");
    // Vitrindeki ürün kilitlenmedi (uyum belgesi yokken durum değişmez)
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.status).toBe("ACTIVE");
    expect(product.formulaId).toBe(formula.id);
    // Denetim kaydı
    const audits = await ctx.prisma.auditLog.count({ where: { entityId: formula.id, action: { in: ["formula.create", "formula.approve"] } } });
    expect(audits).toBe(2);

    // Parti: 10.000 ml → 200 adet; malzeme 2 L esans, 8 L baz, 200 şişe
    const batch = await admin
      .post("/production/batches")
      .send({ productId, plannedMl: "10000", macerationDays: 14, bottleType: "AMBER" })
      .expect(201);
    const mats = await admin.get(`/production/batches/${batch.body.id}/materials`).expect(200);
    const need = Object.fromEntries((mats.body.lines as { code: string; requiredQty: string }[]).map((l) => [l.code, l.requiredQty]));
    expect(need["ES-SETA01"]).toBe("2");
    expect(need["BZ-SET01"]).toBe("8");
    expect(need["AM-SET01"]).toBe("200");
  });

  it("malzeme tablosu karantinadaki stoğu kullanılabilir saymaz; serbest bırakılınca yeterli olur (kural 3)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETQ01");
    const essence = await ctx.prisma.item.create({ data: { code: "ES-SETQ01", name: "Esans Q", type: "RAW_MATERIAL", uom: "L" } });
    const base = await ctx.prisma.item.create({ data: { code: "BZ-SETQ1", name: "Baz Q", type: "RAW_MATERIAL", uom: "L" } });
    await admin.post(`/production/setup/${productId}`).send({ concentrationPct: "20", essence: { itemId: essence.id }, base: { itemId: base.id } }).expect(201);
    const wh = await ctx.prisma.warehouse.create({ data: { code: "W-SETQ", name: "Q Depo" } });
    const loc = await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "Q-01", pickSequence: 1 } });
    // Elle stok girişi: yeni lot karantinada açılır
    await admin.post("/stock/movements").send({ type: "RECEIPT", itemId: essence.id, locationId: loc.id, qty: "5", newLot: { lotNo: "L-ESQ-1" } }).expect(201);
    const batch = await admin.post("/production/batches").send({ productId, plannedMl: "10000", macerationDays: 0, bottleType: "AMBER" }).expect(201);

    let mats = await admin.get(`/production/batches/${batch.body.id}/materials`).expect(200);
    let ess = (mats.body.lines as { code: string; availableQty: string; quarantineQty: string; ok: boolean }[]).find((l) => l.code === "ES-SETQ01")!;
    expect(ess.availableQty).toBe("0");
    expect(ess.quarantineQty).toBe("5");
    expect(ess.ok).toBe(false);

    const lot = await ctx.prisma.lot.findFirstOrThrow({ where: { itemId: essence.id, lotNo: "L-ESQ-1" } });
    await admin.post(`/stock/lots/${lot.id}/qc`).send({ status: "RELEASED", reason: "CoA uygun" }).expect(201);
    mats = await admin.get(`/production/batches/${batch.body.id}/materials`).expect(200);
    ess = (mats.body.lines as { code: string; availableQty: string; quarantineQty: string; ok: boolean }[]).find((l) => l.code === "ES-SETQ01")!;
    expect(ess.availableQty).toBe("5");
    expect(ess.quarantineQty).toBe("0");
    expect(ess.ok).toBe(true); // ihtiyaç 2 L
  });

  it("yeniden kurulum yeni sürüm açar; önceki sürüm arşivlenir, eski reçete pasifleşir, etiket onayı düşer", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETB01");
    const essence = await ctx.prisma.item.create({ data: { code: "ES-SETB01", name: "Esans B", type: "RAW_MATERIAL", uom: "L" } });
    const base = await ctx.prisma.item.create({ data: { code: "BZ-SETB1", name: "Baz B", type: "RAW_MATERIAL", uom: "ML" } });
    const body = { essence: { itemId: essence.id }, base: { itemId: base.id } };

    const v1 = await admin.post(`/production/setup/${productId}`).send({ ...body, concentrationPct: "20" }).expect(201);
    await ctx.prisma.complianceDocument.create({ data: { productId, type: "LABEL_APPROVAL", status: "VALID" } });

    const v2 = await admin.post(`/production/setup/${productId}`).send({ ...body, concentrationPct: "25" }).expect(201);
    expect(v2.body.formula.version).toBe(2);
    expect(v2.body.archived).toBe(1);
    const old = await ctx.prisma.formula.findUniqueOrThrow({ where: { id: v1.body.formula.id } });
    expect(old.status).toBe("ARCHIVED");
    const activeBoms = await ctx.prisma.billOfMaterials.findMany({ where: { productId, isActive: true } });
    expect(activeBoms).toHaveLength(1);
    expect(activeBoms[0]!.formulaId).toBe(v2.body.formula.id);
    // Baz ML biriminde: 50 × 1.000 × %75 = 37.500 ml
    const baseLine = (v2.body.bom.lines as { code: string; qty: string }[]).find((l) => l.code === "BZ-SETB1");
    expect(baseLine?.qty).toBe("37500");
    const label = await ctx.prisma.complianceDocument.findUniqueOrThrow({ where: { productId_type: { productId, type: "LABEL_APPROVAL" } } });
    expect(label.status).toBe("EXPIRED");
  });

  it("ağırlıkla (KG) tutulan esans reddedilir; esans ve baz aynı olamaz", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETC01");
    const kg = await ctx.prisma.item.create({ data: { code: "ES-SETC01", name: "Esans KG", type: "RAW_MATERIAL", uom: "KG" } });
    const liq = await ctx.prisma.item.create({ data: { code: "BZ-SETC1", name: "Baz C", type: "RAW_MATERIAL", uom: "L" } });
    const r = await admin
      .post(`/production/setup/${productId}`)
      .send({ concentrationPct: "20", essence: { itemId: kg.id }, base: { itemId: liq.id } })
      .expect(400);
    expect(r.body.message).toContain("hacim birimiyle");
    await admin
      .post(`/production/setup/${productId}`)
      .send({ concentrationPct: "20", essence: { itemId: liq.id }, base: { itemId: liq.id } })
      .expect(400);
  });

  it("onay bekleyen taslak varken kurulum yapılmaz (409)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETD01");
    await ctx.prisma.formula.create({ data: { code: "F-SETD01", version: 1, name: "Taslak", concentrationPct: "20", status: "IN_REVIEW" } });
    const e = await ctx.prisma.item.create({ data: { code: "ES-SETD01", name: "Esans D", type: "RAW_MATERIAL", uom: "L" } });
    const b = await ctx.prisma.item.create({ data: { code: "BZ-SETD1", name: "Baz D", type: "RAW_MATERIAL", uom: "L" } });
    await admin
      .post(`/production/setup/${productId}`)
      .send({ concentrationPct: "20", essence: { itemId: e.id }, base: { itemId: b.id } })
      .expect(409);
  });

  it("yetki: stok oluşturma yetkisi olmadan yeni kalem açılamaz; yetkisiz rol kurulum yapamaz", async () => {
    const prodUser = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const productId = await makeProduct("SETE01");
    await prodUser
      .post(`/production/setup/${productId}`)
      .send({
        concentrationPct: "20",
        essence: { newItem: { code: "ES-SETE01", name: "Esans E" } },
        base: { newItem: { code: "BZ-SETE1", name: "Baz E" } },
      })
      .expect(403);
    // Var olan kalemlerle PRODUCTION rolü kurabilir (production:APPROVE taşır → onaylı)
    const e = await ctx.prisma.item.create({ data: { code: "ES-SETE02", name: "Esans E2", type: "RAW_MATERIAL", uom: "L" } });
    const b = await ctx.prisma.item.create({ data: { code: "BZ-SETE2", name: "Baz E2", type: "RAW_MATERIAL", uom: "L" } });
    const ok = await prodUser
      .post(`/production/setup/${productId}`)
      .send({ concentrationPct: "20", essence: { itemId: e.id }, base: { itemId: b.id } })
      .expect(201);
    expect(ok.body.formula.status).toBe("APPROVED");

    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.post(`/production/setup/${productId}`).send({ concentrationPct: "20", essence: { itemId: e.id }, base: { itemId: b.id } }).expect(403);
  });
});
