# Sadakat & abonelik

**Faz:** 5 · **Prototip ekranı:** 16 · **İzin modülü kodu:** `loyalty`

## Amaç
Müşteriyi geri getirir: puan, seviye, aylık keşif kutusu ve boş şişeyle yeniden dolum.

## Ekranlar
- **KPI:** Aktif üye, abone sayısı, tekrar alım oranı, aboneden tam boya geçiş oranı.
- **Koku Kulübü seviyeleri:** Keşif, Koleksiyoner, Atelier (puan aralıkları ve ayrıcalıklar); yeniden dolum programı.
- **Abonelik operasyonu:**
  - Sonraki kutunun içerik dağılımı (akor ailesine göre).
  - Numune dolumu, tahsilat, yeniden denenecek ödemeler, kargo.
  - Ayrılma riski listesi.
- **Müşteri kartı:** Seviye, puan, koku profili, sonraki kutu, son alımlar, tahmini yeniden alım tarihi.

## Varlıklar
LoyaltyTier, LoyaltyAccount, LoyaltyTransaction, SubscriptionPlan, Subscription, SubscriptionBox, RefillReturn.

## İş kuralları
- **SDK-01:** Puan teslimde kazanılır (`shipment.status_changed = DELIVERED`). Puan = net tutar (KDV hariç) × seviye oranı. İade olursa puan geri alınır.
- **SDK-02:** Seviye son 12 ayın puanıyla her gece yeniden hesaplanır. Seviye düşüşü 30 gün önceden bildirilir.
- **SDK-03:** Puanlar 24 ay kullanılmazsa sona erer (parametrik). Harcamada önce en eski puan düşer.
- **SDK-04:**
  - Kutu içeriği her abone için koku profiline göre seçilir (Koku AI `recommend`); son 6 kutuda gönderilen ürün tekrar edilmez.
  - Stokta olmayan numune seçilmez; numune ihtiyacı üretime önerilir.
- **SDK-05:** Yenileme günü tahsilat yapılır (ODM-08) ve `subscription.renewed` yayınlanır. Toplu kutu siparişi SUBSCRIPTION kanalında oluşur.
- **SDK-06 · Ayrılma riski:** Son iki kutunun açılma/puanlanma oranı, ödeme başarısızlığı ve destek talepleri skorlanır; eşik üstü abone listeye girer.
- **SDK-07 · Yeniden dolum:**
  - İade edilen şişe `RefillReturn` olarak kaydedilir.
  - Şişe kalite kontrolünden geçerse dolum hattına alınır ve puan verilir.
  - Kontrolden geçmezse geri dönüşüme ayrılır.
- **SDK-08:** Pazarlama iletişimi yalnızca `marketingConsentAt` doluysa gönderilir.

## Olaylar
- **Yayınlar:** `subscription.renewed`
- **Dinler:** `shipment.status_changed`, `order.cancelled`, `return.requested`, `quiz.completed`, `payment.failed`

## API uçları
- `GET /loyalty/accounts/:customerId`, `POST /loyalty/redeem`
- `GET|POST /subscriptions`, `POST /subscriptions/:id/pause|resume|cancel`
- `GET /subscriptions/boxes?period`, `POST /subscriptions/boxes/:period/generate`
- `POST /loyalty/refills`

## Kabul kriterleri
- [ ] Puan kazanma, iade ile geri alma ve sona erme testleri geçiyor.
- [ ] Kutu içeriği tekrar etmeme ve stok kısıtına uyuyor.
- [ ] Abonelik yenileme uçtan uca çalışıyor: tahsilat → sipariş → numune dolum önerisi → kargo.
