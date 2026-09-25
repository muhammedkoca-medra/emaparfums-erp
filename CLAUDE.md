# CLAUDE.md — Atelier ERP

Bu dosya Claude Code'un bu depoda nasıl çalışacağını tanımlar. Her oturumun başında okunur.

## Proje nedir?

Parfüm üreticisi için uçtan uca işletim sistemi. Üretim, stok, satın alma, kalite ve mevzuat, satış, e-ticaret, ödeme, fatura, vergi, kargo, maliyet, sadakat, sosyal medya, içerik ve koku AI modülleri tek bir veri çekirdeğini paylaşır.

- Ürün vizyonu ve ekran tasarımları: `docs/00-genel-bakis.md`
- Tıklanabilir prototip: `docs/06-tasarim-sistemi.md` içindeki bağlantı

## Önce oku

| Ne yapacaksan | Önce oku |
|---|---|
| Herhangi bir iş | `docs/05-yol-haritasi.md` (hangi fazdayız, sıradaki görev ne) |
| Veri/şema değişikliği | `docs/02-veri-modeli.md` ve `packages/db/prisma/schema.prisma` |
| Bir modülde çalışma | `docs/03-moduller/<modül>.md` |
| Dış sistem bağlantısı | `docs/04-entegrasyonlar.md` |
| Arayüz | `docs/06-tasarim-sistemi.md` |
| Kişisel veri, ödeme, yetki | `docs/07-guvenlik-kvkk.md` |

## Teknoloji yığını

Bkz. `docs/karar-kayitlari/ADR-0001-teknoloji.md`. Sürümleri kendiliğinden değiştirme; gerekiyorsa önce ADR yaz.

- **Monorepo:** pnpm workspaces + Turborepo, Node 22 LTS, TypeScript (strict)
- **apps/web:** Next.js (App Router), React, Tailwind. Tasarım token'ları `docs/06` içinde
- **apps/api:** NestJS, REST + OpenAPI. Doğrulama zod ile (`packages/shared`)
- **apps/worker:** BullMQ işleyicileri (entegrasyon senkronu, outbox, zamanlanmış işler)
- **apps/mobile:** Expo (React Native), mobil depo uygulaması, çevrimdışı kuyruk
- **packages/db:** Prisma 7 + PostgreSQL 16 (`@prisma/adapter-pg`)
- **packages/shared:** Vergi hesabı, para/miktar yardımcıları, zod şemaları, olay tipleri
- **packages/integrations:** Her dış sistem için adaptör (tek arayüz, çok sağlayıcı)
- **Altyapı:** Redis (kuyruk), S3 uyumlu dosya deposu. Yerelde `docker compose up`

## Komutlar

```bash
pnpm install
docker compose up -d                 # postgres + redis + minio
pnpm db:migrate                      # prisma migrate dev
pnpm db:seed                         # örnek veri (docs/02 §Tohum verisi)
pnpm dev                             # tüm uygulamalar
pnpm test                            # vitest (birim) + api e2e
pnpm lint && pnpm typecheck
```

Bir iş bitmiş sayılmadan önce `pnpm lint && pnpm typecheck && pnpm test` geçmeli.

## Temel kurallar

1. **Dil**
   - Kod, tanımlayıcılar, commit mesajları: İngilizce.
   - Arayüz metinleri, dokümanlar, hata mesajlarının kullanıcıya görünen kısmı: Türkçe.
   - Arayüz metinleri `apps/web/messages/tr.json` içinde tutulur, koda gömülmez.
2. **Stok**
   - `StockBalance` asla doğrudan güncellenmez.
   - Her değişiklik bir `StockMovement` yazar, bakiye aynı transaction içinde `packages/db/src/stock.ts` servisiyle güncellenir.
   - Bu kuralı atlayan kod reddedilir.
3. **Lot ve FEFO**
   - Satış rezervasyonu ve toplama her zaman `qcStatus = RELEASED` lotlardan, son kullanma tarihi en yakın olan önce (FEFO) seçilir.
   - Karantinadaki lot hiçbir çıkış hareketine giremez.
