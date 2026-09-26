import { describe, expect, it } from "vitest";
import { costComponentForItem, essencePct, scaleRequirement } from "./production.js";

describe("scaleRequirement (URT-02)", () => {
  it("adet başına ölçekler (fire yok)", () => {
    expect(scaleRequirement("10", "0", 100, 1000)).toBe("1");
    expect(scaleRequirement("38.5", "0", 100, 1000)).toBe("3.85");
    expect(scaleRequirement("1000", "0", 100, 1000)).toBe("100");
  });

  it("fire payını ekler", () => {
    expect(scaleRequirement("10", "0.05", 100, 1000)).toBe("1.05");
  });

  it("4 haneye yukarı yuvarlar (malzeme eksik kalmasın)", () => {
    expect(scaleRequirement("1", "0", 1, 3)).toBe("0.3334");
    expect(scaleRequirement("1", "0", 3, 1000)).toBe("0.003");
  });

  it("batchSize sıfır olamaz", () => {
    expect(() => scaleRequirement("1", "0", 1, 0)).toThrow();
  });
});

describe("costComponentForItem", () => {
  it("alkol ve suyu ALCOHOL_WATER'a, diğer hammaddeyi ESSENCE'a eşler", () => {
    expect(costComponentForItem({ code: "HM-0001", type: "RAW_MATERIAL", name: "Etil alkol" })).toBe("ALCOHOL_WATER");
    expect(costComponentForItem({ code: "HM-0005", type: "RAW_MATERIAL", name: "Distile su" })).toBe("ALCOHOL_WATER");
    expect(costComponentForItem({ code: "HM-0112", type: "RAW_MATERIAL", name: "Esans NA" })).toBe("ESSENCE");
  });

  it("ambalajı ada göre ayırır", () => {
    expect(costComponentForItem({ code: "AM-0510", type: "PACKAGING", name: "50 ml amber şişe" })).toBe("BOTTLE");
    expect(costComponentForItem({ code: "AM-0600", type: "PACKAGING", name: "Sprey pompa" })).toBe("PUMP_CAP");
    expect(costComponentForItem({ code: "AM-0700", type: "PACKAGING", name: "Karton kutu + etiket" })).toBe("BOX_LABEL");
  });
});

describe("essencePct", () => {
  it("esans oranını yüzde döndürür", () => {
    expect(essencePct(200, 800)).toBe(20);
    expect(essencePct(0, 0)).toBe(0);
  });
});
