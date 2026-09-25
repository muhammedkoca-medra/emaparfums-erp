# 04 · Entegrasyonlar

Her entegrasyon `packages/integrations/src/<kod>/` altında `IntegrationAdapter` arayüzünü uygular ve anahtar yokken mock modunda çalışır. Eklemek için: `/entegrasyon <KOD>`.

## Öncelik ölçeği
- **P0 · Olmadan canlıya çıkılmaz:** yasal zorunluluk ya da para akışı.
- **P1 · İlk satış döngüsü için gerekli.**
- **P2 · Verimlilik ve ölçek.**
- **P3 · Farklılaştırıcı.**

## Liste

| # | Kod | Tür | Öncelik | Faz | İşlemler | Notlar / karar | Durum |
|---|---|---|---|---|---|---|---|
| 1 | `EINVOICE` | e-Belge (GİB özel entegratör) | P0 | 2 | Mükellef sorgusu, e-Arşiv/e-Fatura gönder, durum, gelen fatura çek, iptal, PDF, e-İrsaliye, e-İhracat | Entegratör seçimi ADR-0004 ile yapılacak (fiyat, API kalitesi, e-Defter desteği). Adaptör, entegratör değişirse yalnızca kendisi değişecek şekilde yazılır. | Planlandı |
| 2 | `IYZICO` | Ödeme | P0 | 2 | 3D ödeme, taksit sorgusu, iade, kayıtlı kart, webhook | Birincil yurt içi sağlayıcı | Planlandı |
| 3 | `PAYTR` | Ödeme | P1 | 2 | 3D ödeme, iade, ödeme linki, webhook | Yedek sağlayıcı ve ödeme linki | Planlandı |
| 4 | `TRENDYOL` | Pazaryeri | P1 | 2 | Sipariş çek, stok/fiyat it, ilan aç/güncelle, fatura yükle, hakediş, iade | Kategori ve özellik eşlemesi gerekir | Planlandı |
| 5 | `HEPSIBURADA` | Pazaryeri | P1 | 2 | Aynı işlemler | | Planlandı |
| 6 | `WEBSITE` | Kendi e-ticaret sitesi | P1 | 2 | Sipariş webhook, stok/fiyat/içerik senkronu, koku testi gömme | **Karar gerekli:** mevcut altyapı (Shopify/ikas/WooCommerce) mı, emaparfums API'siyle özel site mi? ADR-0005 | Karar bekliyor |
| 7 | `CARGO_YURTICI` | Kargo | P1 | 2 | Gönderi oluştur, etiket, takip, iptal | | Planlandı |
| 8 | `CARGO_ARAS` | Kargo | P1 | 2 | Aynı | | Planlandı |
| 9 | `FX_TCMB` | Döviz kuru | P1 | 2 | Günlük kur çek | TCMB günlük kur yayını; hafta sonu ve tatilde son iş günü kuru | Planlandı |
| 10 | `SMS` / `WHATSAPP` | Mesajlaşma | P1 | 2 | Sipariş, kargo ve gecikme bildirimi, OTP | Ticari ileti için İYS kaydı ve onayı gerekli (bkz. Doğrulanacaklar) | Planlandı |
| 11 | `IYS` | Ticari ileti izni | P1 | 2 | İzin sorgula ve kaydet | Pazarlama mesajı göndermeden önce izin kontrolü | Planlandı |
| 12 | `CARGO_MNG`, `CARGO_PTT`, `TRENDYOL_EXPRESS`, `HEPSIJET` | Kargo | P2 | 3 | Gönderi, etiket, takip | Pazaryeri kargoları kanal entegrasyonu içinden de yönetilebilir | Planlandı |
| 13 | `SCALE` / `SCANNER` | Donanım | P2 | 3 | Tartı okuma, el terminali klavye kaması | Cihaz modeline göre (Bluetooth/USB) | Planlandı |
| 14 | `BANK` | Banka hareketleri | P2 | 4 | Hesap hareketi çek (API veya ekstre dosyası), havale eşleme | Bankanın kurumsal API'si yoksa ekstre dosyası içe aktarılır | Planlandı |
| 15 | `ACCOUNTING` | Muhasebe | P2 | 4 | Yevmiye/fatura aktarımı, cari bakiyeler | **Karar gerekli:** kullanılan muhasebe yazılımı (Logo, Mikro, Paraşüt, Luca vb.) | Karar bekliyor |
| 16 | `STRIPE` | Ödeme | P2 | 4 | Yurt dışı kart, çoklu para birimi | İhracat ve yurt dışı site satışı başlarsa | Planlandı |
| 17 | `BANK_POS` | Ödeme | P2 | 4 | B2B yüksek tutar, ön provizyon | Anlaşmalı banka sanal POS'u | Planlandı |
| 18 | `AMAZON_TR` | Pazaryeri | P2 | 4 | Sipariş, stok, fiyat, ilan (SP-API) | | Planlandı |
| 19 | `N11`, `CICEKSEPETI` | Pazaryeri | P2 | 4 | Sipariş, stok, fiyat, ilan | | Planlandı |
| 20 | `META` | Sosyal (Instagram, Facebook) | P2 | 4 | Gönderi yayınla/zamanla, içgörüler, yorum ve DM | Hesaplar işletme hesabı olmalı | Planlandı |
| 21 | `TIKTOK` | Sosyal | P2 | 4 | İçerik yayını, içgörüler | Yayın API'si yetkisi ayrıca başvuru gerektirebilir | Planlandı |
| 22 | `CLAUDE` | AI | P2 | 4 | İçerik üretimi, profil çıkarımı, öneri açıklaması, yanıt taslağı | Kişisel veri istemlere gönderilmez; yurt dışı aktarım KVKK değerlendirmesi | Planlandı |
| 23 | `IMAGE_GEN` | AI görsel | P3 | 4 | Ürün kompozit görseli, arka plan | Servis seçimi ADR ile; ürün ambalajı gerçek fotoğraftan kompozit edilir | Karar bekliyor |
| 24 | `UTS` | Mevzuat (TİTCK ÜTS) | P3 | 3 | Bildirim durumu takibi | API erişimi teyit edilecek; yoksa belge yükleme ve manuel durum girişi | Teyit bekliyor |
| 25 | `YOUTUBE`, `PINTEREST` | Sosyal | P3 | 5 | Yayın, içgörü | | Planlandı |
| 26 | `EMBEDDINGS` | AI | P3 | 5 | Metin gömme vektörü (koku araması) | Sağlayıcı ADR ile | Karar bekliyor |

