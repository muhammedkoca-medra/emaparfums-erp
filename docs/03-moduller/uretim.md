# Üretim

**Faz:** 3 · **Prototip ekranı:** 02 · Üretim · **İzin modülü kodu:** `production`

## Amaç
Hangi parti hangi aşamada, ne zaman bitecek ve bunun için malzeme ile kapasite yeterli mi?

## Ekranlar
- **Aşama hattı:**
  - 7 aşama: Formül onayı, Tartım & karışım, Maserasyon, Soğutma & filtrasyon, Dolum, Etiket & paket, Kalite kontrol.
  - Her aşamada o an bulunan parti sayısı gösterilir.
- **Aktif partiler tablosu:** Parti, ürün, adet, aşama, ilerleme (maserasyonda gün sayacı), sorumlu, bitiş tarihi.
- **Formül kartı:**
  - Konsantrasyon, 1.000 adet için malzeme listesi ve her kalemin stok durumu (✓ veya eksik).
  - IFRA uyumu, beyan edilecek alerjenler.
- **Hat planı:** Tank ve dolum/paket hatları için haftalık Gantt; sürükleyerek yeniden planlama.
- **Yeni parti sihirbazı:** Ürün seçimi → formül sürümü → adet → malzeme uygunluk kontrolü → planlama.

## Varlıklar
Formula, FormulaLine, FormulaAllergen, BillOfMaterials, BomLine, ProductionBatch, ProductionStageLog, BatchConsumption, Resource, ScheduleSlot.

## İş kuralları
- **URT-01:** Parti yalnızca `APPROVED` bir formül sürümüyle açılabilir.
- **URT-02:** Parti açılırken reçete adet başına ölçeklenir (fire payı dahil) ve eksik kalemler listelenir. Eksik varsa parti `FORMULA_APPROVAL` aşamasında kalır ve satın alma talebi önerilir.
- **URT-03:** `WEIGHING_MIXING` aşamasına geçişte hammaddeler FEFO ile rezerve edilir. Aşama tamamlanınca `PRODUCTION_CONSUME` hareketleri ve `BatchConsumption` kayıtları yazılır; birim maliyet lotun maliyetinden alınır.
- **URT-04:** Maserasyon süresi formülde tanımlıdır (varsayılan 14–28 gün). Süre dolmadan `CHILL_FILTER` aşamasına geçilemez; erken geçiş yalnızca yönetici onayıyla ve gerekçe yazılarak yapılır.
- **URT-05:**
  - Dolumda üretilen adet ve fire girilir.
  - Mamul lotu `QUARANTINE` durumunda açılır (`lot.received` değil, `batch.completed` olayıyla).
  - Lot numarası formatı: `L-<YYMM>-<harf>`.
- **URT-06:** `QUALITY_CONTROL` aşaması, kalite modülü lotu serbest bırakınca otomatik olarak `RELEASED` olur.
- **URT-07:** Hat planı kapasiteyi aşamaz. Çakışan slotlar uyarı verir; `isTentative` slotlar (ör. "pompa gelirse") ayrı renkte gösterilir.
- **URT-08:** Her aşama değişikliği `ProductionStageLog` ve `batch.stage_changed` yazar.
- **URT-09:** Onaylı formülde değişiklik yeni sürüm oluşturur ve `AuditLog`'a yazılır. IFRA limit kontrolü (madde bazında kategori sınırı) formül onayından önce çalışır; limitler parametre tablosundan okunur.

## Olaylar
- **Yayınlar:** `batch.stage_changed`, `batch.completed`
- **Dinler:**
  - `stock.below_min` (mamul) → üretim önerisi oluşturur.
  - `lot.released` → partiyi `RELEASED` yapar.

## API uçları
- `GET /production/batches?stage`, `GET /production/batches/:id`
- `POST /production/batches`: sihirbaz sonucu (production:CREATE)
- `POST /production/batches/:id/advance`: sonraki aşamaya geçer (production:EDIT)
- `POST /production/batches/:id/output`: dolum sonucunu girer
- `GET /production/schedule?from&to`, `PATCH /production/schedule/:slotId`
- `GET /formulas/:id`, `POST /formulas/:id/versions`, `POST /formulas/:id/approve` (production:APPROVE)

## Kabul kriterleri
- [ ] Bir parti, formül onayından serbest bırakmaya kadar uçtan uca yürütülebiliyor; stok hareketleri ve maliyet kayıtları doğru.
- [ ] Maserasyon kilidi ve erken geçiş onayı çalışıyor.
- [ ] Hat planında sürükle-bırak yeniden planlama kapasite ihlalini engelliyor.
