import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE_TEMPLATE,
  gramsForPercents,
  gramsToUom,
  isFullRecipe,
  mlForGrams,
  percentsForGrams,
  recipeBomQty,
  recipeTemplateSchema,
  totalGramsFor,
} from "./recipe.js";

const PCTS = ["23", "72.5", "4", "0.5"]; // esans, etil alkol %96,6, saf su, gliserin

describe("kütlesel reçete · yüzdeden gram", () => {
  it("470 mL · 0,854 g/mL → toplam 401,38 g", () => {
    expect(totalGramsFor("470", "0.854")).toBe("401.38");
  });

  it("bileşen gramları yüzdeden; toplam tam olarak korunur (fark en büyük paya)", () => {
    const g = gramsForPercents("401.38", PCTS);
    expect(g[0]).toBe("92.32"); // esans
    expect(g[2]).toBe("16.06"); // saf su (16,0552 → yarım yukarı)
    expect(g[3]).toBe("2.01"); // gliserin
    expect(g[1]).toBe("290.99"); // alkol: kalan → toplam 401,38
    expect(g.reduce((s, x) => s + Number(x), 0).toFixed(2)).toBe("401.38");
  });

  it("yüzdeler %100 değilse dengeleme yapılmaz, her satır kendi payı", () => {
    expect(gramsForPercents("100", ["30", "60"])).toEqual(["30.00", "60.00"]);
    expect(isFullRecipe(["30", "60"])).toBe(false);
    expect(isFullRecipe(PCTS)).toBe(true);
  });
});

describe("kütlesel reçete · gramdan yüzde", () => {
  it("gram düzeltilince toplam ve yüzdeler yeniden hesaplanır", () => {
    const { totalGr, pcts } = percentsForGrams(["100", "291", "16.05", "2.01"]);
    expect(totalGr).toBe("409.06");
    expect(pcts[0]).toBe("24.4463"); // 100 / 409,06
    expect(isFullRecipe(pcts)).toBe(true);
  });

  it("hacim = toplam gram ÷ yoğunluk", () => {
    expect(mlForGrams("401.38", "0.854")).toBe("470.00");
  });

  it("toplam sıfırsa yüzde 0", () => {
    expect(percentsForGrams(["0", "0"])).toEqual({ totalGr: "0.00", pcts: ["0", "0"] });
  });
});

describe("kütlesel reçete · stok birimi", () => {
  it("gram KG'a ve G'a çevrilir", () => {
    expect(gramsToUom("92.32", "KG")).toBe("0.0923");
    expect(gramsToUom("92.32", "G")).toBe("92.3200");
  });

  it("kurulum reçetesi (1.000 adet × 50 mL, %23 esans) → 9,821 kg", () => {
    expect(recipeBomQty(50, "0.854", "23", "KG", 1000)).toBe("9.8210");
  });

  it("varsayılan şablon geçerli ve %100", () => {
    expect(recipeTemplateSchema.safeParse(DEFAULT_RECIPE_TEMPLATE).success).toBe(true);
    expect(recipeTemplateSchema.safeParse({ densityGPerMl: "0.854", lines: [{ role: "ESSENCE", pct: "50" }] }).success).toBe(false);
  });
});
