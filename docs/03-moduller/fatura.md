# Faturalandırma

**Faz:** 2 · **Prototip ekranı:** 11 · **İzin modülü kodu:** `invoicing`

## Amaç
Her satış doğru belgeyle, doğru vergiyle ve insan müdahalesi olmadan faturalanır; gelen alış faturaları otomatik doğrulanır.

## Ekranlar
- **KPI:** Bu ay kesilen belgeler (türe göre), hatalı/bekleyen, vadesi gelen alacak, onay bekleyen alış faturası.
- **Belge yaşam döngüsü:** Taslak → Gönderildi → Alıcıda → Yanıt bekliyor → Hatalı → Muhasebede (her aşamada adet).
- **Belgeler tablosu:**
  - Sekmeler: Satış / Alış / İrsaliye / Hatalı.
  - Sütunlar: belge no, tür, alıcı ve kaynak, toplam, vergi, durum.
- **Önizleme paneli:** Satırlar (lot, GTİP), mal bedeli, ÖTV, KDV matrahı, KDV, genel toplam; PDF ve iade faturası.

## Varlıklar
Invoice, InvoiceLine, DispatchNote, Customer (`isEInvoiceUser`), TaxRule.

## İş kuralları
- **FTR-01 · Belge türü seçimi:**
  - Alıcı GİB e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv kesilir.
  - Yurt dışı teslim e-İhracat olarak kesilir ve istisna kodu eklenir.
  - Mükellefiyet sorgusu entegratörden yapılır ve 24 saat önbellekte tutulur.
- **FTR-02:** Fatura, `order.confirmed` olayından sonra otomatik oluşur. Pazaryerlerinde faturayı satıcı keser ve kanala yükler (kanalın kuralına göre).
- **FTR-03:** Tutarlar sipariş satırlarındaki vergi anlık görüntüsünden alınır; yeniden hesaplama yapılmaz. Belge toplamı = satırların toplamı (`sumBreakdowns`).
- **FTR-04:** Adres, VKN/TCKN gibi zorunlu alanlar eksikse belge `ERROR` durumuna düşer. "Düzelt ve yeniden gönder" akışında yalnızca eksik alan düzenlenir; tutar değiştirilemez.
- **FTR-05:** Ticari e-Faturada alıcının kabul/red yanıtı izlenir; süre ve kurallar entegratörden alınır. Red gelirse satışa görev açılır.
- **FTR-06:** İptal ve iade:
  - Gönderilmiş belge silinmez. İptal kuralları mevzuata göre entegratör üzerinden yürür, aksi halde iade faturası kesilir.
  - İade faturası orijinal belgeye referans verir.
- **FTR-07:** B2B sevkiyatta e-İrsaliye kesilir (`DispatchNote`) ve Shipment ile bağlanır. Zorunluluk eşiği parametriktir.
- **FTR-08:** Gelen alış faturası entegratörden çekilir ve `invoice.purchase_received` yayınlanır. 3'lü eşleştirmeyi satın alma modülü yapar.
- **FTR-09:** Muhasebe aktarımında her belge için yevmiye verisi dışa aktarılır (ADR-0003); aktarılan belge `POSTED` olur.
- **FTR-10:** Fatura numarası ve ETTN entegratörden gelir; sistem numara uydurmaz.

## Olaylar
- **Yayınlar:** `invoice.issued`, `invoice.failed`, `invoice.purchase_received`
- **Dinler:** `order.confirmed`, `order.cancelled`, `return.requested` (onaylanınca iade faturası)

## API uçları
- `GET /invoices?direction&type&status`, `GET /invoices/:id`, `GET /invoices/:id/pdf`
- `POST /invoices/:id/retry`, `POST /invoices/:id/cancel`, `POST /invoices/:id/return`
- `POST /dispatch-notes`
- `POST /webhooks/einvoice` — `x-signature` (HMAC) doğrulanmadan durum değişmez; iptal edilmiş belge terminaldir (ödeme webhook'u ile aynı desen).

## Kabul kriterleri
- [ ] Mock entegratörle e-Arşiv, e-Fatura, e-İhracat ve iade akışları uçtan uca çalışıyor.
- [ ] Prototipteki önizleme tutarları (₺2.580 → ₺1.791,67 / ₺358,33 / ₺430,00) birebir üretiliyor.
- [ ] Hatalı belge kuyruğu ve yeniden gönderme çalışıyor.
- [ ] `mevzuat-denetcisi` incelemesi yapıldı ve kritik bulgu yok.
