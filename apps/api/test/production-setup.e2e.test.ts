import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished } from "vitest";
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

type Choice = { itemId: string } | { newItem: { code: string; name: string } };

/** EMA standart kütlesel reçetesi: esans %23 · etil alkol %72,5 · saf su %4 · gliserin %0,5 (yoğunluk 0,854 g/mL). */
function recipe(items: [Choice, Choice, Choice, Choice], pcts: [string, string, string, string] = ["23", "72.5", "4", "0.5"]) {
  const roles = ["ESSENCE", "ALCOHOL", "WATER", "GLYCERIN"] as const;
  return { densityGPerMl: "0.854", components: roles.map((role, i) => ({ role, item: items[i], pct: pcts[i] })) };
}

/** Var olan dört KG hammaddesi (esans + alkol + su + gliserin). */
async function kgItems(tag: string, uom: "KG" | "G" | "L" = "KG") {
  const mk = (code: string, name: string) => ctx.prisma.item.create({ data: { code, name, type: "RAW_MATERIAL", uom } });
  const [e, a, w, g] = await Promise.all([mk(`ES-${tag}`, "Esans"), mk(`AL-${tag}`, "Etil alkol"), mk(`SU-${tag}`, "Saf su"), mk(`GL-${tag}`, "Gliserin")]);
  return { e, a, w, g, choices: [{ itemId: e.id }, { itemId: a.id }, { itemId: w.id }, { itemId: g.id }] as [Choice, Choice, Choice, Choice] };
}

