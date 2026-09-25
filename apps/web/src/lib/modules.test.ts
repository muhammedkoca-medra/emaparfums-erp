import { describe, expect, it } from "vitest";
import messages from "../../messages/tr.json";
import { ALL_ITEMS, findBySlug, visibleNav } from "./modules";

describe("menü", () => {
  it("her menü öğesinin Türkçe etiketi var", () => {
    const labels = messages.nav.modules as Record<string, string>;
    for (const item of ALL_ITEMS) expect(labels[item.key], item.key).toBeTruthy();
  });

  it("rota adları benzersiz", () => {
    const hrefs = ALL_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("yalnızca VIEW izni olan modüller görünür, boş grup gizlenir", () => {
    const nav = visibleNav(["dashboard:VIEW", "stock:VIEW", "stock:EDIT"]);
    expect(nav.map((g) => g.group)).toEqual(["general", "operations", "management"]);
    expect(nav.flatMap((g) => g.items.map((i) => i.key))).toEqual([
      "dashboard",
      "systemMap",
      "stock",
      "mobile",
    ]);
  });

  it("izin yoksa menü boş", () => {
    expect(visibleNav([])).toEqual([]);
  });

  it("slug ile modül bulunur", () => {
    expect(findBySlug("stok")?.key).toBe("stock");
    expect(findBySlug("yok")).toBeUndefined();
  });
});

describe("messages/tr.json", () => {
  it("anahtarlarda nokta yok (next-intl ad alanı ayırıcısı)", () => {
    const bad: string[] = [];
    const walk = (obj: Record<string, unknown>, p: string) => {
      for (const [k, v] of Object.entries(obj)) {
        if (k.includes(".")) bad.push(`${p}${k}`);
        if (v && typeof v === "object") walk(v as Record<string, unknown>, `${p}${k}/`);
      }
    };
    walk(messages, "");
    expect(bad).toEqual([]);
  });
});
