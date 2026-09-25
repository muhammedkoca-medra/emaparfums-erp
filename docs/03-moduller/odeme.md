# Ödemeler

**Faz:** 2 · **Prototip ekranı:** 07 · **İzin modülü kodu:** `payments`

## Amaç
Para güvenle tahsil edilir, pazaryeri hakedişleri ve banka hareketleri siparişlerle otomatik eşleşir.

## Ekranlar
- **KPI:** Bugünkü tahsilat, bekleyen hakediş, başarısız ödeme oranı, açık mutabakat farkı.
- **Ödeme yöntemleri tablosu:** Sağlayıcı, kullanım alanı, bugünkü hacim, başarı oranı, durum. Komisyon sözleşmeden girilir.
- **Hakediş mutabakatı:** Dönem bazında beklenen, yatan ve fark; farkın otomatik açıklanan kısmı.
- **Akıllı yönlendirme kuralları.**
- **Son işlemler:** Saat, sipariş, yöntem, taksit/kart, fatura durumu, tutar, durum.
- **Ödeme linki:** B2B ve WhatsApp satışları için.

## Varlıklar
PaymentProvider, Payment, Settlement, SettlementLine, BankTransaction.

## İş kuralları
- **ODM-01:** Kart verisi hiçbir koşulda saklanmaz ve sunucudan geçmez. Sağlayıcının hosted/iframe veya SDK tokenizasyonu kullanılır (PCI DSS kapsamını küçük tutmak için).
- **ODM-02:** 3D Secure varsayılan olarak açıktır.
- **ODM-03 · Yönlendirme:**
  - Yurt dışı BIN ise Stripe kullanılır.
  - Yurt içinde birincil sağlayıcı iyzico, geçici hatada yedek sağlayıcı PayTR ile bir kez yeniden denenir.
  - Tutar ₺25.000'in üzerindeyse ve B2B ise banka sanal POS kullanılır.
  - Kurallar ayarlardan düzenlenebilir.
- **ODM-04:** Webhook imzası doğrulanmadan hiçbir ödeme durumu değiştirilmez. İşleme idempotent anahtar `externalTxId` üzerinden yapılır.
- **ODM-05:** İade, orijinal ödeme yöntemine yapılır; kısmi iade desteklenir. İade faturası fatura modülünde oluşur.
- **ODM-06 · Hakediş mutabakatı:**
  - Pazaryerinden dönem ekstresi çekilir.
  - Satırlar satış, komisyon, iade, kargo ve ceza olarak sınıflandırılır ve siparişlerle eşleştirilir.
  - Açıklanamayan fark eşiği aşarsa (₺100) görev açılır.
- **ODM-07 · Havale/EFT:** Banka hareketi açıklamasında sipariş numarası veya müşteri adı aranır; tutar tutuyorsa eşlenir, tutmuyorsa manuel eşleme kuyruğuna düşer.
- **ODM-08:** Abonelik tahsilatı kayıtlı kart token'ı ile yapılır. Başarısız olursa 1., 3. ve 7. günlerde yeniden denenir, ardından abonelik `PAST_DUE` olur.

## Olaylar
- **Yayınlar:** `payment.captured`, `payment.failed`
- **Dinler:** `order.created` (ödeme bekleniyor), `order.cancelled` (iade), `subscription.renewed`

## API uçları
- `POST /payments/checkout`: sağlayıcı oturumu başlatır.
- `POST /webhooks/payments/:provider`
- `POST /payments/:id/refund` (payments:APPROVE)
- `POST /payments/links`
- `GET /payments/settlements`, `POST /payments/settlements/import`
- `GET /payments/bank-transactions?unmatched`, `POST /payments/bank-transactions/:id/match`

## Kabul kriterleri
- [ ] Sunucu loglarında ve veritabanında kart numarası veya CVV bulunmadığı otomatik testle doğrulanıyor.
- [ ] Prototipteki Trendyol mutabakat örneği (₺412.380 beklenen, ₺2.465 fark) tohum verisiyle yeniden üretiliyor.
- [ ] Yedek sağlayıcıya geçiş senaryosunun testi geçiyor.
