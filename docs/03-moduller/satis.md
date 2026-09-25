# Satış & CRM

**Faz:** 2 · **Prototip ekranı:** 05 · Satış & CRM · **İzin modülü kodu:** `sales`

## Amaç
Tüm kanallardan gelen siparişler tek havuzda toplanır. Müşteriyi 360° tanırız ve B2B fırsatları takip ederiz.

## Ekranlar
- **KPI:** Aylık ciro, sipariş sayısı, ortalama sepet, iade oranı.
- **Grafikler:** Son 30 günlük ciro trendi (toplam ve B2B), kanal payı.
- **Son siparişler:** Sipariş no, kanal, müşteri, ürünler, ödeme yöntemi, tutar, durum.
- **Sipariş detayı:** Zaman çizelgesi (ödeme → rezervasyon → fatura → toplama → kargo → teslim), satırların vergi kırılımı, bağlı belgeler.
- **Müşteri 360°:** İletişim bilgileri, rıza kayıtları, siparişler, faturalar, sadakat bilgisi, koku profili, abonelikler, iletişim geçmişi.
- **B2B fırsatlar:** Teklif → Numune → Pazarlık → Kazanıldı/Kaybedildi; teklif PDF'i.

## Varlıklar
Customer, Address, SalesChannel, PriceList, PriceListItem, SalesOrder, SalesOrderLine, Opportunity.

## İş kuralları
- **SAL-01:** Sipariş numarası kanal önekiyle oluşturulur (`TY-`, `HB-`, `AZ-`, `WB-`, `B2B-`, `MG-`). `(channelId, externalOrderNo)` benzersizdir; aynı pazaryeri siparişi ikinci kez içeri alınmaz.
- **SAL-02:** Sipariş satırı oluşurken `TaxRule` (ürünün `taxCategory` alanı ve sipariş tarihi) okunur. Oranlar satıra kopyalanır, tutarlar `lineFromGrossUnit` ile hesaplanır.
- **SAL-03:** `SALES_LOCKED` veya `DRAFT` ürün siparişe eklenemez.
- **SAL-04:** Müşteri eşleştirmesi e-posta veya telefon hash'iyle yapılır; pazaryeri müşterileri kanal içi kimlikle ayrı tutulur. KVKK açık rızası yoksa pazarlama iletişimi kapalıdır.
- **SAL-05:** B2B siparişte vade (`paymentTermsDays`) ve kredi limiti kontrol edilir; limit aşılırsa siparişi yönetici onaylar.
- **SAL-06:** İptal, `SHIPPED` durumundan önce yapılabilir. Sonrasında süreç iade (`ReturnRequest`) olarak ilerler.
- **SAL-07:** Durum geçişleri bir durum makinesiyle yönetilir; geçersiz geçiş reddedilir. Geçiş tablosu kod içinde tek yerde tutulur.

## Olaylar
- **Yayınlar:** `order.created`, `order.confirmed` (ödemesiz kanallarda, ör. kapıda ödeme veya B2B vadeli), `order.cancelled`, `return.requested`
- **Dinler:**
  - `payment.captured` → siparişi onaylar.
  - `invoice.issued`
  - `shipment.status_changed` → sipariş durumunu günceller.

## API uçları
- `GET /sales/orders?channel&status&q`, `GET /sales/orders/:id`, `POST /sales/orders` (B2B, mağaza)
- `POST /sales/orders/:id/cancel`, `POST /sales/orders/:id/returns`
- `GET|POST /customers`, `GET /customers/:id/360`
- `GET|POST|PATCH /sales/opportunities`
- `GET /sales/analytics/summary?from&to`

## Kabul kriterleri
- [ ] Aynı pazaryeri siparişinin iki kez gelmesi tek kayıt oluşturuyor.
- [ ] Sipariş toplamları `packages/shared/src/tax.ts` ile kuruşu kuruşuna tutuyor.
- [ ] Müşteri 360° ekranı tek istekte 300 ms altında yükleniyor.
