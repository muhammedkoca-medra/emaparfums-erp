import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let admin: Awaited<ReturnType<typeof loginAgent>>;
let adminUserId: string;
let uretim: Awaited<ReturnType<typeof loginAgent>>;
let satis: Awaited<ReturnType<typeof loginAgent>>;
let muhasebe: Awaited<ReturnType<typeof loginAgent>>;
let musavir: Awaited<ReturnType<typeof loginAgent>>;
const cat = `P${randomUUID()
  .slice(0, 6)
  .toUpperCase()
  .replace(/[^A-Z]/g, "X")}`;

beforeAll(async () => {
  ctx = await setupTestApp();
  const a = await createUser(ctx, ["ADMIN"]);
  adminUserId = a.id;
  admin = await loginAgent(ctx, a);
  uretim = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
  satis = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
  muhasebe = await loginAgent(ctx, await createUser(ctx, ["ACCOUNTING"]));
  musavir = await loginAgent(ctx, await createUser(ctx, ["ACCOUNTANT_EXT"]));
  await ctx.prisma.taxRule.create({
    data: {
      category: cat,
      gtipPrefix: "3303",
      kdvRate: "0.20",
      otvRate: "0.20",
      validFrom: new Date("2026-01-01"),
      approvedAt: new Date("2026-01-01"),
    },
  });
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

const code = (p: string) =>
  `${p}-${randomUUID()
    .slice(0, 6)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "0")}`;

describe("F1-01 · kalem ve ürün kartları", () => {
  it("kalem oluşturulur, kod biçimi ve tekrar denetlenir, düzenleme denetim kaydı yazar", async () => {
    const c = code("MM");
    const r = await admin
      .post("/catalog/items")
      .send({ code: c.toLowerCase(), name: "Deneme EDP", type: "FINISHED_GOOD", uom: "PCS", minStock: "10" })
      .expect(201);
    await admin
      .post("/catalog/items")
      .send({ code: c, name: "Tekrar", type: "FINISHED_GOOD", uom: "PCS" })
      .expect(409);
    await admin
      .post("/catalog/items")
      .send({ code: "HATALI", name: "X", type: "FINISHED_GOOD", uom: "PCS" })
      .expect(400);
    await admin.patch(`/catalog/items/${r.body.id}`).send({ minStock: "25" }).expect(200);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: "item.update", entityId: r.body.id },
    });
    expect((log.before as { minStock: string }).minStock).toBe("10");
    expect((log.after as { minStock: string }).minStock).toBe("25");
  });

  it("ürün kartı: yalnızca mamule, geçerli EAN-13, tanımlı vergi kategorisi; GTİP uyuşmazlığı uyarı", async () => {
    const hm = (
      await admin
        .post("/catalog/items")
        .send({ code: code("HM"), name: "Esans", type: "RAW_MATERIAL", uom: "KG" })
        .expect(201)
    ).body;
    const mm = (
      await admin
        .post("/catalog/items")
        .send({ code: code("MM"), name: "Parfüm", type: "FINISHED_GOOD", uom: "PCS" })
        .expect(201)
    ).body;
    const base = {
      sku: code("SK"),
      name: "Deneme EDP 50 ml",
      concentration: "EDP",
      volumeMl: 50,
      gtip: "3303.00",
      taxCategory: cat,
    };
    const onRaw = await satis
      .post("/catalog/products")
      .send({ ...base, itemId: hm.id })
      .expect(400);
    expect(onRaw.body.message).toBe("Ürün kartı yalnızca mamul kalem için açılır");
    await satis
      .post("/catalog/products")
      .send({ ...base, itemId: mm.id, barcode: "4006381333932" })
      .expect(400);
    const noCat = await satis
      .post("/catalog/products")
      .send({ ...base, itemId: mm.id, taxCategory: "YOK_KATEGORI" })
      .expect(400);
    expect(noCat.body.message).toBe("Vergi kategorisi tanımlı değil: YOK_KATEGORI");
    const ok = await satis
      .post("/catalog/products")
      .send({ ...base, itemId: mm.id, barcode: "4006381333931" })
      .expect(201);
    expect(ok.body.warnings).toEqual([]);
    const upd = await satis.patch(`/catalog/products/${ok.body.id}`).send({ gtip: "3401.00" }).expect(200);
    expect(upd.body.warnings[0]).toMatch(/uyuşmuyor/);
    const ev = await ctx.prisma.outboxEvent.findMany({
      where: { type: "product.updated", aggregateId: ok.body.id },
    });
    expect(ev.map((e) => (e.payload as { fields: string[] }).fields)).toEqual([["created"], ["gtip"]]);
  });

  it("koku profili yalnızca scent:EDIT ile; denetim kaydı ve olay", async () => {
    const mm = (
      await admin
        .post("/catalog/items")
        .send({ code: code("MM"), name: "Parfüm", type: "FINISHED_GOOD", uom: "PCS" })
        .expect(201)
    ).body;
    const p = (
      await admin
        .post("/catalog/products")
        .send({
          itemId: mm.id,
          sku: code("SK"),
          name: "Parfüm",
          concentration: "EDP",
          volumeMl: 50,
          gtip: "3303.00",
          taxCategory: cat,
        })
        .expect(201)
    ).body;
    const body = {
      notes: [{ name: "Bergamot", family: "citrus", tier: "TOP" }],
      accords: { fresh: 80, amber: 20 },
    };
    await satis.put(`/catalog/products/${p.id}/scent`).send(body).expect(403);
    await uretim.put(`/catalog/products/${p.id}/scent`).send(body).expect(200);
    const d = (await admin.get(`/catalog/products/${p.id}`).expect(200)).body;
    expect(d.notes).toEqual([{ name: "Bergamot", family: "citrus", tier: "TOP" }]);
    expect(await ctx.prisma.auditLog.count({ where: { action: "product.scent", entityId: p.id } })).toBe(1);
  });
});

