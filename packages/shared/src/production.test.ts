import { describe, expect, it } from "vitest";
import {
  batchOutputSchema,
  costComponentForItem,
  effectiveUnits,
  essencePct,
  expectedUnits,
  fillingBalance,
  formulaCodeForSku,
  intervalsOverlap,
  liquidCostPerMl,
  productionSetupSchema,
  scaleRequirement,
  setupLiquidQty,
  splitByConcentration,
} from "./production.js";

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

describe("intervalsOverlap (URT-07)", () => {
  const d = (h: number) => new Date(2026, 0, 1, h);
  it("çakışanı bulur, bitişik olanı çakışma saymaz", () => {
    expect(intervalsOverlap(d(9), d(12), d(11), d(13))).toBe(true);
    expect(intervalsOverlap(d(9), d(12), d(12), d(14))).toBe(false); // bitişik
    expect(intervalsOverlap(d(9), d(12), d(13), d(14))).toBe(false); // ayrık
  });
});

describe("hacimle parti (ml)", () => {
  it("toplam hacmi konsantrasyona göre böler, toplam korunur", () => {
    expect(splitByConcentration("10000", "20")).toEqual({ essenceMl: "2000.00", baseMl: "8000.00" });
    // 1.234,56 ml · %22,5 = 277,776 → 277,78; baz kalan (toplam bozulmaz)
    expect(splitByConcentration("1234.56", "22.5")).toEqual({ essenceMl: "277.78", baseMl: "956.78" });
  });

  it("beklenen şişe adedi aşağı yuvarlanır, etkin adet kesirli kalır", () => {
    expect(expectedUnits("10000", 50)).toBe(200);
    expect(expectedUnits("10020", 50)).toBe(200);
    expect(effectiveUnits("10025", 50)).toBe("200.5");
  });

  it("ölçekleme kesirli etkin adetle çalışır (sıvı eksik gösterilmez)", () => {
    // 1.000 adet için 10 L esans; 200,5 etkin adet → 2,005 L
    expect(scaleRequirement("10", "0", effectiveUnits("10025", 50), 1000)).toBe("2.005");
  });
});

describe("dolum mutabakatı ve tester maliyeti", () => {
  it("dağıtılan hacmi ve farkı hesaplar", () => {
    expect(fillingBalance({ plannedMl: "10000", volumeMl: 50, producedQty: 190, testerMl: "300", scrapMl: "150" })).toEqual({
      distributedMl: "9950.00",
      differenceMl: "50.00",
    });
  });

  it("ml başına sıvı maliyeti; hacim yoksa null", () => {
    expect(liquidCostPerMl("2500", "10000")).toBe("0.25");
    expect(liquidCostPerMl("2500", null)).toBeNull();
    expect(liquidCostPerMl("2500", "0")).toBeNull();
  });

  it("çıktı şeması: stok adedi ya da tester hacminden biri zorunlu", () => {
    expect(batchOutputSchema.safeParse({ producedQty: 0, testerMl: "0" }).success).toBe(false);
    expect(batchOutputSchema.safeParse({ producedQty: 0, testerMl: "250" }).success).toBe(true);
    expect(batchOutputSchema.safeParse({ producedQty: 190 }).success).toBe(true);
  });
});

describe("hızlı üretim kurulumu", () => {
  it("reçete sıvı miktarını kalemin hacim biriminde hesaplar", () => {
    expect(setupLiquidQty(50, "20", "essence", "L")).toBe("10.0000");
    expect(setupLiquidQty(50, "20", "base", "L")).toBe("40.0000");
    expect(setupLiquidQty(50, "20", "essence", "ML")).toBe("10000.0000");
    expect(setupLiquidQty(30, "22.5", "essence", "L")).toBe("6.7500");
  });

  it("formül kodunu SKU'dan türetir", () => {
    expect(formulaCodeForSku("EMAK025")).toBe("F-EMAK025");
    expect(formulaCodeForSku("full-01")).toBe("F-FULL-01");
  });

  it("alkol / baz adlı hammaddeyi ALCOHOL_WATER sayar", () => {
    expect(costComponentForItem({ code: "BZ-PARFUM", type: "RAW_MATERIAL", name: "Parfüm bazı (alkol)" })).toBe("ALCOHOL_WATER");
    expect(costComponentForItem({ code: "ES-EMAK025", type: "RAW_MATERIAL", name: "Esans · Bombshell" })).toBe("ESSENCE");
  });

  it("konsantrasyon 0 ile 100 arasında olmalı", () => {
    const base = { essence: { itemId: "a" }, base: { itemId: "b" } };
    expect(productionSetupSchema.safeParse({ ...base, concentrationPct: "20" }).success).toBe(true);
    expect(productionSetupSchema.safeParse({ ...base, concentrationPct: "0" }).success).toBe(false);
    expect(productionSetupSchema.safeParse({ ...base, concentrationPct: "100" }).success).toBe(false);
  });
});
