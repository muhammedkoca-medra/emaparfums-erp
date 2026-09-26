import { einvoiceWebhookSignature } from "@atelier/shared/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

const EINVOICE_SECRET = "dev-sandbox-einvoice-webhook-secret-change-me";

let ctx: TestContext;
let customerId: string;

async function invoice(status: "SENT" | "ERROR", opts: { ettn?: string | null; type?: "E_ARSIV" | "E_FATURA" } = {}) {
  return ctx.prisma.invoice.create({
    data: {
      direction: "SALES",
      type: opts.type ?? "E_ARSIV",
      status,
      issueDate: new Date(),
      customerId,
      currency: "TRY",
      number: status === "SENT" ? `EMA2026${Math.floor(Math.random() * 1e9)}`.slice(0, 16) : null,
      ettn: opts.ettn === undefined ? (status === "SENT" ? `ettn-${Math.random().toString(36).slice(2)}` : null) : opts.ettn,
      netTotal: "100",
      otvTotal: "20",
      kdvBase: "120",
      kdvTotal: "24",
      grandTotal: "144",
      lines: { create: [{ description: "Ürün", qty: "1", unitPrice: "100", netAmount: "100", otvRate: "0.2", otvAmount: "20", kdvRate: "0.2", kdvAmount: "24" }] },
    },
  });
}

beforeAll(async () => {
  ctx = await setupTestApp();
  customerId = (await ctx.prisma.customer.create({ data: { type: "INDIVIDUAL", fullName: "Fatura Müşteri" } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("fatura (F2-05/06, FTR)", () => {
  it("liste ve detay tutarları döndürür", async () => {
    const inv = await invoice("SENT");
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const list = await admin.get("/invoices?direction=SALES").expect(200);
    expect((list.body as { id: string }[]).some((r) => r.id === inv.id)).toBe(true);
    const detail = await admin.get(`/invoices/${inv.id}`).expect(200);
    expect(detail.body.grandTotal).toBe("144.00");
    expect(detail.body.lines).toHaveLength(1);
  });

  it("PDF döndürür (application/pdf)", async () => {
    const inv = await invoice("SENT");
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const res = await admin.get(`/invoices/${inv.id}/pdf`).expect(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body.length ?? res.text.length).toBeGreaterThan(50);
  });

  it("hatalı belge yeniden gönderilince SENT olur (FTR-04)", async () => {
    const inv = await invoice("ERROR", { ettn: null });
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const res = await admin.post(`/invoices/${inv.id}/retry`).send({}).expect(201);
    expect(res.body.status).toBe("SENT");
    const after = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.ettn).toBeTruthy();
  });

  it("webhook imzasız/yanlış imzalı isteği reddeder (401)", async () => {
    const inv = await invoice("SENT");
    const payload = { ettn: inv.ettn!, status: "ACCEPTED" as const };
    await ctx.http().post("/webhooks/einvoice").send(payload).expect(401);
    await ctx.http().post("/webhooks/einvoice").set("x-signature", "yanlis").send(payload).expect(401);
    // Durum değişmemeli.
    expect((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("SENT");
  });

  it("webhook geçerli imza ile ETTN'e göre durum günceller", async () => {
    const inv = await invoice("SENT");
    const payload = { ettn: inv.ettn!, status: "ACCEPTED" as const };
    const sig = einvoiceWebhookSignature(EINVOICE_SECRET, payload);
    await ctx.http().post("/webhooks/einvoice").set("x-signature", sig).send(payload).expect(201);
    expect((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("ACCEPTED");
  });

  it("iptal edilmiş belge webhook ile geri açılamaz", async () => {
    const inv = await invoice("SENT");
    await ctx.prisma.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
    const payload = { ettn: inv.ettn!, status: "ACCEPTED" as const };
    const sig = einvoiceWebhookSignature(EINVOICE_SECRET, payload);
    await ctx.http().post("/webhooks/einvoice").set("x-signature", sig).send(payload).expect(400);
    expect((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("CANCELLED");
  });

  it("iptal ve iade akışı", async () => {
    const inv = await invoice("SENT");
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const ret = await admin.post(`/invoices/${inv.id}/return`).send({}).expect(201);
    expect(ret.body.status).toBe("SENT");
    const returnInv = await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: ret.body.id } });
    expect(returnInv.type).toBe("RETURN");
    await admin.post(`/invoices/${inv.id}/cancel`).send({ reason: "müşteri vazgeçti" }).expect(201);
    expect((await ctx.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("CANCELLED");
  });

  it("invoicing:VIEW olmayan erişemez", async () => {
    const prod = await loginAgent(ctx, await createUser(ctx, ["PRODUCTION"]));
    await prod.get("/invoices").expect(403);
  });
});