4. **Vergi**
   - Oranlar asla koda yazılmaz; `TaxRule` tablosundan okunur ve sipariş/fatura satırına kopyalanır.
   - Hesap tek yerde yapılır: `packages/shared/src/tax.ts`. Bkz. `docs/03-moduller/vergi.md`.
5. **Para**
   - `number` ile para hesabı yapılmaz; `Decimal` (Prisma) / `decimal.js` kullanılır.
   - Yuvarlama satır bazında, 2 hane, yarım yukarı.
6. **Olaylar**
   - Modüller birbirini doğrudan çağırmaz.
   - Bir modülün başka modülü tetiklemesi `OutboxEvent` yazılarak yapılır; olay adları `docs/02-veri-modeli.md#olaylar` listesinde olmalıdır.
   - Yeni olay eklersen listeyi güncelle.
7. **Denetim**
   - Formül, fiyat, vergi kuralı, yetki, lot durumu ve fatura değişiklikleri `AuditLog` yazar; önceki ve sonraki değer kaydedilir.
8. **Entegrasyonlar**
   - Her dış sistem `packages/integrations/<kod>/` altında, ortak `IntegrationAdapter` arayüzünü uygular.
   - Anahtarlar `.env` / gizli anahtar kasasında tutulur; veritabanında yalnızca `credentialsRef` durur.
   - Gerçek API çağrısı testlerde yapılmaz, sahte (mock) adaptör kullanılır.
9. **Kişisel veri**
   - TCKN/VKN ve telefon alanları şifreli saklanır; loglara maskeli yazılır.
   - Kart verisi hiçbir koşulda saklanmaz, yalnızca ödeme sağlayıcısının token'ı tutulur.
10. **Mevzuat belirsizliği**
    - Vergi oranı, e-belge eşiği veya kozmetik mevzuatı gibi yasal bir değer gerekiyorsa kodu parametreye bağla.
    - Değeri `docs/04-entegrasyonlar.md#dogrulanacaklar` listesine "mali müşavir/uzman teyidi gerekli" notuyla ekle. Tahminle sabit değer yazma.

## Çalışma şekli

- **Sıra:** Faz sırasını takip et (`docs/05-yol-haritasi.md`). Bir fazın çıkış kriterleri sağlanmadan sonrakine geçme.
- **Başlarken:** Her göreve kısa bir plan ile başla. Etkilenen dosyaları, şema değişikliğini ve testleri listele.
- **Şema değişikliği:** Önce `docs/02` güncellenir, sonra migration yazılır. Migration adı İngilizce ve açıklayıcı olur (`add_lot_expiry_index`).
- **Uç nokta:**
  - Her API ucu için zod şeması, yetki kontrolü (`@RequirePermission(module, action)`) ve en az bir e2e test gerekir.
  - Her iş kuralı için birim test gerekir (FEFO seçimi, vergi hesabı, MRP önerisi, 3'lü eşleştirme).
- **Görev bitince:**
  - `docs/05-yol-haritasi.md` içindeki ilgili kutuyu işaretle.
  - Modülün şartnamesinde değişen bir şey varsa güncelle.
- **Karar gerekirse:**
  - Önemli bir teknik karar `docs/karar-kayitlari/ADR-XXXX-*.md` olarak yazılır.
  - Kararı kullanıcı vermeli ise dur ve sor.

## Hazır komutlar

`.claude/commands/` içinde:

- `/faz <no>`: fazın görevlerini sırayla planlar ve uygular
- `/modul <ad>`: bir modülü şartnamesine göre uçtan uca geliştirir (şema, API, arayüz, test)
- `/entegrasyon <kod>`: yeni bir dış sistem adaptörü ekler
- `/kontrol`: lint, tip, test ve kurallar kontrolü
- `/durum`: yol haritasına göre ilerleme özeti

Alt ajanlar `.claude/agents/` içinde:

- `mevzuat-denetcisi`: vergi, e-belge, KVKK, kozmetik kurallarını denetler
- `veri-modeli-muhafizi`: şema değişikliklerini kurallara göre inceler
- `test-yazari`: iş kuralları için test yazar
