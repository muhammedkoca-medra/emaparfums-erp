# İçerik stüdyosu (AI)

**Faz:** 4 · **Prototip ekranı:** 09 · **İzin modülü kodu:** `content`

## Amaç
Ürün verisinden marka sesine uygun metin, görsel ve video senaryosu üretir. Uyum kontrolünden geçen içerik sosyal takvime ve e-ticaret kanallarına gönderilir.

## Ekranlar
- **Brif:**
  - Ürün seçimi; seçilince Koku Lab'dan notalar, formülden konsantrasyon ve maserasyon otomatik gelir.
  - İçerik türü: sosyal gönderi, ürün açıklaması, ürün görseli, Reels senaryosu.
  - Kanallar, ton (lüks, samimi, minimal), hedef kitle, anahtar kelimeler.
- **Üretilen varyantlar:** Metin varyantları (marka sesi skoru ve uzunlukla), görsel varyantları (oranlarıyla), uyum kontrolü şeridi.
- **Marka kiti:** Renkler, fontlar, ses kuralları ve yasaklı ifadeler.
- **Varlık kütüphanesi.**
- **Yayına gönder:** Sosyal takvim (onaya düşer) ve ürün kartı görselleri.

## Varlıklar
ContentBrief, ContentAsset, ProductContent, ProductMedia, SocialPost.

## İş kuralları
- **ICR-01:** Metin üretimi Claude API ile yapılır. Sistem istemi marka kitini, ürünün gerçek verisini (notalar, konsantrasyon, hacim) ve kanal kurallarını (karakter sınırı, zorunlu alanlar) içerir. Model ürün verisinde olmayan bir özellik uyduramaz; istem bunu açıkça yasaklar ve çıktı kontrolü yapılır.
- **ICR-02 · Uyum kontrolü:**
  - Sağlık veya tedavi iddiası engellenir.
  - Kanıtsız performans iddiası engellenir (ör. "24 saat kalıcılık" yalnızca test raporu ekliyse kullanılabilir).
  - Karşılaştırmalı reklam ve rakip marka adı engellenir.
  - İşbirliği içeriklerinde reklam etiketi zorunludur.
  - Alerjen beyanı ürün sayfasında bulunmalıdır.
  - Kurallar parametre tablosundadır.
- **ICR-03:** Marka sesi skoru, marka kiti örnek metinleriyle benzerlik ve kural uyumu üzerinden hesaplanır; 80'in altındaki varyant uyarı alır.
- **ICR-04:**
  - Görsel üretimi bir görsel üretim servisiyle yapılır; hangi servisin kullanılacağına ADR'de karar verilir.
  - Ürün şişesi ve etiketi gerçek ürün fotoğrafından kompozit edilir. Model ürünü yeniden çizmez; ambalajın yanlış gösterilmesi engellenir.
- **ICR-05:** AI ile üretilen her içerik `aiGenerated = true` ile işaretlenir ve onaylanmadan yayınlanmaz.
- **ICR-06:** Kanal kurallarına uygun görsel seti (ana görsel beyaz fon, oran, çözünürlük) üretilmeden e-ticarete gönderim yapılmaz.

## Olaylar
- **Yayınlar:** `product.updated` (onaylı içerik ürün kartına yazılınca)
- **Dinler:** yok

## API uçları
- `POST /content/briefs`, `POST /content/briefs/:id/generate`
- `GET /content/assets?briefId`, `POST /content/assets/:id/approve`
- `POST /content/assets/:id/publish`: sosyal takvime veya ürün kartına
- `GET|PUT /content/brand-kit`

## Kabul kriterleri
- [ ] Ürün verisinde olmayan bir özellik üretilen metinde geçmiyor (değerlendirme seti, en az 30 örnek).
- [ ] Uyum kuralları yasaklı ifadeleri yakalıyor (birim testi).
- [ ] Onaysız içerik hiçbir kanala çıkmıyor.
