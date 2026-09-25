import { describe, expect, it } from "vitest";
import { maskDeep, maskEmail, maskPhone, maskTaxNo } from "./mask.js";

describe("mask", () => {
  it("telefon · docs/07 biçimi", () => {
    expect(maskPhone("05321234512")).toBe("05** *** **12");
  });
  it("TCKN/VKN", () => {
    expect(maskTaxNo("12345678901")).toBe("12*******01");
    expect(maskTaxNo("1234567890")).toBe("12******90");
  });
  it("e-posta", () => {
    expect(maskEmail("ayse.yilmaz@example.com")).toBe("a***@e***.com");
  });
  it("derin maskeleme: gizli anahtarlar, kişisel alanlar, kart numarası", () => {
    const out = maskDeep({
      company: "Atelier",
      password: "çok-gizli",
      headers: { Authorization: "Bearer abc" },
      customer: { phone: "05321234512", tckn: "12345678901", email: "a@b.com" },
      note: "kart 4111 1111 1111 1111 ile ödendi",
      barcode: "8691234567890",
      list: [{ apiKey: "k" }],
    });
    expect(out).toEqual({
      company: "Atelier",
      password: "[gizli]",
      headers: { Authorization: "[gizli]" },
      customer: { phone: "05** *** **12", tckn: "12*******01", email: "a***@b***.com" },
      note: "kart [kart-gizli] ile ödendi",
      barcode: "8691234567890",
      list: [{ apiKey: "[gizli]" }],
    });
  });
});
