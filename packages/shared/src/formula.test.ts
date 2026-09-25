import { describe, expect, it } from "vitest";
import { validateFormulaLines } from "./formula.js";

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
