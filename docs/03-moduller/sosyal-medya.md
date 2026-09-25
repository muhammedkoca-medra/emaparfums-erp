# Sosyal medya koordinasyonu

**Faz:** 4 · **Prototip ekranı:** 08 · **İzin modülü kodu:** `social`

## Amaç
Tüm hesaplar tek takvimde toplanır; onaylı içerik zamanında yayınlanır ve satışa etkisi ölçülür.

## Ekranlar
- **Hesap kartları:** Instagram, TikTok, Facebook, YouTube, Pinterest, WhatsApp kataloğu.
- **Haftalık takvim:** Gün başına gönderiler (saat, platform, başlık, durum rengi).
- **Onay kuyruğu:** Düzenle / Onayla.
- **Son 7 gün performansı:** Erişim, etkileşim oranı, atfedilen satış, siteye tıklama.
- **Gelen kutusu:** Yanıtsız yorum ve DM'ler, AI yanıt taslakları, sipariş sorularının satışa bağlanması.

## Varlıklar
SocialAccount, SocialPost, ContentBrief, ContentAsset.

## İş kuralları
- **SOS-01:** Gönderi durumları: `DRAFT → PENDING_APPROVAL → SCHEDULED → PUBLISHED | FAILED`. Yayın için `social:APPROVE` gerekir.
- **SOS-02:** Zamanlanmış yayın worker ile platform API'sine gönderilir. API'si yayına izin vermeyen platformda "hatırlatma ve hazır paket" moduna geçilir: bildirim gönderilir, içerik indirilir.
- **SOS-03:** Ürün etiketlenmiş gönderiye otomatik UTM ve kupon kodu eklenir. Atfedilen satış = UTM veya kupon eşleşen siparişlerin net tutarı (son tıklama, 7 gün).
- **SOS-04:** En iyi yayın saati önerisi, son 6 haftanın hesap bazındaki etkileşim verisinden hesaplanır.
- **SOS-05:** Gelen kutusu için AI yanıt taslağı yalnızca taslaktır. Gönderimi insan onaylar; sipariş veya kişisel veri sorusu tespit edilirse satış modülüne görev açılır.
- **SOS-06:** Ürün `SALES_LOCKED` ise o ürünü etiketleyen planlanmış gönderi uyarı verir.

## Olaylar
- **Yayınlar:** `post.published`
- **Dinler:** `compliance.changed`

## API uçları
- `GET|POST|PATCH /social/posts`, `POST /social/posts/:id/approve`
- `GET /social/calendar?from&to`, `GET /social/analytics?from&to`
- `GET /social/inbox`, `POST /social/inbox/:id/reply`

## Kabul kriterleri
- [ ] Instagram ve TikTok için mock adaptörle planla → onayla → yayınla akışı çalışıyor.
- [ ] UTM atfı test siparişleriyle doğrulanıyor.
