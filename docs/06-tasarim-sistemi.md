# 06 · Tasarım sistemi

**Tıklanabilir prototip:** https://claude.ai/artifact/VXDyZb6ENLQzDXjfDEMEnm

Prototipte 17 masaüstü ekranı ve 4 mobil ekran var. Bağlantı özeldir; ekip üyelerinin açabilmesi için sayfanın Paylaş menüsünden paylaşılması gerekir. Ekran numaraları modül şartnamelerindeki "Prototip ekranı" alanıyla eşleşir.

## Token'lar

```css
:root {
  /* Zemin ve yüzey */
  --ink: #1C1815;          /* kenar menü, koyu kartlar, birincil buton */
  --ink-2: #2A241F;        /* koyu kart içi */
  --ground: #F6F2EB;       /* sayfa zemini (fildişi) */
  --surface: #FFFFFF;      /* kart */
  --surface-soft: #FAF7F2;
  --line: #E6DED2;
  --line-soft: #F0EAE0;

  /* Metin */
  --text: #221D18;
  --text-2: #4A423B;
  --muted: #6B6259;        /* beyaz üzerinde 4.5:1 üstü */
  --on-ink: #F6EFE4;
  --on-ink-muted: #A39888;

  /* Vurgu */
  --gold: #E4C89A;         /* aktif menü, koyu zemin vurgusu */
  --gold-2: #B8864B;       /* çubuklar, grafik çizgisi */
  --gold-text: #85602C;    /* altın metin, bağlantı */
  --plum: #6D2E46;         /* üretim / maserasyon vurgusu */

  /* Durum rozetleri: zemin / metin */
  --ok-bg: #E3EDE5;   --ok: #2F5A3C;
  --warn-bg: #F6E7D3; --warn: #8A4B12;
  --bad-bg: #F4DEDB;  --bad: #8E2A23;
  --info-bg: #E4E6F1; --info: #353C74;
  --neu-bg: #EFE9DF;  --neu: #5A5048;
  --plum-bg: #F0E1E8;

  /* Ölçü */
  --radius-card: 16px;
  --radius-control: 9px;
  --radius-pill: 999px;
  --space: 4px;            /* 4'ün katları: 8, 12, 16, 20, 24, 32 */
}
```

## Tipografi
- **Başlık:** Fraunces 600. Sayfa başlığı 26 px, kart başlığı 19 px, KPI değeri 28–32 px (`font-variant-numeric: tabular-nums`).
- **Gövde:** Manrope 400–700. Gövde 13–14 px, tablo 12,5 px.
- **Etiket (eyebrow):** 11 px, büyük harf, 0,12 em aralık, 700.

## Düzen
- **Masaüstü:** 1440 px genişlikte kenar menü 248 px, üst bar 76 px, içerik dolgusu 22/32 px.
- **Izgara:** 4 sütunlu KPI satırı; ana içerik `1fr + 320–380 px` yan panel.
- **Mobil depo:** 390 px genişlik, koyu başlık, alt sekme çubuğu (4 sekme), dokunma alanları ≥ 48 px.

## Bileşenler
Kenar menü (gruplu, rozetli), üst bar, KPI kartı, veri tablosu, durum rozeti, ilerleme çubuğu, adım hattı (aşamalar), zaman çizelgesi, kanban kolonu, yığılmış çubuk (fiyat anatomisi), radar grafiği, koyu "AI öneri" kartı, uyarı şeridi (warn-bg), segment düğmeleri, yetki matrisi hücresi.

## İlkeler
- **Her ekranın başında KPI'lar:** Yanlarında "ne yapmalıyım?" sorusunun cevabı (öneri kartı veya uyarı) bulunur.
- **Renk tek başına anlam taşımaz:** Rozetlerde metin, ilerlemede sayı vardır.
- **Erişilebilirlik:**
  - Tüm etkileşimli öğeler gerçek `button`/`a`/`input`.
  - İkon düğmelerinde `aria-label`.
  - Metin kontrastı ≥ 4.5:1.
- **Emoji yok:** İkonlar çizgi (stroke) SVG'dir.
- **AI çıktıları:** Her zaman "öneri", "tahmin" veya "taslak" olarak etiketlenir ve onay adımı içerir.
