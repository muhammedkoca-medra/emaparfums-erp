# Satın alma

**Faz:** 2 · **Prototip ekranı:** 04 · Satın Alma · **İzin modülü kodu:** `purchasing`

## Amaç
Neyi, ne zaman, kimden ve ne kadar almalıyız? Siparişler nerede?

## Ekranlar
- **MRP önerileri:** Kalem, neden, ihtiyaç, eldeki, öneri, önerilen tedarikçi, termin; çoklu seçimle talep oluşturma.
- **Sipariş panosu (kanban):** Talep → Onay bekliyor → Sipariş verildi → Yolda → Giriş kalite.
- **Tedarikçi kartları:** Zamanında teslim oranı, kalite red oranı, termin süresi, genel puan.
- **Sipariş detayı:** Satırlar, kabul kayıtları, bağlı faturalar ve eşleştirme durumu.

## Varlıklar
Supplier, SupplierItem, PurchaseRequisition, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine, ApprovalRule, ApprovalRequest.

## İş kuralları
- **SAT-01 · MRP:**
  - Formül: ihtiyaç = önümüzdeki 30 günün üretim planı tüketimi + satış tahmini + güvenlik stoğu − kullanılabilir stok − yoldaki miktar.
  - Öneri miktarı MOQ'ya ve paket katına yuvarlanır.
  - Gece çalışır, `stock.below_min` olayıyla da anlık tetiklenir.
- **SAT-02:** Önerilen tedarikçi şu ağırlıklarla seçilir: birim fiyat (TRY karşılığı) %50, termin %20, zamanında teslim %20, kalite red oranı %10. Ağırlıklar ayarlanabilir.
- **SAT-03:** Sipariş tutarı `ApprovalRule` eşiğini (varsayılan ₺50.000) aşarsa `PENDING_APPROVAL` durumuna geçer; onaylayan rol yetki modülünden gelir.
- **SAT-04:**
  - Mal kabulde lot açılır; tedarikçi lotu ve üretim/SKT tarihi zorunludur, lot `QUARANTINE` durumunda başlar.
  - `lot.received` yayınlanır.
  - Kabul, mobil depo üzerinden de yapılabilir.
- **SAT-05:** Kabul edilen miktar sipariş miktarını %5'ten fazla aşarsa uyarı verilir; %10'dan fazla aşarsa kabul engellenir.
- **SAT-06 · 3'lü eşleştirme:**
  - Gelen alış faturası sipariş ve mal kabul ile satır bazında karşılaştırılır: miktar ±%0, birim fiyat ±%1 (ayarlanabilir).
  - Eşleşirse `MATCHED` olur ve otomatik onaylanır; eşleşmezse `MISMATCH` olur ve satın alma sorumlusuna görev açılır.
- **SAT-07:** Tedarikçi puanı her kabul ve kalite sonucunda yeniden hesaplanır.

## Olaylar
- **Yayınlar:** `requisition.created`, `po.approved`, `lot.received`
- **Dinler:**
  - `stock.below_min` (hammadde/ambalaj) → MRP çalışır.
  - `invoice.purchase_received` → 3'lü eşleştirme yapılır.
  - `lot.quarantined` → tedarikçi puanı güncellenir.

## API uçları
- `GET /purchasing/suggestions`, `POST /purchasing/requisitions`
- `GET|POST /purchasing/orders`, `POST /purchasing/orders/:id/submit`, `POST /purchasing/orders/:id/approve` (purchasing:APPROVE)
- `POST /purchasing/orders/:id/receipts`: mal kabul (purchasing:CREATE veya depo rolü)
- `GET|POST /purchasing/suppliers`, `GET /purchasing/suppliers/:id/scorecard`

## Kabul kriterleri
- [ ] Prototipteki 4 MRP önerisi tohum verisiyle aynı sonucu veriyor.
- [ ] Onay eşiği ve yetki matrisi birlikte çalışıyor.
- [ ] 3'lü eşleştirme için eşleşen, fiyat farklı ve miktar farklı senaryoların testleri geçiyor.
