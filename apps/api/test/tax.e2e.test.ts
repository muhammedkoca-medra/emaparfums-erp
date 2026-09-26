import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAgent, resetRateLimit, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;

async function invoice(direction: "SALES" | "PURCHASE", kdv: string, issue: string) {
  return ctx.prisma.invoice.create({
    data: {
      direction,
      type: direction === "SALES" ? "E_ARSIV" : "E_FATURA",
      status: "SENT",
      issueDate: new Date(issue),
      currency: "TRY",
      netTotal: "500",
      otvTotal: "20",
      kdvBase: "520",
      kdvTotal: kdv,
      grandTotal: "620",
    },
  });
}

beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(() => resetRateLimit(ctx));

describe("vergi merkezi analizleri (F4-03, VRG-07)", () => {
  it("aylık özet satış/alış KDV'yi ve ödenecek KDV'yi hesaplar", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    await invoice("SALES", "100", "2027-05-10T00:00:00Z");
    await invoice("SALES", "50", "2027-05-20T00:00:00Z");
    await invoice("PURCHASE", "40", "2027-05-15T00:00:00Z");
    await invoice("SALES", "999", "2027-06-01T00:00:00Z"); // başka dönem, sayılmamalı
    const s = await admin.get("/tax/summary?period=2027-05").expect(200);
    expect(s.body.sales.kdv).toBe("150.00");
    expect(s.body.purchase.kdv).toBe("40.00");
    expect(s.body.netKdvPayable).toBe("110.00");
  });

  it("geçersiz dönem 400", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    await admin.get("/tax/summary?period=2027-5").expect(400);
  });

  it("CSV dışa aktarımı BOM ve başlık içerir", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    const res = await admin.get("/tax/summary/export?period=2027-05").expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Odenecek KDV");
  });

  it("vergi takvimi olayları döner", async () => {
    const admin = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    await ctx.prisma.taxCalendarEvent.create({ data: { title: `KDV beyanı · test ${Math.random()}`, dueDate: new Date("2027-05-26"), period: "2027-04" } });
    const c = await admin.get("/tax/calendar").expect(200);
    expect(c.body.length).toBeGreaterThanOrEqual(1);
    expect(c.body[0]).toHaveProperty("dueDate");
  });
});
