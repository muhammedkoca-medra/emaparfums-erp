# ADR-0004 · e-Belge entegratörü

- **Durum:** Karar bekliyor (F0-12 · 25 Eylül 2026)
- **Karar veren:** [Proje sahibi] + mali müşavir
- **Etkilenen:** `EINVOICE` adaptörü (F2-05), fatura modülü, e-İrsaliye (F3-12), e-İhracat (F4-08)

## Bağlam

- EMA Parfums satışta e-Arşiv ve e-Fatura keser, alışta gelen e-Faturayı çeker (3'lü eşleştirme, F2-16).
- İleride e-İrsaliye ve e-İhracat belgeleri de gerekir (`03-moduller/fatura.md`).
- Bu işlemler bir GİB özel entegratörü üzerinden yapılır.
- Adaptör katmanı sayesinde entegratör değişse yalnızca `packages/integrations/src/einvoice/` değişir (ADR-0001, `01-mimari.md` §İlkeler 3).
- Pilotun (Faz 2 sonu) çıkış kriteri, siparişlerin insan müdahalesi olmadan faturalanmasıdır. Bu yüzden karar F2-05'ten önce verilmelidir.

## Değerlendirme ölçütleri

| Ölçüt | Neden önemli | Nasıl ölçülür |
|---|---|---|
| REST/SOAP API kalitesi ve dokümantasyon | Adaptör geliştirme süresi | Sandbox hesabı, örnek istekler |
| Sandbox (test) ortamı | Testlerde gerçek belge kesilmez | Sağlayıcıdan teyit |
| Kapsam: e-Fatura, e-Arşiv, e-İrsaliye, e-İhracat, gelen fatura | Tek entegratörle tüm belgeler | Ürün listesi |
| Mükellef sorgusu API'si | e-Fatura / e-Arşiv ayrımı otomatik | API dokümanı |
| Webhook veya durum sorgusu | Belge durumu takibi (FTR-06) | API dokümanı |
| e-Defter desteği | Muhasebe aktarımıyla uyum (ADR-0003) | Mali müşavir |
| Kontör / belge başı fiyat | İşletme maliyeti | Teklif |
| Pazaryeri entegrasyonu | Trendyol ve Hepsiburada'ya fatura yükleme kolaylığı | Sağlayıcıdan teyit |

## Aday listesi

Aday entegratörler yukarıdaki ölçütlerle karşılaştırılır. Güncel GİB özel entegratör listesi GİB'in resmi kaynağından alınır. Fiyat ve özellikler teklif ve sandbox denemesiyle doğrulanır; bu dokümana tahmini değer yazılmaz.

| Aday | API | Sandbox | Kapsam | Fiyat | Not |
|---|---|---|---|---|---|
| [Aday 1] | | | | | |
| [Aday 2] | | | | | |
| [Aday 3] | | | | | |

## Karar için gereken bilgiler

1. Mali müşavirin tercihi ve kullanılan muhasebe yazılımıyla (ADR-0003) uyum.
2. En az iki aday için sandbox hesabı ve API denemesi.
3. 2026 e-Fatura / e-Arşiv zorunluluk eşikleri (`04-entegrasyonlar.md#dogrulanacaklar`).

## Sonuçlar

- Seçilen entegratörle `/entegrasyon EINVOICE` çalıştırılır.
- Kimlik bilgileri `.env` içinde `INTEGRATION_EINVOICE_*` anahtarlarında tutulur. Veritabanında yalnızca `credentialsRef = "env:EINVOICE"` durur.
