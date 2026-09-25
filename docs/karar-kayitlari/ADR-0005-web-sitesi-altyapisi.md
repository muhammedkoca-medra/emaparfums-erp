# ADR-0005 · Kendi e-ticaret sitesinin altyapısı

- **Durum:** Karar bekliyor (F0-12 · 25 Eylül 2026)
- **Karar veren:** [Proje sahibi]
- **Etkilenen:** `WEBSITE` entegrasyonu (F2-10), koku testi gömme (F5-03), sadakat ve abonelik (Faz 5), ödeme (F2-03)

## Bağlam

- Kendi web sitesi satış kanallarından biridir (`WEB`).
- Siparişlerin emaparfums sistemine düşmesi, stok ve fiyatın siteye itilmesi, ürün içeriğinin (İçerik stüdyosu) senkronu gerekir.
- İleride koku testi, sadakat puanı ve abonelik de sitede çalışacak.
- Pilot (Faz 2 sonu) "kendi sitede veya bir pazaryerinde" gerçek siparişle yapılabilir. Karar pilot kanalını da belirler.

## Seçenekler

| | A · Hazır e-ticaret altyapısı (Shopify, ikas, WooCommerce vb.) | B · emaparfums API'siyle özel site (Next.js) |
|---|---|---|
| Canlıya çıkış süresi | Kısa | Uzun (vitrin, sepet, ödeme, üyelik, SEO baştan yazılır) |
| Entegrasyon | Altyapının API'si ve webhook'ları ile adaptör (`WEBSITE`) | Doğrudan emaparfums API'si, adaptör gerekmez |
| Ödeme | Altyapının kendi ödeme modülü ya da iyzico/PayTR eklentisi | `IYZICO` / `PAYTR` adaptörleri (F2-03, F2-04) |
| Koku testi, sadakat, abonelik | Gömülü bileşen + API (altyapının esnekliğine bağlı) | Tam kontrol |
| Aylık maliyet | Abonelik + işlem komisyonu (teklifle teyit) | Barındırma + geliştirme emeği |
| Mevcut site varsa | Taşıma gerekmez | Taşıma gerekir |

## Karar için gereken bilgiler

1. Şu anda bir site var mı; varsa hangi altyapıda?
2. Pilot kanalı: kendi site mi, Trendyol mu?
3. Koku testi ve abonelik deneyiminin ne kadar özelleştirilmesi gerektiği.

## Öneri (karar değildir)

- **Mevcut bir site varsa A:** O altyapıya adaptör yazılır. Pilot o kanalla veya Trendyol ile yapılır. Özel site ihtiyacı Faz 5'te yeniden değerlendirilir.
- **Site yoksa ve hızlı canlıya çıkış önemliyse:** Yine A önerilir.
- **B yalnızca şu durumda seçilmeli:** Marka deneyimi ana farklılaştırıcıysa ve ek geliştirme süresi kabul ediliyorsa.

## Sonuçlar

- A seçilirse `/entegrasyon WEBSITE`, seçilen altyapının resmi API dokümantasyonuna göre yazılır.
- B seçilirse `apps/storefront` (Next.js) eklenir ve herkese açık API uçları için hız sınırı ile CORS kuralları genişletilir (`07` §Sınırlar).
