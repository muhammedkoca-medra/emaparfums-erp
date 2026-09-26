import { describe, expect, it } from "vitest";
import { addMonths, computeChurnRisk, periodLabel } from "./subscription.js";

describe("abonelik yardımcıları (SDK)", () => {
  it("addMonths ve periodLabel", () => {
    const d = new Date("2026-11-15T00:00:00Z");
    expect(periodLabel(addMonths(d, 1))).toBe("2026-12");
    expect(periodLabel(addMonths(d, 2))).toBe("2027-01");
  });

  it("computeChurnRisk (SDK-06): etkinlik + PAST_DUE + düşük puan", () => {
    expect(computeChurnRisk({ daysSinceLastActivity: 0, pastDue: false })).toBe(0);
    expect(computeChurnRisk({ daysSinceLastActivity: 90, pastDue: false })).toBeCloseTo(0.5);
    expect(computeChurnRisk({ daysSinceLastActivity: 90, pastDue: true, avgRating: 2 })).toBe(1);
  });
});
