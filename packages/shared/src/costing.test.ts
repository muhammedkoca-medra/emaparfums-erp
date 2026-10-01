import { describe, expect, it } from "vitest";
import { costVariance, hourlyCost, productionHours, simulateUnitCost, unitCost } from "./costing.js";

describe("maliyet yardımcıları", () => {
  it("unitCost = toplam / iyi adet (MLY-03)", () => {
    expect(unitCost("318000", 1000)).toBe("318");
    expect(unitCost("100", 0)).toBe("100");
  });

  it("hourlyCost = saat × oran", () => {
    expect(hourlyCost("2", "120")).toBe("240");
  });

  it("productionHours aşama sürelerini toplar", () => {
    const s = new Date("2026-01-01T09:00:00Z");
    const e = new Date("2026-01-01T11:00:00Z");
    expect(productionHours([{ startedAt: s, endedAt: e }])).toBe("2");
  });

  it("costVariance sapmayı ve eşik aşımını hesaplar (MLY-04)", () => {
    const v = costVariance([{ component: "ESSENCE", standard: "305", actual: "318" }], 3);
    expect(v[0]).toMatchObject({ variance: "13", warn: true });
    expect(Number(v[0]!.variancePct)).toBeCloseTo(4.26, 1);
  });

  it("simulateUnitCost esans/kur/parti çarpanlarını uygular (MLY-05)", () => {
    const r = simulateUnitCost({
      baseComponents: [
        { component: "ESSENCE", unit: "100" },
        { component: "DIRECT_LABOR", unit: "20" },
      ],
      essenceFactor: 1.2,
      fxFactor: 1.1,
      batchSizeFactor: 2,
      avgNetSale: "200",
    });
    // ESSENCE 100×1.2×1.1 = 132 ; DIRECT_LABOR 20/2 = 10 ; toplam 142
    expect(r.unitCost).toBe("142");
    expect(r.margin).toBe("58");
  });
});
