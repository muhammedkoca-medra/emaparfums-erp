# Maliyet

**Faz:** 4 · **Prototip ekranı:** 15 · **İzin modülü kodu:** `costing`

## Amaç
Her şişenin bize gerçekte kaça mal olduğunu, standart maliyetten neden saptığını ve hangi ürünün kâr getirdiğini gösterir.

## Ekranlar
- **KPI:** Aylık üretim maliyeti, ortalama sapma, fire oranı, yarı mamul değeri.
- **Parti maliyet kırılımı:** Bileşen (esans, alkol+su, şişe, pompa+kapak, kutu+etiket, direkt işçilik, genel üretim gideri, fire) için standart, gerçek, sapma ve pay.
- **"Ne olursa?" senaryosu:** Esans fiyatı, döviz kuru ve parti büyüklüğü kaydırıcıları; yeni birim maliyet, marj etkisi ve önerilen fiyat ayarı.
- **Ürün kârlılığı:** Birim maliyet, ortalama net satış, marj, adet, katkı payı.

## Varlıklar
StandardCost, BatchCost, BatchConsumption, StockMovement (`unitCost`), ProductionBatch.

## İş kuralları
- **MLY-01:** Hammadde lot maliyeti = alış fiyatı (kur farkıyla TRY) + dağıtılmış navlun/gümrük. Maliyet yöntemi lot bazında gerçek maliyettir (FEFO ile tutarlı).
- **MLY-02:** Parti kapanınca (`batch.completed`) gerçek maliyet hesaplanır:
  - Tüketilen lotların maliyeti.
  - Direkt işçilik = aşama sürelerinin toplamı × saatlik ücret parametresi.
  - Genel üretim gideri = aylık gider havuzunun üretim saatine göre dağıtımı.
  - Fire.
  - Sonuç `BatchCost` tablosuna yazılır.
- **MLY-03:** Mamul lotunun birim maliyeti = parti toplam maliyeti ÷ iyi adet. Bu değer satış hareketinde `unitCost` olarak kullanılır.
- **MLY-04:** Standart maliyet yılda bir veya elle güncellenir. Sapma %3'ü aşarsa bileşen bazında uyarı verilir.
- **MLY-05:** Senaryo hesapları kaydedilmez ve stoka dokunmaz. Önerilen fiyat onaylanırsa `price.changed` yayınlanır (vergi merkezi ve e-ticaret ile birlikte).
- **MLY-06:** Ortalama net satış = KDV dahil satış − KDV − ÖTV − kanal komisyonu − kargo.

## Olaylar
- **Yayınlar:** `price.changed` (onaylı öneri)
- **Dinler:** `batch.completed`, `lot.received` (alış maliyeti)

## API uçları
- `GET /costing/batches/:id`, `GET /costing/products?period`
- `POST /costing/simulate` (kaydetmez)
- `GET|PUT /costing/standards`, `GET|PUT /costing/parameters` (işçilik ücreti, gider havuzu)

## Kabul kriterleri
- [ ] Prototipteki P-2602 kırılımı (standart ₺305, gerçek ₺318) tohum verisiyle üretiliyor.
- [ ] Kur değişikliği senaryosu doğru hesaplanıyor (birim testi).
