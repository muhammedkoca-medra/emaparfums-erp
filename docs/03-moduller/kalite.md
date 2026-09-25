# Kalite & mevzuat

**Faz:** 3 · **Prototip ekranı:** 14 · Kalite & Mevzuat · **İzin modülü kodu:** `quality`

## Amaç
Hangi lot satılabilir? Hangi ürünün yasal dosyası eksik? Bir sorun çıkarsa kim etkilenir?

## Ekranlar
- **Lot serbest bırakma kuyruğu:** Lot, ürün, testler (geçti/kaldı/bekliyor), durum, işlem.
- **Ürün dosyası uyumu:** Ürün başına PIF, güvenlik değerlendirmesi, IFRA sertifikası, ÜTS bildirimi, etiket ve alerjen beyanı, SDS, stabilite raporu.
- **İzlenebilirlik ve geri çağırma:** Lot seçilince 5 adımlı zincir gösterilir. Buradan simülasyon ya da gerçek geri çağırma başlatılabilir.
- **Uygunsuzluklar (DÖF):** Açık, incelemede, aksiyon, kapalı.

## Varlıklar
QcTest, QcInspection, QcResult, NonConformance, ComplianceDocument, Recall, Lot.

## İş kuralları
- **KAL-01:** `lot.received` ve `batch.completed` olayları, kalem tipine göre test şablonuyla otomatik muayene açar.
- **KAL-02:** Tüm zorunlu testler geçerse lot serbest bırakılabilir (QC rolü, `quality:APPROVE`). Sonuç `lot.released` olur ve `AuditLog`'a yazılır.
- **KAL-03:** Bir test kalırsa lot `REJECTED` olur ya da karantinada kalır, DÖF otomatik açılır ve `lot.quarantined` yayınlanır.
- **KAL-04:**
  - Zorunlu uyum belgesi `VALID` olmayan ürün `SALES_LOCKED` durumuna geçer. Satış kanallarına kapatılır, sipariş alınamaz.
  - Zorunlu belge listesi parametriktir; varsayılan: UTS_NOTIFICATION, SAFETY_ASSESSMENT, PIF, LABEL_APPROVAL.
- **KAL-05:** Belge geçerliliği bitmeden 60 gün önce görev açılır; süresi dolarsa KAL-04 uygulanır.
- **KAL-06:** Geri çağırma zinciri `02-veri-modeli.md#lot-izlenebilirliği-sorgusu` akışını izler.
  - Simülasyon yalnızca raporlar.
  - Gerçek geri çağırma: ilgili lotları `QUARANTINE` yapar, kanal stoklarını sıfırlar, etkilenen müşteri listesini dışa aktarır. Bildirim metni onayla gönderilir.
- **KAL-07:** Formülde alerjen oranı beyan eşiğini aşarsa (eşikler parametre tablosunda) `mustLabel = true` olur. Etiket onay belgesi, formül değişince geçersiz sayılır.

## Olaylar
- **Yayınlar:** `lot.released`, `lot.quarantined`, `compliance.changed`
- **Dinler:** `lot.received`, `batch.completed`, `return.requested` (hasar kontrolü)

## API uçları
- `GET /quality/inspections?status`, `POST /quality/inspections/:id/results`, `POST /quality/inspections/:id/release`
- `GET /quality/compliance?productId`, `PUT /quality/compliance/:productId/:type` (dosya yükleme)
- `GET /quality/trace/:lotId`, `POST /quality/recalls` (`isSimulation`)
- `GET|POST /quality/nonconformances`

## Kabul kriterleri
- [ ] Karantinadaki lot hiçbir kanalda satılamıyor (e2e testi).
- [ ] ÜTS belgesi eksik ürün `SALES_LOCKED` durumuna geçiyor ve pazaryerinde pasifleşiyor (mock adaptörle).
- [ ] Geri çağırma zinciri tohum verisinde 2 saniyenin altında çıkıyor.
