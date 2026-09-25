import { describe, expect, it } from "vitest";
import { fromGross, fromNet, lineFromGrossUnit, sumBreakdowns } from "./tax";

// Testlerdeki oranlar ÖRNEKTİR; gerçek oranlar TaxRule tablosundan gelir.
const PERFUME = { otvRate: "0.20", kdvRate: "0.20" };

describe("tax", () => {
  it("prototipteki e-Arşiv örneğini üretir (2 × ₺1.290)", () => {
    const b = lineFromGrossUnit("1290", 2, PERFUME);
    expect(b.net.toFixed(2)).toBe("1791.67");
    expect(b.otv.toFixed(2)).toBe("358.33");
    expect(b.kdvBase.toFixed(2)).toBe("2150.00");
    expect(b.kdv.toFixed(2)).toBe("430.00");
    expect(b.gross.toFixed(2)).toBe("2580.00");
  });

  it("parçalar her zaman brüte eşittir", () => {
    for (const g of ["0.01", "1", "99.99", "1290", "3140", "48000", "123456.78"]) {
      const b = fromGross(g, PERFUME);
      expect(b.net.plus(b.otv).plus(b.kdv).toFixed(2)).toBe(b.gross.toFixed(2));
    }
  });

  it("ÖTV'siz kalem (ör. kolonya kategorisi) yalnız KDV ayırır", () => {
    const b = fromGross("120", { otvRate: 0, kdvRate: "0.20" });
    expect(b.otv.toFixed(2)).toBe("0.00");
    expect(b.net.toFixed(2)).toBe("100.00");
  });

  it("istisnalı satış (ihracat) vergisizdir", () => {
    const b = fromGross("900", { otvRate: 0, kdvRate: 0 });
    expect(b.net.toFixed(2)).toBe("900.00");
  });

  it("netten brüte ve geri tutarlıdır", () => {
    const up = fromNet("895.83", PERFUME);
    const down = fromGross(up.gross, PERFUME);
    expect(down.net.toFixed(2)).toBe("895.83");
  });

  it("belge toplamı satırların toplamıdır", () => {
    const t = sumBreakdowns([fromGross("1290", PERFUME), fromGross("1850", PERFUME)]);
    expect(t.gross.toFixed(2)).toBe("3140.00");
  });

  it("geçersiz adedi reddeder", () => {
    expect(() => lineFromGrossUnit("10", 0, PERFUME)).toThrow();
  });
});
