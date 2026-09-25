# Vergi merkezi

**Faz:** 2 (kurallar ve hesap) · 4 (analiz ekranları) · **Prototip ekranı:** 12 · **İzin modülü kodu:** `tax`

## Amaç
Vergi oranları tek yerden yönetilir. Her satışta verginin ne olduğu şeffaf biçimde görünür, aylık beyana hazırlık kolaylaşır.

## Ekranlar
- **Fiyat anatomisi:** Seçilen ürün ve kanal için KDV dahil fiyatın KDV, ÖTV, komisyon, kargo, maliyet ve net kâra dağılımı (yığılmış çubuk ve açıklamalar).
- **Kanal karşılaştırması:** Aynı ürün için fiyat, vergi, net kâr ve marj.
- **Aylık vergi özeti:**
  - Hesaplanan KDV, indirilecek KDV, ödenecek KDV, ÖTV, istisna kapsamındaki tutar.
  - Ay kapanmadıysa "tahmini" etiketi gösterilir.
- **Vergi takvimi:** Beyan tarihleri.
- **Vergi kuralları:** Kategori, GTİP, KDV, ÖTV, geçerlilik tarihleri, onay durumu.

## Varlıklar
TaxRule, TaxCalendarEvent, SalesOrderLine, InvoiceLine, BatchCost (maliyet için), PaymentProvider/Settlement (komisyon için).

## İş kuralları
- **VRG-01:** Hesap yalnızca `packages/shared/src/tax.ts` ile yapılır. Sıra: net → ÖTV → KDV matrahı (net + ÖTV) → KDV.
- **VRG-02:** `TaxRule` kayıtları tarihli ve sürümlüdür. Yeni oran `validFrom` ile girilir, eskisinin `validTo` alanı kapanır. Kural yalnızca `tax:APPROVE` yetkisiyle (mali müşavir veya yönetici) yayına alınır.
- **VRG-03:** Kural değişince `tax_rule.changed` yayınlanır. KDV dahil fiyatlar sabit kalır, net ve marj değişir; marj eşiğin altına düşen ürünler raporlanır ve fiyat önerisi yapılır.
- **VRG-04:** Kategori eşlemesi `Product.taxCategory → TaxRule.category` üzerinden yapılır. GTİP önekiyle ikinci kontrol yapılır; uyumsuzlukta uyarı verilir.
- **VRG-05:** Bedelsiz teslimler (numune, promosyon) vergi hesabına dahil edilir ve maliyet merkezine yazılır. Kesin uygulama mali müşavirle teyit edilir.
- **VRG-06:** İhracatta istisna uygulanır ve istisna kodu faturaya yazılır.
- **VRG-07:** Aylık özet fatura satırlarından hesaplanır (alış faturaları indirilecek KDV'ye girer). Beyanname hazırlanmaz; dışa aktarım mali müşavir içindir.
- **VRG-08:** Fiyat anatomisindeki komisyon ve kargo sözleşme parametrelerinden okunur. Parametre yoksa alan "girilmedi" olarak gösterilir, tahmini değer konmaz.

## Olaylar
- **Yayınlar:** `tax_rule.changed`, `price.changed` (önerilen fiyat onaylanınca)
- **Dinler:** yok (okuma ağırlıklı)

## API uçları
- `GET|POST /tax/rules`, `POST /tax/rules/:id/approve`
- `GET /tax/price-anatomy?productId&channel`
- `GET /tax/summary?period=2026-09`, `GET /tax/summary/export?period`
- `GET /tax/calendar`

## Kabul kriterleri
- [ ] Hiçbir modülde sabit vergi oranı yok (`/kontrol` komutu).
- [ ] Oran değişikliği simülasyonunda eski faturalar değişmiyor, yeni siparişler yeni oranı alıyor.
- [ ] Prototipteki fiyat anatomisi tohum verisiyle üretiliyor (toplam ₺1.290).