describe("F1-02 · formül sürümü ve onay", () => {
  it("taslak → onaya gönder (toplam %100) → onay; yeni sürüm eskisini arşivler ve ürünü bağlar", async () => {
    const e1 = (
      await admin
        .post("/catalog/items")
        .send({ code: code("HM"), name: "E1", type: "RAW_MATERIAL", uom: "KG" })
        .expect(201)
    ).body;
    const e2 = (
      await admin
        .post("/catalog/items")
        .send({ code: code("HM"), name: "E2", type: "RAW_MATERIAL", uom: "KG" })
        .expect(201)
    ).body;
    const pk = (
      await admin
        .post("/catalog/items")
        .send({ code: code("AM"), name: "Şişe", type: "PACKAGING", uom: "PCS" })
        .expect(201)
    ).body;
    const fcode = `F-${randomUUID()
      .slice(0, 5)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "0")}`;

    await satis.post("/formulas").send({ code: fcode, name: "X", concentrationPct: "20" }).expect(403);
    const f1 = (
      await uretim.post("/formulas").send({ code: fcode, name: "Deneme", concentrationPct: "20" }).expect(201)
    ).body;
    await uretim.post("/formulas").send({ code: fcode, name: "Tekrar", concentrationPct: "20" }).expect(409);

    const pkLine = await uretim
      .put(`/formulas/${f1.id}`)
      .send({ lines: [{ itemId: pk.id, percentage: "100" }], allergens: [] })
      .expect(400);
    expect(pkLine.body.message).toBe("Formül satırı yalnızca hammadde ya da yarı mamul olabilir");
    const saved = await uretim
      .put(`/formulas/${f1.id}`)
      .send({
        lines: [
          { itemId: e1.id, percentage: "60" },
          { itemId: e2.id, percentage: "39.9" },
        ],
        allergens: [{ name: "Linalool", pctInFinal: "0.12", mustLabel: true }],
      })
      .expect(200);
    expect(saved.body.warnings[0]).toMatch(/toplamı %100/);
    const sub = await uretim.post(`/formulas/${f1.id}/submit`).expect(400);
    expect(sub.body.message).toBe("Satır yüzdelerinin toplamı %100 olmalı (şu an %99.9)");
    await uretim
      .put(`/formulas/${f1.id}`)
      .send({
        lines: [
          { itemId: e1.id, percentage: "60" },
          { itemId: e2.id, percentage: "40" },
        ],
        allergens: [],
      })
      .expect(200);
    await uretim.post(`/formulas/${f1.id}/submit`).expect(200);
    await uretim.put(`/formulas/${f1.id}`).send({ lines: [], allergens: [] }).expect(409); // incelemedeyken düzenlenemez
    await satis.post(`/formulas/${f1.id}/decide`).send({ decision: "APPROVE" }).expect(403);
    await uretim.post(`/formulas/${f1.id}/decide`).send({ decision: "APPROVE" }).expect(200);

    // Ürünü v1'e bağla, v2 aç, onayla → v1 arşiv, ürün v2'ye
    const mm = (
      await admin
        .post("/catalog/items")
        .send({ code: code("MM"), name: "Parfüm", type: "FINISHED_GOOD", uom: "PCS" })
        .expect(201)
    ).body;
    const p = (
      await admin
        .post("/catalog/products")
        .send({
          itemId: mm.id,
          sku: code("SK"),
          name: "Parfüm",
          concentration: "EDP",
          volumeMl: 50,
          gtip: "3303.00",
          taxCategory: cat,
        })
        .expect(201)
    ).body;
    await ctx.prisma.product.update({ where: { id: p.id }, data: { formulaId: f1.id } });

    await uretim.put(`/formulas/${f1.id}`).send({ lines: [], allergens: [] }).expect(409); // onaylı düzenlenmez
    const v2 = (await uretim.post(`/formulas/${f1.id}/versions`).expect(201)).body;
    expect(v2.version).toBe(2);
    await uretim.post(`/formulas/${f1.id}/versions`).expect(409); // açık taslak var
    await uretim
      .put(`/formulas/${v2.id}`)
      .send({
        lines: [
          { itemId: e1.id, percentage: "55" },
          { itemId: e2.id, percentage: "45" },
        ],
        allergens: [],
      })
      .expect(200);
    await uretim.post(`/formulas/${v2.id}/submit`).expect(200);
    const dec = (await admin.post(`/formulas/${v2.id}/decide`).send({ decision: "APPROVE" }).expect(200))
      .body;
    expect(dec).toMatchObject({ status: "APPROVED", archived: 1, productsRelinked: 1 });
    expect((await ctx.prisma.formula.findUniqueOrThrow({ where: { id: f1.id } })).status).toBe("ARCHIVED");
    expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: p.id } })).formulaId).toBe(v2.id);
    const actions = (
      await ctx.prisma.auditLog.findMany({
        where: { entity: "Formula", entityId: { in: [f1.id, v2.id] } },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "formula.create",
        "formula.update",
        "formula.submit",
        "formula.approve",
        "formula.version",
      ]),
    );
    // Formül satırları ticari gizli: satış rolü göremez
    await satis.get(`/formulas/${v2.id}`).expect(403);
  });
});

