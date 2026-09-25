# Entegrasyon şablonu

Yeni bir dış sistem adaptörü eklemek için bu klasörü `src/<kod-küçük-harf>/` olarak kopyalayın ya da `/entegrasyon <KOD>` komutunu kullanın.

## Dosyalar
- `index.ts`: Gerçek adaptör. `IntegrationAdapter` ve türüne uygun yetenek arayüzünü (`MarketplaceCapabilities` vb.) uygular. Her dış çağrı `invoke(ctx, "<işlem>", fn)` ile sarılır.
- `mock.ts`: Sahte adaptör. Ağa çıkmaz. Anahtar yokken ve testlerde kullanılır.
- `README.md`: Sağlayıcının resmi dokümantasyon bağlantıları, kimlik doğrulama, hız sınırı ve webhook imza yöntemi. Bilgiler kaynağıyla yazılır, tahmin edilmez.

## Kurallar
- **Kayıt:** Adaptör `src/index.ts` içindeki kayıt defterine `requiredCredentials` ile eklenir. Anahtar yoksa `IntegrationRegistry.resolve` sahte adaptörü döndürür.
- **Kimlik bilgileri:** `.env` içinde `INTEGRATION_<KOD>_<ALAN>` biçiminde tutulur. Veritabanında yalnızca `credentialsRef = "env:<KOD>"` durur.
- **Hata sınıfı:** Zaman aşımı, 408, 429 ve 5xx yanıtları geçicidir (`retryable: true`); diğer 4xx yanıtlar kalıcıdır.
- **Loglama:** `invoke` her denemeyi `IntegrationLog`'a yazar. İstek ve yanıt `maskDeep` ile maskelenir.
- **Hız sınırı:** Sağlayıcı limitine göre `TokenBucket` kullanılır.
- **Test:** Testlerde gerçek API çağrısı yapılmaz; sahte adaptör kullanılır.
