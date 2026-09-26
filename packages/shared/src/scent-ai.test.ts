import { describe, expect, it } from "vitest";
import { buildAccordVector, cosineSimilarity } from "./scent-ai.js";

describe("koku vektörü ve benzerlik (F5-01/02)", () => {
  it("akor skorlarını 0–1 vektöre çevirir", () => {
    const v = buildAccordVector([{ accord: "amber", score: 80 }, { accord: "woody", score: 40 }]);
    expect(v[0]).toBeCloseTo(0.8); // amber ilk boyut
    expect(v[1]).toBeCloseTo(0.4); // woody ikinci
    expect(v[2]).toBe(0); // floral yok
  });

  it("kosinüs benzerliği aynıda 1, dik vektörde 0", () => {
    const a = buildAccordVector([{ accord: "amber", score: 100 }]);
    const b = buildAccordVector([{ accord: "amber", score: 50 }]);
    const c = buildAccordVector([{ accord: "floral", score: 100 }]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    expect(cosineSimilarity(a, c)).toBe(0);
  });
});
