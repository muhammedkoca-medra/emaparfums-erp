import { describe, expect, it } from "vitest";
import { checkContentCompliance, generateCaption } from "./content.js";

describe("içerik uyum kontrolü (ICR-05)", () => {
  it("tıbbi/mutlak iddiaları yakalar", () => {
    expect(checkContentCompliance("Bu parfüm cildi tedavi eder ve şifa verir")).toEqual(expect.arrayContaining(["tedavi", "şifa"]));
  });
  it("uygun metinde ihlal yok", () => {
    expect(checkContentCompliance("Zarif, kalıcı bir imza koku")).toEqual([]);
  });
});

describe("metin üretimi (ICR-02, mock)", () => {
  it("ürün adı ve anahtar kelimeleri içerir", () => {
    const cap = generateCaption({ productName: "Noir Ambré", tone: "gizemli", keywords: ["amber", "vanilya"], kind: "SOCIAL_POST" });
    expect(cap).toContain("Noir Ambré");
    expect(cap).toContain("#amber");
  });
});
