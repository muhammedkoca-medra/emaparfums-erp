import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
let accountId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  accountId = (await ctx.prisma.socialAccount.create({ data: { platform: "INSTAGRAM", handle: `@e2e-${Math.random().toString(36).slice(2, 7)}` } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("içerik stüdyosu (F4-10, ICR)", () => {
  it("brif → metin üretir ve uyumu kontrol eder", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const brief = (await admin.post("/content/briefs").send({ kind: "SOCIAL_POST", tone: "gizemli", channels: ["INSTAGRAM"], keywords: ["amber", "vanilya"] }).expect(201)).body;
    const gen = await admin.post(`/content/briefs/${brief.id}/generate`).expect(201);
    expect(gen.body.caption).toContain("#amber");
    expect(gen.body.compliant).toBe(true);
  });

  it("uyum kontrolü tıbbi iddiayı yakalar", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const r = await admin.post("/content/compliance-check").send({ text: "Bu parfüm hastalıkları tedavi eder" }).expect(201);
    expect(r.body.compliant).toBe(false);
    expect(r.body.violations.length).toBeGreaterThan(0);
  });
});

describe("sosyal medya (F4-09, SOS)", () => {
  it("gönderi taslak → onaya gönder → onayla+yayınla (mock) → PUBLISHED + externalId", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const post = (await admin.post("/social/posts").send({ accountId, caption: "Zarif bir imza koku #amber" }).expect(201)).body;
    await admin.post(`/social/posts/${post.id}/submit`).expect(201);
    const pub = await admin.post(`/social/posts/${post.id}/approve`).send({ publishNow: true }).expect(201);
    expect(pub.body.status).toBe("PUBLISHED");
    expect(pub.body.externalId).toMatch(/^instagram_/);
  });

  it("uyum ihlali olan gönderi yayınlanamaz (ICR-05)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const post = (await admin.post("/social/posts").send({ accountId, caption: "Bu koku kanseri tedavi eder" }).expect(201)).body;
    await admin.post(`/social/posts/${post.id}/submit`).expect(201);
    await admin.post(`/social/posts/${post.id}/approve`).send({ publishNow: true }).expect(400);
  });

  it("metrikler çekilir ve UTM ile gelir atfedilir (SOS-06)", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    // UTM kampanyalı bir sipariş
    const channel = await ctx.prisma.salesChannel.upsert({ where: { code: "WEB" }, update: {}, create: { code: "WEB", name: "Web", type: "WEBSITE" } });
    const customer = await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "M" } });
    const camp = `KAMP-${Math.random().toString(36).slice(2, 7)}`;
    await ctx.prisma.salesOrder.create({ data: { number: `SO-${Math.random().toString(36).slice(2, 8)}`, channelId: channel.id, customerId: customer.id, status: "CONFIRMED", netTotal: "100", otvTotal: "0", kdvTotal: "0", grandTotal: "120", utmCampaign: camp } });
    const post = (await admin.post("/social/posts").send({ accountId, caption: "Kampanya #amber", utmCampaign: camp }).expect(201)).body;
    await admin.post(`/social/posts/${post.id}/submit`).expect(201);
    await admin.post(`/social/posts/${post.id}/approve`).send({ publishNow: true }).expect(201);
    const m = await admin.post(`/social/posts/${post.id}/metrics`).expect(201);
    expect(m.body.reach).toBeGreaterThan(0);
    expect(m.body.attributedRevenue).toBe(120);
  });
});