describe("F3-03 · IFRA limit kontrolü (URT-09)", () => {
  it("IFRA limitini aşan formül onaylanamaz; limit gevşeyince onaylanır", async () => {
    const e = (await admin.post("/catalog/items").send({ code: code("HM"), name: "Kısıtlı madde", type: "RAW_MATERIAL", uom: "KG" }).expect(201)).body;
    const fcode = `F-${randomUUID().slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`;
    const f = (await uretim.post("/formulas").send({ code: fcode, name: "IFRA", concentrationPct: "20", ifraCategory: "4" }).expect(201)).body;
    await uretim.put(`/formulas/${f.id}`).send({ lines: [{ itemId: e.id, percentage: "100" }], allergens: [] }).expect(200);
    await uretim.post(`/formulas/${f.id}/submit`).expect(200);
    // Son üründe %20 (100 × 20/100). Limit %1 → onay engellenir.
    await ctx.prisma.systemSetting.upsert({ where: { key: "ifra.limits" }, update: { value: { [e.code]: { "4": 1 } } }, create: { key: "ifra.limits", value: { [e.code]: { "4": 1 } } } });
    const blocked = await admin.post(`/formulas/${f.id}/decide`).send({ decision: "APPROVE" }).expect(400);
    expect(blocked.body.message).toContain("IFRA");
    expect((await ctx.prisma.formula.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("IN_REVIEW");
    // Limit %25 → %20 uygun, onaylanır.
    await ctx.prisma.systemSetting.update({ where: { key: "ifra.limits" }, data: { value: { [e.code]: { "4": 25 } } } });
    await admin.post(`/formulas/${f.id}/decide`).send({ decision: "APPROVE" }).expect(200);
    expect((await ctx.prisma.formula.findUniqueOrThrow({ where: { id: f.id } })).status).toBe("APPROVED");
  });
});

describe("F3-04 · alerjen beyan eşiği (KAL-07)", () => {
  it("mustLabel eşikten otomatik hesaplanır (kullanıcı girdisi bağlayıcı değil)", async () => {
    const e = (await admin.post("/catalog/items").send({ code: code("HM"), name: "Alerjen madde", type: "RAW_MATERIAL", uom: "KG" }).expect(201)).body;
    const fcode = `F-${randomUUID().slice(0, 5).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`;
    const f = (await uretim.post("/formulas").send({ code: fcode, name: "Alerjen", concentrationPct: "20" }).expect(201)).body;
    await uretim
      .put(`/formulas/${f.id}`)
      .send({
        lines: [{ itemId: e.id, percentage: "100" }],
        // eşik %0.001: 0.5 üstünde (kullanıcı false demiş), 0.0005 altında (kullanıcı true demiş)
        allergens: [
          { name: "Linalool", pctInFinal: "0.5", mustLabel: false },
          { name: "Limonene", pctInFinal: "0.0005", mustLabel: true },
        ],
      })
      .expect(200);
    const rows = await ctx.prisma.formulaAllergen.findMany({ where: { formulaId: f.id }, orderBy: { name: "asc" } });
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.mustLabel]));
    expect(byName.Linalool).toBe(true);
    expect(byName.Limonene).toBe(false);
  });
});