## Ortak gereksinimler
- **Kimlik bilgileri:** Gizli anahtar kasasında (yerelde `.env`) tutulur. Veritabanında yalnızca `credentialsRef` durur. Yerel biçim: `credentialsRef = "env:<KOD>"` → `.env` içinde `INTEGRATION_<KOD>_<ALAN>` (ör. `INTEGRATION_TRENDYOL_API_KEY`). Çözümleyici: `packages/integrations/src/credentials.ts`.
- **Sahte (mock) mod:** Zorunlu anahtarlardan biri yoksa `IntegrationRegistry.resolve` sahte adaptörü döndürür; gerçek çağrı yapılmaz. Şablon: `packages/integrations/src/_template/`.
- **Loglama:** Her çağrı `invoke()` ile sarılır ve `IntegrationLog`'a yazılır; kişisel veri ve anahtarlar `maskDeep` ile maskelenir.
- **Hata sınıflandırması:**
  - Geçici hatalar (zaman aşımı, 429, 5xx) üstel geri çekilmeyle en fazla 6 kez denenir, sonra ölü mektup kuyruğuna gider.
  - Kalıcı hata (veri hatası) ilgili kaydı hatalı durumuna düşürür ve görev açar.
- **Webhook:** İmza doğrulaması zorunludur. İşleme idempotent anahtarla yapılır; işleme süresi 5 saniyeyi aşarsa kuyruğa alınıp hemen 200 dönülür.
- **Hız sınırı:** Sağlayıcının limitine göre adaptör içinde token bucket uygulanır.
- **Sandbox önce:** Gerçek hesapla ilk deneme sandbox ortamında ve kullanıcı onayıyla yapılır.

## Doğrulanacaklar

Aşağıdaki değerler koda parametre olarak girilir ve mali müşavir, avukat veya ilgili uzmanla teyit edilmeden canlıya çıkılmaz. Teyit edilince tarih ve kaynak eklenerek işaretlenir.

- [ ] **KDV oranı · parfüm:** Tohumda 0,20 kullanıldı.
- [ ] **ÖTV (IV) · parfüm ve tuvalet suları (33.03):** Tohumda 0,20 kullanıldı; kolonyalar hariç. Kaynak: TÜRMOB 2023 ÖTV oran listesi. Güncelliği ve ÖTV'nin hangi teslimde doğduğu (imalatçının ilk teslimi) teyit edilecek.
- [ ] **Bedelsiz numune ve promosyon teslimlerinde KDV/ÖTV uygulaması.**
- [ ] **e-Fatura, e-Arşiv, e-İrsaliye ve e-Defter zorunluluk eşikleri:** 2026 için güncel eşik; e-ticaret satışına özel eşik.
- [ ] **Pazaryeri satışlarında fatura:** Faturayı kim keser, kanala yükleme ve e-Arşiv gönderim kuralları.
- [ ] **İhracat:** Faturadaki KDV ve ÖTV istisna kodları, e-İhracat süreci, gümrük entegrasyonu.
- [ ] **ÜTS kozmetik ürün bildirimi:** Piyasaya arzdan önceki zorunluluk kapsamı, güncelleme gerektiren değişiklikler, API erişimi.
- [ ] **Güvenlik değerlendirmesi ve ürün bilgi dosyası (PIF):** Geçerlilik ve yenileme koşulları.
- [ ] **Alerjen beyan eşikleri:** Durulanmayan ürünlerde etikette beyan eşiği ve güncel madde listesi.
- [ ] **IFRA:** Güncel değişiklik numarası (tohumda 51 varsayıldı) ve kategori limitleri. Limit tablosu parametre olarak tutulacak.
- [ ] **Etil alkol:** Kullanımına ilişkin izin, kayıt ve beyan yükümlülükleri.
- [ ] **UN1266 (parfümeri ürünleri):** Hava kargo kuralları, miktar sınırları, kargo firmalarının kabul politikaları.
- [ ] **İYS:** Kayıt ve ticari elektronik ileti onayı; SMS, WhatsApp ve e-posta kapsamı.
- [ ] **KVKK:** VERBİS kaydı, yurt dışına veri aktarımı (bulut, AI servisleri), aydınlatma metinleri, saklama ve imha süreleri.
- [ ] **Saklama süreleri:** Fatura ve belge saklama süresi, işlem kaydı (AuditLog) saklama süresi.
- [ ] **Mesafeli satış:** Cayma hakkı ve açılmış kozmetik/parfüm ürünlerinde iade istisnası kuralları.
