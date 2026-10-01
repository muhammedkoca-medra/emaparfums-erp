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
- **Üretim kurulumu (ürün sayfası):** Hazır esans + parfüm bazıyla çalışan ürünlerde formül ve reçete tek ekranda kurulur (bkz. URT-10). Üretim sayfasında "kurulum bekleyen ürünler" ilerlemesi; kurulum bitince "Sıradaki ürün →".
- **Yeni parti (hacimle):** Toplam hacim (ml) girilir; esans/baz formül konsantrasyonundan, beklenen şişe adedi şişe hacminden anında gösterilir.
- **Dolum dağılımı:** Stoğa gönder (adet) · Tester (ml) · Fire (ml) + parti hacmiyle canlı mutabakat.
- **Kalite onayı (tek adım):** Kalite kontrol aşamasında partinin lotlarına uygulanan testler listelenir; hepsi işaretlenince "Kaliteyi onayla, satışa aç".
- **Şimdi ne yapmalı?** Parti sayfasında her aşama için tek cümlelik yönlendirme.

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
- **URT-10 (hızlı kurulum):** Formül = tek satır (ürünün esansı %100) + `concentrationPct`; kod `F-<SKU>`, yeni sürüm açılır, `production:APPROVE` varsa IFRA kontrolünden (URT-09) geçip onaylanır ve önceki onaylı sürüm arşivlenir, yoksa onaya gider. Reçete (1.000 adet) = esans + baz hacmi kalemin hacim biriminde (L/ML; ağırlıkla tutulan kalem reddedilir, ihtiyaç hesabı birim çevirmez) + seçilen ambalaj (şişe başına 1). Onaylı formül ürüne bağlanır; geçerli bir etiket onayı varsa düşer (KAL-07). Açık bir taslak varken kurulum yapılmaz.
- **URT-11 (hacimle parti):** Parti toplam ml ile açılır; esans/baz `plannedMl × konsantrasyon%` ile bölünüp saklanır, `plannedQty` = ⌊ml ÷ şişe ml⌋. Malzeme ihtiyacı etkin adet (ml ÷ şişe ml, kesirli) ile ölçeklenir; adet birimli satırlar yukarı yuvarlanır.
- **URT-12 (dolum dağılımı ve tester):** Dolumda satılabilir adet mamul lotuna, tester hacmi ürünün ayrı tester kalemine (`SAMPLE · ML`, satılamaz) kendi lotuyla, fire kayda yazılır; tüm lotlar karantinada açılır. Tester ml maliyeti = partinin sıvı (esans + alkol/su) maliyeti ÷ parti ml. Dağılım kaydedilmeden dolumdan çıkılmaz; tekrar giriş engellenir.
- **URT-13 (kalite onayı):** Kalite kontrolden çıkış yalnızca kalite onayıyla: partinin karantinadaki her lotunun uygulanabilir tüm testleri onaylanmalı (KAL-02); sonuçlar ve muayene yazılır, lotlar serbest kalır, `lot.released` ile parti RELEASED olur (URT-06). "Sonraki aşamaya geç" bu aşamada kapalıdır.
- **URT-14 (devam eden üretim ve elle giriş):** Elde süren üretimler doğrudan istenen aşamada (Formül onayı…Kalite kontrol) ve geçmiş tarihle kaydedilir; demlenmede kayıtta sayaç verilen başlangıçtan işler. Önceki aşamaların stok rezervasyonu/tüketimi yapılmaz (malzeme geçmişte kullanıldı). Elle aşama değişiminde aşamaya giriş tarihi geriye dönük girilebilir; hacim/esans/baz ve demlenme değerleri her aşamada düzeltilebilir; dolum dağılımı dolum, etiket/paket ya da kalite aşamasında girilebilir. Tüm elle girişler AuditLog ve aşama loguna yazılır.
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
- `GET /production/setup/:productId`, `POST /production/setup/:productId`: hızlı kurulum (production:CREATE; yeni kalem için stock:CREATE)
- `GET /production/batches/:id/quality`, `POST /production/batches/:id/quality-release`: tek adım kalite onayı (quality:APPROVE)

## Kabul kriterleri
- [ ] Bir parti, formül onayından serbest bırakmaya kadar uçtan uca yürütülebiliyor; stok hareketleri ve maliyet kayıtları doğru.
- [ ] Maserasyon kilidi ve erken geçiş onayı çalışıyor.
- [ ] Hat planında sürükle-bırak yeniden planlama kapasite ihlalini engelliyor.
