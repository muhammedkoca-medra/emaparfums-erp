# Kontrol paneli & sistem haritası

**Faz:** 1 (iskelet) · 5 (AI önerileri) · **Prototip ekranları:** 00, 01 · **İzin modülü kodu:** her kart kendi modülünün izniyle görünür

## Amaç
"Şu an ne oluyor, neye müdahale etmeliyim?" sorusunu tek bakışta cevaplar.

## Ekranlar
- **KPI kartları:** Bugünkü ciro, açık sipariş, üretimdeki parti, kritik stok.
- **Canlı entegrasyon akışı:** Son olaylar ve tetiklediği zincir. `OutboxEvent` ve olay işleyici sonuçlarından okunur.
- **Atelier AI önerileri:** Talep tahmini, satın alma fırsatı, en iyi yayın saati. Her öneri bir eylem düğmesiyle gelir.
- **Özet kartlar:** Üretim hattı, kanal bazında bugünkü satış, yayın takvimi.
- **Sistem haritası:** Modüller, veri çekirdeği, dış entegrasyonlar ve durumları, bir siparişin 8 adımlık yolculuğu.
- **Genel arama (⌘K):** Sipariş, lot, müşteri, ürün, belge numarası; komutlar ("yeni parti", "stok girişi").

## İş kuralları
- **PNL-01:** Kullanıcı yalnızca `VIEW` iznine sahip olduğu modüllerin kartlarını görür.
- **PNL-02:** Canlı akış sunucudan anlık olarak itilir (SSE). Sayfa açık değilken bildirim merkezi kullanılır.
- **PNL-03:** AI önerisi yalnızca öneridir; eylem düğmesi ilgili modülün normal onay akışını başlatır. Her öneride "neden" açıklaması ve kullandığı veri gösterilir.
- **PNL-04 · Talep tahmini:** Son 90 günün kanal bazındaki satışı + mevsimsellik + planlanan kampanyalar kullanılır. Tahmin aralığı gösterilir; tek sayı verilmez.

## API uçları
- `GET /dashboard/summary`, `GET /dashboard/feed` (SSE), `GET /dashboard/insights`
- `GET /search?q`

## Kabul kriterleri
- [ ] Panel 1 saniyenin altında yükleniyor (önbellekli özetlerle).
- [ ] İzinsiz modül kartı gizleniyor ve API 403 dönüyor.
