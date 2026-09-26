import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

const sample = {
  type: "INDIVIDUAL" as const,
  fullName: "Ayşe Yılmaz",
  email: "ayse.yilmaz@example.com",
  phone: "0532 123 45 67",
  kvkkConsent: true,
  marketingConsent: true,
  consentChannel: "WEB" as const,
};

describe("müşteri (F2-01, SAL-04, KVKK)", () => {
  it("oluşturur; PII şifreli saklanır, hash aranabilir, denetim maskeli", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const { body } = await sales.post("/customers").send(sample).expect(201);
    const id = body.id as string;

    // Ham satır: e-posta düz metin DEĞİL (şifreli), hash dolu.
    const raw = await ctx.prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(raw.email).not.toBe(sample.email);
    expect(raw.email).toContain("."); // token biçimi keyId.iv.tag.ct
    expect(raw.emailHash).toBeTruthy();
    expect(raw.phoneHash).toBeTruthy();

    // Denetim kaydında açık e-posta yok.
    const audit = await ctx.prisma.auditLog.findFirst({ where: { entity: "Customer", entityId: id, action: "customer.create" } });
    expect(JSON.stringify(audit?.after)).not.toContain(sample.email);
    expect(JSON.stringify(audit?.after)).not.toContain("532 123");

    // KVKK + pazarlama rıza kaydı ve zaman damgası.
    expect(raw.kvkkConsentAt).not.toBeNull();
    expect(raw.marketingConsentAt).not.toBeNull();
    const consents = await ctx.prisma.consentRecord.findMany({ where: { customerId: id } });
    expect(consents).toHaveLength(2);
  });

  it("customer_pii izni olan açık, olmayan maskeli görür", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const { body } = await sales.post("/customers").send({ ...sample, email: "gizli@ornek.com", phone: "0533 000 11 22" }).expect(201);

    const full = await sales.get(`/customers/${body.id}`).expect(200);
    expect(full.body.email).toBe("gizli@ornek.com");

    const marketing = await loginAgent(ctx, await createUser(ctx, ["MARKETING"]));
    const masked = await marketing.get(`/customers/${body.id}`).expect(200);
    expect(masked.body.email).not.toBe("gizli@ornek.com");
    expect(masked.body.email).toContain("***");
  });

  it("e-posta hash'iyle arar", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const uniq = `bul-${Date.now()}@ornek.com`;
    await sales.post("/customers").send({ ...sample, email: uniq }).expect(201);
    const res = await sales.get(`/customers?q=${encodeURIComponent(uniq)}`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fullName).toBe(sample.fullName);
  });

  it("rıza geri çekilince zaman damgası temizlenir, kayıt tutulur", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const { body } = await sales.post("/customers").send({ ...sample, email: `r-${Date.now()}@x.com`, marketingConsent: true }).expect(201);
    await sales.post(`/customers/${body.id}/consent`).send({ purpose: "MARKETING", granted: false, channel: "PHONE" }).expect(201);
    const c = await ctx.prisma.customer.findUniqueOrThrow({ where: { id: body.id } });
    expect(c.marketingConsentAt).toBeNull();
    const records = await ctx.prisma.consentRecord.findMany({ where: { customerId: body.id, purpose: "MARKETING" } });
    expect(records.length).toBeGreaterThanOrEqual(2); // ver + geri çek
  });

  it("360 görünümü sayı ve rıza döndürür", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    const { body } = await sales.post("/customers").send({ ...sample, email: `360-${Date.now()}@x.com` }).expect(201);
    const v = await sales.get(`/customers/${body.id}/360`).expect(200);
    expect(v.body.counts).toMatchObject({ orders: 0, invoices: 0 });
    expect(Array.isArray(v.body.consents)).toBe(true);
  });

  it("kurumsal müşteride VKN/vergi dairesi zorunlu", async () => {
    const sales = await loginAgent(ctx, await createUser(ctx, ["SALES"]));
    await sales.post("/customers").send({ type: "CORPORATE", fullName: "ACME A.Ş." }).expect(400);
  });

  it("yetkisiz kullanıcı müşteri oluşturamaz", async () => {
    const marketing = await loginAgent(ctx, await createUser(ctx, ["MARKETING"]));
    await marketing.post("/customers").send(sample).expect(403);
  });
});
