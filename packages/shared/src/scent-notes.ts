/**
 * Türkçe nota sözlüğü — nota adlarının TEK kaynağı (docs/03-moduller/koku-ai.md §Veri kaynakları).
 * Serbest çeviri yapılmaz: referans kaynaklardaki (ör. Fragrantica) İngilizce nota adı burada
 * eşlenir. Sözlükte olmayan nota eklenirken İngilizce karşılığı ve ailesi birlikte yazılır.
 *
 * Karışmaya açık terimler ayrı tutulur:
 *  - Clove = Karanfil (baharat)          · Carnation = Karanfil çiçeği
 *  - Frankincense/Olibanum = Günlük      · Incense = Tütsü
 *  - Amber (akor) = Amber                · Ambergris = Ambergris
 *  - Iris (çiçek) = İris                 · Orris root = İris kökü
 *  - Lime = Misket limonu                · Lemon = Limon
 *  - Benzoin = Aselbent (benzoin)        · Tuberose = Sümbülteber
 */
export type NoteFamily = "citrus" | "floral" | "woody" | "amber" | "spicy" | "gourmand" | "musky" | "fresh";

export interface ScentNoteEntry {
  tr: string;
  en: string;
  family: NoteFamily;
}

export const SCENT_NOTES: readonly ScentNoteEntry[] = [
  // Narenciye
  { tr: "Bergamot", en: "Bergamot", family: "citrus" },
  { tr: "Limon", en: "Lemon", family: "citrus" },
  { tr: "Misket limonu", en: "Lime", family: "citrus" },
  { tr: "Portakal", en: "Orange", family: "citrus" },
  { tr: "Acı portakal", en: "Bitter Orange", family: "citrus" },
  { tr: "Mandalina", en: "Mandarin Orange", family: "citrus" },
  { tr: "Greyfurt", en: "Grapefruit", family: "citrus" },
  { tr: "Yuzu", en: "Yuzu", family: "citrus" },
  { tr: "Neroli", en: "Neroli", family: "citrus" },
  { tr: "Petitgrain", en: "Petitgrain", family: "citrus" },
  // Çiçeksi
  { tr: "Gül", en: "Rose", family: "floral" },
  { tr: "Şam gülü", en: "Damask Rose", family: "floral" },
  { tr: "Gül absolü", en: "Rose Absolute", family: "floral" },
  { tr: "Yasemin", en: "Jasmine", family: "floral" },
  { tr: "Sümbülteber", en: "Tuberose", family: "floral" },
  { tr: "İris", en: "Iris", family: "floral" },
  { tr: "İris kökü", en: "Orris Root", family: "floral" },
  { tr: "Menekşe", en: "Violet", family: "floral" },
  { tr: "Müge", en: "Lily-of-the-Valley", family: "floral" },
  { tr: "Şakayık", en: "Peony", family: "floral" },
  { tr: "Manolya", en: "Magnolia", family: "floral" },
  { tr: "Ylang-ylang", en: "Ylang-Ylang", family: "floral" },
  { tr: "Portakal çiçeği", en: "Orange Blossom", family: "floral" },
  { tr: "Heliotrop", en: "Heliotrope", family: "floral" },
  { tr: "Frezya", en: "Freesia", family: "floral" },
  { tr: "Gardenya", en: "Gardenia", family: "floral" },
  { tr: "Mimoza", en: "Mimosa", family: "floral" },
  { tr: "Sardunya", en: "Geranium", family: "floral" },
  { tr: "Karanfil çiçeği", en: "Carnation", family: "floral" },
  { tr: "Nilüfer", en: "Water Lily", family: "floral" },
  { tr: "Beyaz çiçekler", en: "White Flowers", family: "floral" },
  // Odunsu
  { tr: "Sandal ağacı", en: "Sandalwood", family: "woody" },
  { tr: "Sedir", en: "Cedar", family: "woody" },
  { tr: "Vetiver", en: "Vetiver", family: "woody" },
  { tr: "Paçuli", en: "Patchouli", family: "woody" },
  { tr: "Oud", en: "Agarwood (Oud)", family: "woody" },
  { tr: "Gayak ağacı", en: "Guaiac Wood", family: "woody" },
  { tr: "Kaşmir ağacı", en: "Cashmere Wood", family: "woody" },
  { tr: "Huş ağacı", en: "Birch", family: "woody" },
  { tr: "Servi", en: "Cypress", family: "woody" },
  { tr: "Meşe yosunu", en: "Oakmoss", family: "woody" },
  // Amber ve reçineler
  { tr: "Amber", en: "Amber", family: "amber" },
  { tr: "Ambergris", en: "Ambergris", family: "amber" },
  { tr: "Labdanum", en: "Labdanum", family: "amber" },
  { tr: "Aselbent (benzoin)", en: "Benzoin", family: "amber" },
  { tr: "Günlük", en: "Olibanum (Frankincense)", family: "amber" },
  { tr: "Tütsü", en: "Incense", family: "amber" },
  { tr: "Mür", en: "Myrrh", family: "amber" },
  { tr: "Tolu balsamı", en: "Tolu Balsam", family: "amber" },
  { tr: "Opoponaks", en: "Opoponax", family: "amber" },
  { tr: "Deri", en: "Leather", family: "amber" },
  { tr: "Tütün", en: "Tobacco", family: "amber" },
  // Baharatlı
  { tr: "Pembe biber", en: "Pink Pepper", family: "spicy" },
  { tr: "Karabiber", en: "Black Pepper", family: "spicy" },
  { tr: "Kakule", en: "Cardamom", family: "spicy" },
  { tr: "Tarçın", en: "Cinnamon", family: "spicy" },
  { tr: "Karanfil", en: "Clove", family: "spicy" },
  { tr: "Muskat", en: "Nutmeg", family: "spicy" },
  { tr: "Safran", en: "Saffron", family: "spicy" },
  { tr: "Zencefil", en: "Ginger", family: "spicy" },
  { tr: "Kimyon", en: "Cumin", family: "spicy" },
  // Gurme
  { tr: "Vanilya", en: "Vanilla", family: "gourmand" },
  { tr: "Tonka fasulyesi", en: "Tonka Bean", family: "gourmand" },
  { tr: "Karamel", en: "Caramel", family: "gourmand" },
  { tr: "Bal", en: "Honey", family: "gourmand" },
  { tr: "Kakao", en: "Cacao", family: "gourmand" },
  { tr: "Kahve", en: "Coffee", family: "gourmand" },
  { tr: "Badem", en: "Almond", family: "gourmand" },
  { tr: "Pralin", en: "Praline", family: "gourmand" },
  // Misk ve animalik
  { tr: "Misk", en: "Musk", family: "musky" },
  { tr: "Beyaz misk", en: "White Musk", family: "musky" },
  { tr: "Süet", en: "Suede", family: "musky" },
  // Taze, aromatik, meyveli
  { tr: "Lavanta", en: "Lavender", family: "fresh" },
  { tr: "Nane", en: "Mint", family: "fresh" },
  { tr: "Fesleğen", en: "Basil", family: "fresh" },
  { tr: "Biberiye", en: "Rosemary", family: "fresh" },
  { tr: "Adaçayı", en: "Sage", family: "fresh" },
  { tr: "Misk adaçayı", en: "Clary Sage", family: "fresh" },
  { tr: "Aldehitler", en: "Aldehydes", family: "fresh" },
  { tr: "Deniz notaları", en: "Sea Notes", family: "fresh" },
  { tr: "Yeşil çay", en: "Green Tea", family: "fresh" },
  { tr: "Menekşe yaprağı", en: "Violet Leaf", family: "fresh" },
  { tr: "İncir", en: "Fig", family: "fresh" },
  { tr: "Elma", en: "Apple", family: "fresh" },
  { tr: "Armut", en: "Pear", family: "fresh" },
  { tr: "Frenk üzümü", en: "Black Currant", family: "fresh" },
  { tr: "Ahududu", en: "Raspberry", family: "fresh" },
  { tr: "Şeftali", en: "Peach", family: "fresh" },
  { tr: "Hindistan cevizi", en: "Coconut", family: "fresh" },
];
const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
const byEn = new Map(SCENT_NOTES.map((n) => [norm(n.en), n]));
const byTr = new Map(SCENT_NOTES.map((n) => [n.tr.toLocaleLowerCase("tr-TR"), n]));

/** Referans kaynaktaki İngilizce nota adını sözlükteki Türkçe karşılığına çevirir (yoksa null). */
export const noteFromEnglish = (en: string) => byEn.get(norm(en)) ?? null;
export const noteFromTurkish = (tr: string) => byTr.get(tr.trim().toLocaleLowerCase("tr-TR")) ?? null;
