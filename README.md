# Atelier ERP

Parfüm üreticisi için üretimden müşteriye uçtan uca işletim sistemi.

- **Tıklanabilir prototip:** `docs/06-tasarim-sistemi.md`
- **Claude Code ile çalışma kuralları:** `CLAUDE.md`

## Klasör yapısı

```
apps/
  web/         Yönetim paneli (Next.js)
  api/         İş mantığı ve REST API (NestJS)
  worker/      Arka plan işleri (BullMQ)      
  mobile/      Mobil depo uygulaması (Expo)         — Faz 3'te oluşturulur
packages/
  db/          Prisma şeması (veri modeli), istemci, stok servisi
  shared/      Vergi hesabı (testli), olay tipleri, ortak şemalar
  integrations/ Dış sistem adaptör arayüzü
docs/
  00-genel-bakis.md       Vizyon, modüller, roller
  01-mimari.md            Mimari ve kritik akışlar
  02-veri-modeli.md       Veri modeli, kararlar, olay listesi, tohum verisi
  03-moduller/            18 modül şartnamesi (iş kuralları, API, kabul kriterleri)
  04-entegrasyonlar.md    Entegrasyon listesi, öncelik, doğrulanacak yasal konular
  05-yol-haritasi.md      Fazlar, görevler, çıkış kriterleri
  06-tasarim-sistemi.md   Token'lar, bileşenler, prototip bağlantısı
  07-guvenlik-kvkk.md     Veri sınıfları, KVKK, güvenlik kontrol listesi
  karar-kayitlari/        Mimari karar kayıtları (ADR)
.claude/
  commands/    /faz /modul /entegrasyon /kontrol /durum
  agents/      mevzuat-denetcisi, veri-modeli-muhafizi, test-yazari
  settings.json İzinler (.env okuma ve git push kapalı)
```

## Yerelde çalıştırma

Gereksinimler: Node 22+ (24 ile de çalışır), pnpm (`corepack enable`), Docker Desktop.

```bash
pnpm install
pnpm bootstrap          # .env oluşturur; gizli anahtarları ve yönetici parolasını rastgele üretir
docker compose up -d    # postgres, redis, s3 (SeaweedFS)
pnpm db:deploy          # migration'ları uygular (şema değiştirirken: pnpm db:migrate)
pnpm db:seed            # roller, yetki matrisi, depolar, ürünler, kanallar, vergi kuralları, yönetici
pnpm dev                # api :4000, web :3000, worker
```

- **Web paneli:** http://localhost:3000
- **API belgeleri (OpenAPI):** http://localhost:4000/docs
- **İlk giriş:**
  - E-posta `admin@atelier.local`.
  - Parola `.env` dosyasındaki `SEED_ADMIN_PASSWORD` değeridir.
  - İlk girişte iki adımlı doğrulama kurulumu açılır. Karekodu Google Authenticator, Microsoft Authenticator veya 1Password gibi bir uygulamayla okutun.
- **Olay hattı testi:** Kontrol panelindeki "Olay hattını test et" düğmesi outbox'a `system.ping` yazar. Worker olayı alıp loglar.
- **Kontroller:** `pnpm lint && pnpm typecheck && pnpm test`. API ve worker testleri ayrı test veritabanlarını (`atelier_test`, `atelier_test_worker`) her çalıştırmada sıfırdan kurar.

## Claude Code ile çalışma

- İlerleme sorusu için `/durum` kullanın.
- Sıradaki fazı başlatmak için `/faz <no>` kullanın.
- Her iş parçasından sonra `/kontrol` çalıştırın.
- Faz 0'ın son görevi (F0-12) üç karar bekler: barındırma (ADR-0002), e-belge entegratörü (ADR-0004) ve web sitesi altyapısı (ADR-0005). Bu kararlar olmadan Faz 2 başlamaz.

## Hazır olanlar (Faz 0)
- **Monorepo:** pnpm + Turborepo, TypeScript strict, ESLint, Prettier, Vitest, GitHub Actions CI.
- **`packages/db`:** 90+ tablolu şema, ilk migration, AuditLog'u değiştirilemez yapan trigger, tohum verisi, outbox `emit()`.
- **`packages/shared`:** Vergi hesabı, yetki matrisi, maskeleme, alan şifreleme (AES-256-GCM + arama hash'i), TOTP.
- **`packages/integrations`:** Adaptör kayıt defteri, sahte (mock) mod, yeniden deneme, IntegrationLog, hız sınırı, şablon adaptör.
- **`apps/api`:** NestJS. İçerik:
  - e-posta + parola + TOTP ile giriş, cihaz token'ı
  - varsayılan olarak reddeden `@RequirePermission` guard
  - `AuditInterceptor`
  - OpenAPI belgeleri
- **`apps/worker`:** outbox-dispatcher, BullMQ olay işleyici, ölü mektup kuyruğu.
- **`apps/web`:** Next.js kabuğu. İçerik:
  - prototipteki kenar menü ve üst bar
  - izne göre menü
  - iki adımlı giriş
  - kontrol paneli ve yetki & kayıtlar ekranı

## Önemli uyarı
Vergi oranları, e-belge eşikleri ve kozmetik mevzuatı gibi yasal değerler sisteme parametre olarak girilir ve `docs/04-entegrasyonlar.md#dogrulanacaklar` listesinde teyit bekler. Canlıya çıkmadan önce mali müşavir ve ilgili uzmanlarla teyit edilmelidir.
