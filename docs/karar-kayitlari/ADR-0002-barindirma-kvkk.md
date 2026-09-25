# ADR-0002 · Barındırma ve KVKK

- **Durum:** Karar bekliyor (F0-12 · 25 Eylül 2026)
- **Karar veren:** [Proje sahibi]
- **Etkilenen:** Üretim ortamı, yedekleme, dosya deposu, kimlik bilgisi kasası, yurt dışına veri aktarımı

## Bağlam

- emaparfums müşteri kişisel verisi tutar: ad, adres, telefon, e-posta, TCKN/VKN. Ayrıca fatura, formül ve maliyet gibi ticari gizli veriler de tutar (`07-guvenlik-kvkk.md`).
- KVKK'ya göre kişisel verinin yurt dışına aktarımı ayrı hukuki şartlara bağlıdır. Sunucunun ve yedeğin bulunduğu ülke bu değerlendirmenin merkezindedir.
- Teknik ihtiyaçlar:
  - PostgreSQL 16, Redis ve S3 uyumlu dosya deposu
  - Node 22 uygulamaları: web, api, worker
  - saatlik artımlı ve günlük tam yedek, iki farklı bölgede (`07` §Uygulama güvenliği)
  - gizli anahtar kasası
- Ekip küçük. Yönetilen servisler (managed DB) operasyon yükünü azaltır.

## Seçenekler

| | A · Türkiye'de yerel bulut / veri merkezi | B · Global bulut, Türkiye dışı bölge | C · Karma |
|---|---|---|---|
| Kişisel veri yeri | Türkiye | Yurt dışı | Kişisel veri Türkiye'de, kişisel veri içermeyen işler (CDN, statik site, AI istemleri) dışarıda |
| KVKK yurt dışı aktarım | Gerekmez (yedek de yurt içindeyse) | Gerekir: hukuki değerlendirme, gerekirse standart sözleşme ve bildirim | Yalnızca dış servisler için |
| Yönetilen PostgreSQL / Redis / S3 | Sağlayıcıya göre değişir, teyit edilecek | Olgun ve yaygın | A'nın kısıtlarıyla aynı |
| İki bölgeli yedek | Sağlayıcının Türkiye'deki bölge sayısına bağlı | Kolay | A'ya bağlı |
| Operasyon yükü | Orta–yüksek (yönetilen servis kapsamına göre) | Düşük | Orta |

Not: AI servisleri (Claude API, `04` #22), e-posta ve SMS sağlayıcıları büyük olasılıkla yurt dışındadır. Seçenekten bağımsız olarak bu servislere kişisel veri gönderilmez (`07` kontrol listesi); gönderilmesi gerekirse ayrı değerlendirme yapılır.

## Karar için gereken bilgiler

1. Hukuk danışmanının yurt dışı aktarım görüşü (`04-entegrasyonlar.md#dogrulanacaklar` · KVKK).
2. Aday sağlayıcılar için:
   - yönetilen PostgreSQL 16, Redis ve S3 desteği
   - Türkiye'deki bölge sayısı
   - yedekleme ve geri yükleme süreleri
   - fiyat
3. VERBİS kaydı ve aydınlatma metinlerinin barındırma yeriyle uyumu.

## Öneri (karar değildir)

- Kişisel veri Türkiye'de kalır: **C · Karma**.
- Veritabanı, dosya deposu ve yedekler yurt içinde tutulur.
- Kişisel veri içermeyen servisler (CDN, statik varlıklar) serbestçe seçilir.
- Aday sağlayıcılar yukarıdaki listeyle karşılaştırıldıktan sonra bu ADR "Kabul edildi" durumuna geçer.

## Sonuçlar

- Karar, `docker-compose.yml` dışında bir üretim dağıtım rehberi (`docs/08-dagitim.md`) yazılmasını tetikler.
- `packages/integrations/src/credentials.ts` içine kasa türü eklenir (`vault:` vb.).
