import { describe, expect, it } from "vitest";
import { extractOrderTokens, settlementExpected } from "./payment.js";

describe("hakediş neti (ODM-06)", () => {
  it("beklenen = satış − (komisyon + iade + kargo + ceza)", () => {
    expect(
      settlementExpected([
        { kind: "SALE", amount: "1000.00" },
        { kind: "COMMISSION", amount: "120.00" },
        { kind: "SHIPPING", amount: "30.00" },
        { kind: "RETURN", amount: "50.00" },
      ]),
    ).toBe("800");
  });
});

describe("banka açıklamasından sipariş no (ODM-07)", () => {
  it("olası sipariş tokenlarını çıkarır", () => {
    const t = extractOrderTokens("EFT WEB-2026-0042 Ahmet odeme");
    expect(t).toContain("WEB-2026-0042");
  });
  it("kısa kelimeleri atar", () => {
    expect(extractOrderTokens("abc de")).toEqual([]);
  });
});