describe("F1-08 · vergi kuralları", () => {
  it("yeni oran taslak girilir, onayla yayına alınır; önceki kural kapanır; eski tarih eski oranı verir", async () => {
    const c = `T${randomUUID()
      .slice(0, 6)
      .toUpperCase()
      .replace(/[^A-Z]/g, "Y")}`;
    await admin
      .post("/tax/rules")
      .send({ category: c, kdvRate: "0.20", otvRate: "0.20", validFrom: "2026-01-01" })
      .expect(201);
    const [r1] = (await admin.get("/tax/rules").expect(200)).body.filter(
      (r: { category: string }) => r.category === c,
    );
    expect(r1.state).toBe("PENDING");
    await muhasebe.post(`/tax/rules/${r1.id}/approve`).expect(403); // muhasebe: GD, onay yok
    await musavir.post(`/tax/rules/${r1.id}/approve`).expect(200); // mali müşavir: GOn
    await musavir
      .post("/tax/rules")
      .send({ category: c, kdvRate: "0.10", otvRate: "0", validFrom: "2026-07-01" })
      .expect(403); // düzenleme yok
    const r2 = (
      await muhasebe
        .post("/tax/rules")
        .send({ category: c, kdvRate: "0.10", otvRate: "0", validFrom: "2026-07-01" })
        .expect(201)
    ).body;
    await admin
      .post("/tax/rules")
      .send({ category: c, kdvRate: "0.10", otvRate: "0", validFrom: "2026-07-01" })
      .expect(409);
    await admin.post(`/tax/rules/${r2.id}/approve`).expect(200);
    await admin.post(`/tax/rules/${r2.id}/approve`).expect(409);

    const closed = await ctx.prisma.taxRule.findUniqueOrThrow({ where: { id: r1.id } });
    expect(closed.validTo?.toISOString().slice(0, 10)).toBe("2026-07-01");
    const before = (await admin.get(`/tax/preview?category=${c}&gross=1290&date=2026-03-01`).expect(200))
      .body;
    const after = (await admin.get(`/tax/preview?category=${c}&gross=1290&date=2026-08-01`).expect(200)).body;
    expect(before).toMatchObject({
      otvRate: "0.2",
      kdvRate: "0.2",
      net: "895.83",
      otv: "179.17",
      kdv: "215.00",
      gross: "1290.00",
    });
    expect(after).toMatchObject({ otvRate: "0", kdvRate: "0.1", kdv: "117.27", gross: "1290.00" });
    await admin.get(`/tax/preview?category=${c}&gross=1&date=2025-01-01`).expect(400);
    expect(
      await ctx.prisma.outboxEvent.count({
        where: { type: "tax_rule.changed", aggregateId: { in: [r1.id, r2.id] } },
      }),
    ).toBe(2);
    expect(await ctx.prisma.auditLog.count({ where: { entity: "TaxRule", entityId: r1.id } })).toBe(3); // create, approve, close
  });
});

