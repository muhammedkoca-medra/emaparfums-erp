import { describe, expect, it } from "vitest";
import { NOTE_FAMILIES } from "./catalog.js";
import { noteFromEnglish, noteFromTurkish, SCENT_NOTES } from "./scent-notes.js";

describe("nota sözlüğü", () => {
  it("Türkçe ve İngilizce adlar benzersiz; aileler katalog şemasıyla uyumlu", () => {
    const tr = SCENT_NOTES.map((n) => n.tr.toLocaleLowerCase("tr-TR"));
    const en = SCENT_NOTES.map((n) => n.en.toLowerCase());
    expect(new Set(tr).size).toBe(tr.length);
    expect(new Set(en).size).toBe(en.length);
    for (const n of SCENT_NOTES) expect(NOTE_FAMILIES).toContain(n.family);
  });
  it("karışmaya açık terimler doğru eşlenir", () => {
    expect(noteFromEnglish("Clove")?.tr).toBe("Karanfil");
    expect(noteFromEnglish("Carnation")?.tr).toBe("Karanfil çiçeği");
    expect(noteFromEnglish("olibanum (frankincense)")?.tr).toBe("Günlük");
    expect(noteFromEnglish("Incense")?.tr).toBe("Tütsü");
    expect(noteFromEnglish("Tuberose")?.tr).toBe("Sümbülteber");
    expect(noteFromEnglish("Lime")?.tr).toBe("Misket limonu");
    expect(noteFromEnglish("Bilinmeyen nota")).toBeNull();
    expect(noteFromTurkish("İRİS")?.en).toBe("Iris");
  });
});
