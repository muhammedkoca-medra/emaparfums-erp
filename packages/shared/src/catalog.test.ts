import { describe, expect, it } from "vitest";
import { barcodeSchema, gtipSchema, isValidEan13, itemCodeSchema } from "./catalog.js";

describe("katalog doğrulamaları", () => {
  it("EAN-13 kontrol hanesi", () => {
    expect(isValidEan13("8690000000005")).toBe(true);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
    expect(isValidEan13("123")).toBe(false);
    expect(barcodeSchema.safeParse("4006381333932").success).toBe(false);
  });
  it("GTİP biçimi", () => {
    expect(gtipSchema.safeParse("3303.00").success).toBe(true);
    expect(gtipSchema.safeParse("3303.00.90.00.00").success).toBe(true);
    expect(gtipSchema.safeParse("33.03").success).toBe(false);
  });
  it("kalem kodu büyük harfe çevrilir ve biçim denetlenir", () => {
    expect(itemCodeSchema.parse(" hm-0104 ")).toBe("HM-0104");
    expect(itemCodeSchema.safeParse("HM0104").success).toBe(false);
  });
});