describe("F1-09 · yetki matrisi değişikliği onaylı", () => {
  it("talep → başka yönetici onayı → izin geçerli; kendi talebini onaylayamaz; yönetici kilitlenemez", async () => {
    const admin2 = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const role = await ctx.prisma.role.findUniqueOrThrow({ where: { code: "MARKETING" } });
    const adminRole = await ctx.prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    const m = (await admin.get("/admin/permission-matrix").expect(200)).body;
    expect(m.roles.find((r: { code: string }) => r.code === "MARKETING").permissions).not.toContain(
      "stock:VIEW",
    );

    const lock = await admin
      .post("/admin/permission-changes")
      .send({ roleId: adminRole.id, module: "admin", action: "VIEW", grant: false })
      .expect(400);
    expect(lock.body.message).toBe("Yönetici rolünün yönetim izinleri kaldırılamaz");
    await admin
      .post("/admin/permission-changes")
      .send({ roleId: role.id, module: "social", action: "VIEW", grant: true })
      .expect(400); // zaten var

    const req1 = (
      await admin
        .post("/admin/permission-changes")
        .send({
          roleId: role.id,
          module: "stock",
          action: "VIEW",
          grant: true,
          note: "Kampanya için stok görünürlüğü",
        })
        .expect(201)
    ).body;
    await admin
      .post("/admin/permission-changes")
      .send({ roleId: role.id, module: "stock", action: "VIEW", grant: true })
      .expect(409);
    // Henüz geçerli değil
    expect(
      await ctx.prisma.rolePermission.count({ where: { roleId: role.id, module: "stock", action: "VIEW" } }),
    ).toBe(0);
    const self = await admin.post(`/approvals/${req1.id}/decide`).send({ decision: "APPROVE" }).expect(403);
    expect(self.body.message).toMatch(/Kendi talebinizi onaylayamazsınız/);
    await admin2.post(`/approvals/${req1.id}/decide`).send({ decision: "APPROVE" }).expect(200);
    expect(
      await ctx.prisma.rolePermission.count({ where: { roleId: role.id, module: "stock", action: "VIEW" } }),
    ).toBe(1);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: "permission.change", entityId: role.id },
    });
    expect((log.after as { permissions: string[] }).permissions).toContain("stock:VIEW");
    expect((log.before as { permissions: string[] }).permissions).not.toContain("stock:VIEW");

    // Geri al (red yolu da çalışır)
    const req2 = (
      await admin2
        .post("/admin/permission-changes")
        .send({ roleId: role.id, module: "stock", action: "VIEW", grant: false })
        .expect(201)
    ).body;
    await admin
      .post(`/approvals/${req2.id}/decide`)
      .send({ decision: "REJECT", note: "Gerek yok" })
      .expect(200);
    await admin.post(`/approvals/${req2.id}/decide`).send({ decision: "APPROVE" }).expect(409);
    expect(
      await ctx.prisma.rolePermission.count({ where: { roleId: role.id, module: "stock", action: "VIEW" } }),
    ).toBe(1);
    void adminUserId;
  });
});

describe("F1-10 · kontrol paneli", () => {
  it("özet yalnızca izinli kartları döner; mali müşavirin panel izni yok", async () => {
    const a = (await admin.get("/dashboard/summary").expect(200)).body;
    expect(a.stock).not.toBeNull();
    expect(a.admin).not.toBeNull();
    const s = (await satis.get("/dashboard/summary").expect(200)).body;
    expect(s.stock).not.toBeNull(); // satış: stock G
    expect(s.production).toBeNull();
    expect(s.admin).toBeNull();
    await musavir.get("/dashboard/summary").expect(403);
  });

  it("canlı akış SSE ile olay gönderir; izinsiz modül olayları süzülür", async () => {
    const res = await fetchSse(admin, "/dashboard/feed");
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.text).toMatch(/event: event/);
    const sat = await fetchSse(satis, "/dashboard/feed");
    // satış rolü tax/admin olaylarını görmez
    expect(sat.text).not.toMatch(/"type":"tax_rule\.changed"/);
    expect(sat.text).not.toMatch(/"type":"system\.ping"/);
  });
});

/** SSE akışından ilk birkaç yüz milisaniyeyi okur (oturum çereziyle, gerçek HTTP üzerinden). */
async function fetchSse(agent: Awaited<ReturnType<typeof loginAgent>>, path: string) {
  const me = await agent.get("/auth/me"); // çerez ajanın kavanozunda
  void me;
  const cookie = (
    agent as unknown as { jar: { getCookies: (o: unknown) => { toValueString: () => string } } }
  ).jar
    .getCookies({ domain: "127.0.0.1", path: "/", secure: false, script: false })
    .toValueString();
  const server = ctx.app.getHttpServer().listen(0);
  const port = (server.address() as { port: number }).port;
  const ctrl = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie }, signal: ctrl.signal });
    const reader = res.body!.getReader();
    let text = "";
    const until = Date.now() + 700;
    while (Date.now() < until) {
      const r = await Promise.race([
        reader.read(),
        new Promise<null>((ok) => setTimeout(() => ok(null), until - Date.now())),
      ]);
      if (!r || r.done) break;
      text += new TextDecoder().decode(r.value);
    }
    ctrl.abort();
    return { headers: Object.fromEntries(res.headers.entries()), text };
  } finally {
    server.close();
  }
}
