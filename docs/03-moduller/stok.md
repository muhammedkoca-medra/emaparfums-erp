# Stok takip

**Faz:** 1 · **Prototip ekranı:** 03 · Stok Takip · **İzin modülü kodu:** `stock`

## Amaç
Hangi kalemden, hangi lotta, nerede, ne kadar var ve bunun ne kadarı kullanılabilir? Tüm stok hareketlerinin tek doğruluk kaynağıdır.

## Ekranlar
- **Stok listesi:**
  - Sekmeler: Tümü / Esans & hammadde / Ambalaj / Yarı mamul / Mamul.
  - Kod, lot veya barkodla arama.
  - Sütunlar: kod, kalem, lot, mevcut, rezerve, min, durum, lokasyon.
- **Kalem detayı:** Lotlar, lokasyon dağılımı, hareket geçmişi, bağlı satın alma ve üretim kayıtları.
- **Depolar:** Doluluk oranı, sıcaklık aralığı.
- **Son hareketler:** Canlı akış.
- **Otomatik kurallar:** Min seviye, SKT uyarı günü ve kanal stok tamponu ayarları.
- **Başlık göstergeleri (KPI):** Toplam stok değeri, kritik kalem sayısı, yaklaşan SKT, stok devir hızı.

## Varlıklar
Item, Lot, Warehouse, Location, StockBalance, StockMovement, StockReservation, CycleCount, CycleCountLine.

## İş kuralları
- **STK-01:** Bakiye yalnızca `recordMovement()` ile değişir; hareket ve bakiye aynı transaction içinde yazılır.
- **STK-02:** Kullanılabilir miktar `qtyOnHand − qtyReserved` formülüyle bulunur ve 0'ın altına düşemez; aksi durumda işlem reddedilir.
- **STK-03:** `qcStatus ≠ RELEASED` olan lottan çıkış hareketi (SALE, ISSUE, PRODUCTION_CONSUME, TRANSFER dışı) yapılamaz.
- **STK-04 · FEFO:** Rezervasyon ve toplama, son kullanma tarihi en yakın serbest lottan başlar. SKT'siz lotlar en sona konur; SKT eşitse önce giren önce çıkar.
- **STK-05:** Kullanılabilir miktar `Item.minStock` altına düşünce `stock.below_min` yayınlanır. Aynı kalem için 24 saatte en fazla bir kez yayınlanır.
- **STK-06:** Her bakiye değişiminde `stock.changed` yayınlanır; e-ticaret modülü bunu kanallara iter.
- **STK-07:** Kanal stok tamponu: kanallara `kullanılabilir − tampon` gönderilir (varsayılan tampon 2 adet, kanal bazında ayarlanabilir).
- **STK-08:** SKT'ye `N` gün (varsayılan 90) kalan lotlar uyarı listesine düşer ve pazarlamaya kampanya önerisi olarak gider.
- **STK-09:** Sayım farkı `ADJUSTMENT` hareketi olarak yazılır. Farkın değeri eşiği aşarsa (varsayılan ₺5.000) yönetici onayı gerekir.
- **STK-10:** Gece tutarlılık işi, hareket toplamları ile bakiyeleri karşılaştırır; fark bulursa alarm üretir.

## Olaylar
- **Yayınlar:** `stock.reserved`, `stock.below_min`, `stock.changed`
- **Dinler:**
  - `order.confirmed` → rezervasyon yapar.
  - `order.cancelled` → rezervasyonu iade eder.
  - `lot.released`, `lot.quarantined`
  - `batch.completed` → mamul girişi yapar.

## API uçları
- `GET /stock/balances?type&search&warehouse`: liste (stock:VIEW)
- `GET /stock/items/:id`: kalem detayı, lotlar ve hareketler (stock:VIEW)
- `POST /stock/movements`: elle hareket, ADJUSTMENT/TRANSFER (stock:CREATE)
- `POST /stock/reservations`: iç kullanım, satış servisinden (stock:CREATE)
- `GET /stock/expiring?days=90`: SKT'si yaklaşan lotlar (stock:VIEW)
- `POST /stock/counts`, `PATCH /stock/counts/:id/lines`, `POST /stock/counts/:id/submit`, `POST /stock/counts/:id/approve`

## Kabul kriterleri
- [ ] STK-01…10 için birim testleri geçiyor.
- [ ] Eşzamanlı iki rezervasyon aynı son adedi alamıyor (satır kilidi veya serializable transaction).
- [ ] 50.000 hareketli veride stok listesi 500 ms altında açılıyor.
- [ ] Prototipteki stok ekranı gerçek veriyle çalışıyor.
