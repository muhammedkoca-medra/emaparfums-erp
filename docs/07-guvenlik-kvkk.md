# 07 · Güvenlik ve KVKK

## Veri sınıflandırması

| Sınıf | Örnek alanlar | Kural |
|---|---|---|
| **Gizli kişisel** | TCKN, VKN (şahıs), telefon, e-posta, adres | Uygulama katmanında AES-256-GCM ile şifrelenir. Arama için HMAC hash tutulur. Loglarda maskelenir (`05** *** **12`). Görüntüleme `customer_pii` iznine bağlıdır. |
| **Ödeme** | Kart numarası, CVV | **Hiç saklanmaz, sunucudan geçmez.** Yalnızca sağlayıcı token'ı tutulur. |
| **Ticari gizli** | Formül yüzdeleri, maliyet, tedarikçi fiyatı | Rol bazlı erişim. Dışa aktarma loglanır. Formül satırları yalnızca Üretim/Ar-Ge ve Yönetici tarafından görülür. |
| **Kimlik bilgisi** | API anahtarları, entegratör şifreleri | Gizli anahtar kasası. Veritabanında `credentialsRef`. Repoda asla bulunmaz. |
| **Genel** | Ürün adı, fiyat listesi | — |

## Kontrol listesi (her faz sonunda)
- [ ] Ağa (canlıya) çıkmadan önce `MFA_REQUIRED=true`; tüm kullanıcılar iki adımlı doğrulamayı kurdu.
- [ ] İzinsiz uç yok (otomatik test).
- [ ] Loglarda ve hata mesajlarında maskelenmemiş kişisel veri yok (log örneklem taraması).
- [ ] Kart verisi hiçbir tabloda veya logda yok (desen taraması).
- [ ] Webhook imzaları doğrulanıyor.
- [ ] Bağımlılık taraması temiz (kritik yok).
- [ ] Yedekten geri yükleme testi yapıldı.
- [ ] Rıza kaydı olmayan müşteriye pazarlama iletisi gönderilemiyor (İYS kontrolü dahil).
- [ ] Veri silme talebi akışı çalışıyor. Kişisel veri anonimleştirilir; yasal saklama yükümlülüğü olan belgeler (fatura) korunur.
- [ ] AI servislerine giden istemlerde kişisel veri yok.

## KVKK süreçleri
- **Aydınlatma ve rıza:** Aydınlatma metni ve açık rıza kayıtları (`kvkkConsentAt`, `marketingConsentAt`) kanal ve metin sürümüyle birlikte tutulur.
- **İlgili kişi başvurusu:** Bilgi talebi ve silme talebi 30 gün içinde yanıtlanır; `Yetki & Kayıtlar` ekranından izlenir.
- **Yurt dışına aktarım:** Bulut barındırma, e-posta/SMS sağlayıcıları ve AI servisleri için hukuki değerlendirme yapılır (ADR-0002, `04#dogrulanacaklar`).
- **Saklama ve imha:** Saklama süreleri politika dokümanına göre parametre tablosunda tutulur; imha işi aylık çalışır.

## Uygulama güvenliği
- **Kimlik doğrulama:** İki adımlı doğrulama zorunlu. Parolalar argon2id ile saklanır. Oturum çerezi `HttpOnly` + `Secure` + `SameSite=Lax`.
- **Sınırlar:** Hız sınırı (giriş, koku testi, herkese açık uçlar), CORS beyaz listesi, CSP başlıkları.
- **Denetim:** `AuditLog` değiştirilemez; veritabanı rolü yalnızca INSERT yetkisine sahiptir.
- **Yedekleme:** Saatlik artımlı + günlük tam yedek, iki farklı bölgede. Aylık geri yükleme testi yapılır.
