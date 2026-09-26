import { describe, expect, it } from "vitest";
import { earnedPoints, selectTier } from "./loyalty.js";

const tiers = [
  { code: "DISCOVERY", minPoints: 0 },
  { code: "COLLECTOR", minPoints: 3000 },
  { code: "ATELIER", minPoints: 10000 },
];

describe("sadakat (SDK-01/02)", () => {
  it("earnedPoints = net × oran (aşağı yuvarlanır)", () => {
    expect(earnedPoints("1000", "0.05")).toBe(50);
    expect(earnedPoints("999", "0.05")).toBe(49); // 49.95 → 49
  });
  it("selectTier puana göre en yüksek uygun seviyeyi verir", () => {
    expect(selectTier(0, tiers)?.code).toBe("DISCOVERY");
    expect(selectTier(3500, tiers)?.code).toBe("COLLECTOR");
    expect(selectTier(20000, tiers)?.code).toBe("ATELIER");
  });
});
