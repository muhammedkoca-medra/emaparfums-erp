# E-ticaret entegrasyonu

**Faz:** 2 (Trendyol, Hepsiburada, kendi site) · 4 (Amazon TR, n11, Çiçeksepeti) · **Prototip ekranı:** 06 · **İzin modülü kodu:** `ecommerce`

## Amaç
Ürünler her kanalda doğru fiyat, doğru stok ve iyi içerikle listelenir, siparişler otomatik olarak içeri alınır.

## Ekranlar
- **Kanal kartları:** Bağlantı durumu, son senkron zamanı, aktif ilan sayısı, bugünkü sipariş, uyarı.
- **Listeleme sağlığı:** Ürün, açık olduğu kanallar, fiyat ve stok senkron durumu, içerik skoru (0–100), uyarı, "AI ile düzelt".
- **Kanal içeriği paneli:** Kanal sekmeleri; başlık (karakter sınırı sayacıyla), öne çıkan özellikler, açıklama, kanal kurallarına uygun görsel seti, uyum kontrolü, önizleme, "Tüm kanallara gönder".

## Varlıklar
SalesChannel, ChannelListing, ProductContent, ProductMedia, PriceList, Integration, IntegrationLog.

## İş kuralları
- **ETC-01:** `stock.changed` olayından sonra en geç 2 dakika içinde kanallara `kullanılabilir − tampon` gönderilir. Toplu gönderim yapılır ve kanalın hız sınırına uyulur.
- **ETC-02:** Fiyat değişikliği (`price.changed`) kanala gönderilmeden önce kanal kuralları kontrol edilir (minimum fiyat, indirim oranı üst sınırı). Kural ihlalinde gönderim yapılmaz ve uyarı düşülür.
- **ETC-03:** Sipariş çekme webhook ile yapılır; webhook yoksa en az 5 dakikada bir sorgulanır. Kaçan siparişler için saatlik tam tarama çalışır.
- **ETC-04 · İçerik skoru:**
  - Başlık kanal sınırına uygun: 20 puan.
  - Tüm zorunlu alanlar dolu: 20.
  - Görsel seti tam (ana görsel beyaz fon, en az 4 görsel): 25.
  - Açıklama uzunluğu ve nota bilgisi: 15.
  - Kategori/özellik eşlemesi: 20.
- **ETC-05:** Kanal içeriğinde sağlık iddiası veya kanıtsız performans iddiası (ör. "24 saat kalıcılık") bulunursa uyum kontrolü engeller (İçerik Stüdyosu kuralları).
- **ETC-06:** `SALES_LOCKED` ürünün tüm kanal ilanları `PAUSED` yapılır.
- **ETC-07:** Kargo takip numarası oluşunca (`shipment.created`) sipariş kanalına bildirilir.
- **ETC-08:** Kanala özel kategori ve özellik eşlemeleri `Integration.settings` içinde tutulur; eşlemesi eksik ürün listelenemez.

## Olaylar
- **Yayınlar:** `order.created` (pazaryerinden)
- **Dinler:** `stock.changed`, `price.changed`, `product.updated`, `compliance.changed`, `shipment.created`

## API uçları
- `GET /ecommerce/channels`, `POST /ecommerce/channels/:code/sync`
- `GET /ecommerce/listings?issue`, `POST /ecommerce/listings/:productId/:channel/publish`
- `PUT /products/:id/contents/:channel`

## Kabul kriterleri
- [ ] Mock adaptörle: sipariş çekme, stok itme, fiyat itme ve ilan açma uçtan uca çalışıyor.
- [ ] Hız sınırı ve geçici hata durumunda üstel geri çekilme ile tekrar deneniyor; kalıcı hata ilan uyarısına dönüşüyor.
- [ ] Sandbox anahtarla Trendyol ve Hepsiburada'da test ilanı açıldı (kullanıcı onayıyla).