const lotPrefix = () => {
  const now = new Date();
  return `L-${String(now.getUTCFullYear() % 100).padStart(2, "0")}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
};

beforeAll(async () => {
  ctx = await setupTestApp();
  pkgId = (await ctx.prisma.item.create({ data: { code: "AM-SET01", name: "50 ml şişe", type: "PACKAGING", uom: "PCS" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("kütlesel reçete kurulumu (formül + reçete)", () => {
  it("yeni kalemlerle formülü onaylar, kg reçeteyi kurar; parti gramları yüzdeden hesaplanır, lot otomatik atanır", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETA01");

    const before = await admin.get(`/production/setup/${productId}`).expect(200);
    expect(before.body.formula).toBeNull();
    expect(before.body.suggestedFormulaCode).toBe("F-SETA01");
    expect(before.body.template.densityGPerMl).toBe("0.854");
    expect(before.body.template.lines).toHaveLength(4);

    const res = await admin
      .post(`/production/setup/${productId}`)
      .send({
        ...recipe([
          { newItem: { code: "ES-SETA01", name: "Esans · Koku SETA01" } },
          { newItem: { code: "AL-SET966", name: "Etil Alkol (%96,6)" } },
          { newItem: { code: "SU-SET01", name: "Saf Su" } },
          { newItem: { code: "GL-SET01", name: "Gliserin" } },
        ]),
        packagingItemIds: [pkgId],
      })
      .expect(201);
    expect(res.body.formula).toMatchObject({ code: "F-SETA01", version: 1, status: "APPROVED" });
    // 50 ml × 1.000 adet × 0,854 g/mL = 42.700 g → esans %23 = 9,821 kg …
    const lines = Object.fromEntries((res.body.bom.lines as { code: string; qty: string; uom: string }[]).map((l) => [l.code, `${l.qty} ${l.uom}`]));
    expect(lines["ES-SETA01"]).toBe("9.821 KG");
    expect(lines["AL-SET966"]).toBe("30.9575 KG");
    expect(lines["SU-SET01"]).toBe("1.708 KG");
    expect(lines["GL-SET01"]).toBe("0.2135 KG");
    expect(lines["AM-SET01"]).toBe("1000 PCS");

    const essence = await ctx.prisma.item.findUniqueOrThrow({ where: { code: "ES-SETA01" } });
    expect(essence.uom).toBe("KG");
    const formula = await ctx.prisma.formula.findUniqueOrThrow({ where: { id: res.body.formula.id }, include: { lines: true, components: true } });
    expect(formula.concentrationPct.toString()).toBe("23");
    expect(formula.densityGPerMl?.toString()).toBe("0.854");
    expect(formula.components).toHaveLength(4);
    expect(formula.lines).toHaveLength(1); // konsantre: esans %100
    expect(formula.lines[0]!.percentage.toString()).toBe("100");
    expect(await ctx.prisma.auditLog.count({ where: { entityId: formula.id, action: { in: ["formula.create", "formula.approve"] } } })).toBe(2);

    // Parti formu reçetesi
    const r = await admin.get(`/production/recipe/${productId}`).expect(200);
    expect(r.body.mass).toBe(true);
    expect(r.body.lotNoPreview).toBe(`${lotPrefix()}A`);

    // 470 mL → 401,38 g (tablo); alkol yuvarlama farkını alır
    const batch = await admin.post("/production/batches").send({ productId, plannedMl: "470", macerationDays: 14, bottleType: "AMBER" }).expect(201);
    const d = await admin.get(`/production/batches/${batch.body.id}`).expect(200);
    expect(d.body.lotNo).toBe(`${lotPrefix()}A`);
    expect(d.body.totalGr).toBe("401.38");
    expect(d.body.mixUnit).toBe("g");
    const g = Object.fromEntries((d.body.components as { code: string; grams: string }[]).map((c) => [c.code, c.grams]));
    expect(g).toEqual({ "ES-SETA01": "92.32", "AL-SET966": "290.99", "SU-SET01": "16.06", "GL-SET01": "2.01" });

    const mats = await admin.get(`/production/batches/${batch.body.id}/materials`).expect(200);
    const need = Object.fromEntries((mats.body.lines as { code: string; requiredQty: string }[]).map((l) => [l.code, l.requiredQty]));
    expect(need["ES-SETA01"]).toBe("0.0923");
    expect(need["AL-SET966"]).toBe("0.2910");
    expect(need["AM-SET01"]).toBe("10"); // 470 ÷ 50 = 9,4 → ambalaj yukarı

    // İkinci parti sıradaki harfi alır
    const b2 = await admin.post("/production/batches").send({ productId, plannedMl: "1000", macerationDays: 14, bottleType: "AMBER" }).expect(201);
    expect((await admin.get(`/production/batches/${b2.body.id}`).expect(200)).body.lotNo).toBe(`${lotPrefix()}B`);
  });

  it("gram girilince yüzde ve toplam gramdan hesaplanır; tartımdan önce düzeltilebilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETG01");
    const it = await kgItems("SETG01");
    await admin.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(201);

    const batch = await admin
      .post("/production/batches")
      .send({
        productId,
        plannedMl: "479",
        macerationDays: 0,
        bottleType: "AMBER",
        components: [
          { itemId: it.e.id, grams: "100" },
          { itemId: it.a.id, grams: "291" },
          { itemId: it.w.id, grams: "16.05" },
          { itemId: it.g.id, grams: "2.01" },
        ],
      })
      .expect(201);
    let d = (await admin.get(`/production/batches/${batch.body.id}`).expect(200)).body;
    expect(d.totalGr).toBe("409.06");
    expect(d.components[0].pct).toBe("24.4463");
    expect(d.essencePct).toBe(24.45);

    // Düzeltme: yalnızca gram → hacim = toplam ÷ yoğunluk
    await admin
      .patch(`/production/batches/${batch.body.id}`)
      .send({
        components: [
          { itemId: it.e.id, grams: "92.32" },
          { itemId: it.a.id, grams: "291" },
          { itemId: it.w.id, grams: "16.05" },
          { itemId: it.g.id, grams: "2.01" },
        ],
      })
      .expect(200);
    d = (await admin.get(`/production/batches/${batch.body.id}`).expect(200)).body;
    expect(d.totalGr).toBe("401.38");
    expect(d.plannedMl).toBe("470");
    expect(d.components[0].pct).toBe("23.0006"); // 92,32 ÷ 401,38

    // Eksik bileşen listesi reddedilir
    await admin
      .patch(`/production/batches/${batch.body.id}`)
      .send({ components: [{ itemId: it.e.id, grams: "90" }] })
      .expect(400);
  });

  it("dolum çıktısı partinin lot numarasını taşır", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETL01");
    const it = await kgItems("SETL01");
    await admin.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(201);
    const wh = await ctx.prisma.warehouse.create({ data: { code: "W-SETL", name: "L Depo" } });
    await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "L-01", pickSequence: 1 } });
    const batch = await admin.post("/production/batches").send({ productId, plannedMl: "500", macerationDays: 0, bottleType: "AMBER", startStage: "FILLING" }).expect(201);
    const lotNo = (await admin.get(`/production/batches/${batch.body.id}`).expect(200)).body.lotNo;
    const out = await admin.post(`/production/batches/${batch.body.id}/output`).send({ producedQty: 10 }).expect(201);
    expect(out.body.lotNo).toBe(lotNo);
  });

  it("malzeme tablosu karantinadaki stoğu kullanılabilir saymaz; serbest bırakılınca yeterli olur (kural 3)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETQ01");
    const it = await kgItems("SETQ01");
    await admin.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(201);
    const wh = await ctx.prisma.warehouse.create({ data: { code: "W-SETQ", name: "Q Depo" } });
    const loc = await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "Q-01", pickSequence: 1 } });
    await admin.post("/stock/movements").send({ type: "RECEIPT", itemId: it.e.id, locationId: loc.id, qty: "5", newLot: { lotNo: "L-ESQ-1" } }).expect(201);
    const batch = await admin.post("/production/batches").send({ productId, plannedMl: "10000", macerationDays: 0, bottleType: "AMBER" }).expect(201);

    type Row = { code: string; availableQty: string; quarantineQty: string; ok: boolean };
    let mats = await admin.get(`/production/batches/${batch.body.id}/materials`).expect(200);
    let ess = (mats.body.lines as Row[]).find((l) => l.code === "ES-SETQ01")!;
    expect(ess.availableQty).toBe("0");
    expect(ess.quarantineQty).toBe("5");
    expect(ess.ok).toBe(false);

    const lot = await ctx.prisma.lot.findFirstOrThrow({ where: { itemId: it.e.id, lotNo: "L-ESQ-1" } });
    await admin.post(`/stock/lots/${lot.id}/qc`).send({ status: "RELEASED", reason: "CoA uygun" }).expect(201);
    mats = await admin.get(`/production/batches/${batch.body.id}/materials`).expect(200);
    ess = (mats.body.lines as Row[]).find((l) => l.code === "ES-SETQ01")!;
    expect(ess.availableQty).toBe("5");
    expect(ess.ok).toBe(true); // ihtiyaç 10.000 mL × 0,854 × %23 = 1,9642 kg
  });

  it("yeniden kurulum yeni sürüm açar; önceki sürüm arşivlenir, eski reçete pasifleşir, etiket onayı düşer", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETB01");
    const it = await kgItems("SETB01", "G");

    const v1 = await admin.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(201);
    await ctx.prisma.complianceDocument.create({ data: { productId, type: "LABEL_APPROVAL", status: "VALID" } });

    const v2 = await admin.post(`/production/setup/${productId}`).send(recipe(it.choices, ["25", "70.5", "4", "0.5"])).expect(201);
    expect(v2.body.formula.version).toBe(2);
    expect(v2.body.archived).toBe(1);
    expect((await ctx.prisma.formula.findUniqueOrThrow({ where: { id: v1.body.formula.id } })).status).toBe("ARCHIVED");
    const activeBoms = await ctx.prisma.billOfMaterials.findMany({ where: { productId, isActive: true } });
    expect(activeBoms).toHaveLength(1);
    expect(activeBoms[0]!.formulaId).toBe(v2.body.formula.id);
    // G biriminde su: 50 × 1.000 × 0,854 × %4 = 1.708 g
    expect((v2.body.bom.lines as { code: string; qty: string }[]).find((l) => l.code === "SU-SETB01")?.qty).toBe("1708");
    const label = await ctx.prisma.complianceDocument.findUniqueOrThrow({ where: { productId_type: { productId, type: "LABEL_APPROVAL" } } });
    expect(label.status).toBe("EXPIRED");
  });

  it("hareketsiz litre kalemi KG'a çevrilir; hareketli litre kalemi ve tekrar eden kalem reddedilir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETC01");
    const it = await kgItems("SETC01", "L");
    await admin.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(201);
    expect((await ctx.prisma.item.findUniqueOrThrow({ where: { id: it.a.id } })).uom).toBe("KG");
    expect(await ctx.prisma.auditLog.count({ where: { entityId: it.a.id, action: "item.uom_convert" } })).toBe(1);

    const p2 = await makeProduct("SETC02");
    const moved = await ctx.prisma.item.create({ data: { code: "AL-SETC2L", name: "Alkol L", type: "RAW_MATERIAL", uom: "L" } });
    const wh = await ctx.prisma.warehouse.create({ data: { code: "W-SETC", name: "C Depo" } });
    const loc = await ctx.prisma.location.create({ data: { warehouseId: wh.id, code: "C-01", pickSequence: 1 } });
    await admin.post("/stock/movements").send({ type: "RECEIPT", itemId: moved.id, locationId: loc.id, qty: "5", newLot: { lotNo: "L-ALC-1" } }).expect(201);
    const r = await admin
      .post(`/production/setup/${p2}`)
      .send(recipe([{ itemId: it.e.id }, { itemId: moved.id }, { itemId: it.w.id }, { itemId: it.g.id }]))
      .expect(400);
    expect(r.body.message).toContain("çevrilemez");
    await admin
      .post(`/production/setup/${p2}`)
      .send(recipe([{ itemId: it.e.id }, { itemId: it.e.id }, { itemId: it.w.id }, { itemId: it.g.id }]))
      .expect(400);
  });

  it("onay bekleyen taslak varken kurulum yapılmaz (409)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const productId = await makeProduct("SETD01");
    await ctx.prisma.formula.create({ data: { code: "F-SETD01", version: 1, name: "Taslak", concentrationPct: "20", status: "IN_REVIEW" } });
    const it = await kgItems("SETD01");
    await admin.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(409);
  });

  it("yetki: stok oluşturma yetkisi olmadan yeni kalem açılamaz; yetkisiz rol kurulum yapamaz", async () => {
    const prodUser = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    const productId = await makeProduct("SETE01");
    const it = await kgItems("SETE01");
    await prodUser
      .post(`/production/setup/${productId}`)
      .send(recipe([{ newItem: { code: "ES-SETE0N", name: "Esans E" } }, it.choices[1], it.choices[2], it.choices[3]]))
      .expect(403);
    const ok = await prodUser.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(201);
    expect(ok.body.formula.status).toBe("APPROVED");

    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.post(`/production/setup/${productId}`).send(recipe(it.choices)).expect(403);
  });

  it("varsayılan reçete şablonu ekrandan değiştirilir; yeni kurulumlara gelir; denetime yazılır", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const before = (await admin.get("/production/recipe-template").expect(200)).body;
    expect(before.densityGPerMl).toBe("0.854");
    onTestFinished(async () => {
      await ctx.prisma.systemSetting.deleteMany({ where: { key: "production.recipeTemplate" } });
    });

    const next = {
      densityGPerMl: "0.86",
      lines: [
        { role: "ESSENCE", pct: "20" },
        { role: "ALCOHOL", pct: "75.5" },
        { role: "WATER", pct: "4" },
        { role: "GLYCERIN", pct: "0.5" },
      ],
    };
    await admin.put("/production/recipe-template").send({ ...next, lines: next.lines.slice(0, 3) }).expect(400); // toplam %99,5
    await sales.put("/production/recipe-template").send(next).expect(403);
    await admin.put("/production/recipe-template").send(next).expect(200);

    const productId = await makeProduct("SETT01");
    const setup = (await admin.get(`/production/setup/${productId}`).expect(200)).body;
    expect(setup.template.densityGPerMl).toBe("0.86");
    expect(setup.template.lines[0]).toEqual({ role: "ESSENCE", pct: "20" });
    expect(await ctx.prisma.auditLog.count({ where: { entityId: "production.recipeTemplate", action: "setting.change" } })).toBeGreaterThanOrEqual(1);
  });
});
