import { describe, expect, it } from "vitest";
import { checkIfraLimits, mustLabelAllergen, validateFormulaLines } from "./formula.js";

describe("formül satır doğrulaması", () => {
  it("toplam Decimal ile tam %100 olmalı (0.1 + 0.2 tuzağı yok)", () => {
    expect(
      validateFormulaLines([
        { itemId: "a", percentage: "33.3333" },
        { itemId: "b", percentage: "33.3333" },
        { itemId: "c", percentage: "33.3334" },
      ]),
    ).toEqual([]);
    expect(validateFormulaLines([{ itemId: "a", percentage: "99.9999" }])).toEqual([
      "Satır yüzdelerinin toplamı %100 olmalı (şu an %99.9999)",
    ]);
  });
  it("boş formül ve tekrar eden kalem reddedilir", () => {
    expect(validateFormulaLines([])).toEqual(["Formülde en az bir satır olmalı"]);
    expect(
      validateFormulaLines([
        { itemId: "a", percentage: "50" },
        { itemId: "a", percentage: "50" },
      ]),
    ).toEqual(["Aynı kalem formülde birden fazla kez yer alamaz"]);
  });
});

describe("checkIfraLimits (URT-09)", () => {
  const lines = [
    { itemId: "a", code: "HM-X", percentage: "10" },
    { itemId: "b", code: "HM-Y", percentage: "2" },
  ];
  it("son üründeki oran limiti aşarsa ihlal döner", () => {
    // HM-X son üründe %10 × 20/100 = %2 > %1 limit
    const v = checkIfraLimits(lines, "20", "4", { "HM-X": { "4": 1 } });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ code: "HM-X", finalPct: "2", limit: 1 });
  });
  it("limit altındaysa ihlal yok", () => {
    // HM-Y son üründe %2 × 20/100 = %0.4 < %1
    expect(checkIfraLimits(lines, "20", "4", { "HM-Y": { "4": 1 } })).toEqual([]);
  });
  it("kategori yoksa ya da limit tanımsızsa atlar", () => {
    expect(checkIfraLimits(lines, "20", null, { "HM-X": { "4": 0.1 } })).toEqual([]);
    expect(checkIfraLimits(lines, "20", "4", {})).toEqual([]);
  });
});

describe("mustLabelAllergen (KAL-07)", () => {
  it("eşik ve üstünde beyan zorunlu, altında değil", () => {
    expect(mustLabelAllergen("0.001", 0.001)).toBe(true);
    expect(mustLabelAllergen("0.5", 0.001)).toBe(true);
    expect(mustLabelAllergen("0.0005", 0.001)).toBe(false);
  });
});
