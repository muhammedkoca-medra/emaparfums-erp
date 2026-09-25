---
description: Yeni bir dış sistem adaptörü ekle
argument-hint: <entegrasyon kodu, ör. TRENDYOL>
---
`docs/04-entegrasyonlar.md` içindeki $ARGUMENTS satırını oku (tür, faz, işlemler, notlar).

1. Sağlayıcının güncel resmi API dokümantasyonunu web'de bul ve oku. Uç nokta, kimlik doğrulama, hız sınırı ve webhook bilgisini tahmin etme; kaynağını adaptörün README'sine yaz.
2. `packages/integrations/src/<kod-küçük-harf>/` altında `IntegrationAdapter` arayüzünü uygula: `healthCheck`, ilgili işlemler, hata sınıflandırması (geçici/kalıcı), yeniden deneme.
3. Aynı klasörde `mock.ts`: testler ve anahtarsız geliştirme için sahte adaptör.
4. Anahtarları `.env.example`'a ekle (değer yazmadan). Veritabanına yalnızca `credentialsRef`.
5. Her çağrı `IntegrationLog`'a yazılır; kişisel veri maskelenir.
6. `apps/worker` altında senkron işi (BullMQ, tekrar deneme + ölü mektup kuyruğu).
7. Mock ile birim testler. Gerçek anahtarla deneme yalnızca kullanıcı isterse ve sandbox ortamında.
8. `docs/04-entegrasyonlar.md` durum sütununu güncelle.
