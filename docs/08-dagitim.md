# Dağıtım (canlıya alma) — EMAPARFUMS ERP

Bu belge, EMAPARFUMS ERP'yi **yeni ve ayrı** bir Hetzner sunucusunda internete açar.
**İzolasyon kuralı:** Bu kurulum, mevcut Hetzner uygulamana/kullanıcılarına **hiç dokunmaz** —
ayrı sunucu, ayrı Docker projesi (`emaparfums`), ayrı ağ/hacim/portlar. Mevcut sistemle paylaşılan
hiçbir kaynak yoktur.

## Mimari (özet)
- Yalnızca **Caddy** (80/443) dışa açıktır; otomatik HTTPS (Let's Encrypt).
- Tarayıcı yalnızca **web**'e gider; web, `/api` isteklerini sunucu tarafında **api** servisine proxy'ler.
- **api / worker / postgres / redis / s3** iç ağda kalır (dışarıya port açılmaz).
- Tek Docker imajı (`emaparfums-app`) üç servis olarak çalışır (web/api/worker).

## Güvenlik (üretimde zorunlu)
- `MFA_REQUIRED=true` ve `COOKIE_SECURE=true` compose'ta sabittir → ilk admin girişinde TOTP kurulur.
- Tüm gizli anahtarlar `deploy/.env` içinde (git'e girmez). PII AES-256-GCM ile şifreli, loglarda maskeli.
- Dış sistemler başlangıçta `mock`; gerçek anahtar girilince `INTEGRATIONS_MODE=auto`.

---

## 1. Sunucu (Hetzner) — YENİ, ayrı
- Hetzner Cloud'da **yeni bir sunucu** oluştur (mevcut projeden ayrı):
  - En ucuz: **CAX11** (ARM, ~€3.79/ay) veya tereddütte **CX22** (x86).
  - İşletim sistemi: **Ubuntu 24.04**.
- Firewall: 22 (SSH), 80, 443 açık; başka port gerekmez.

## 2. DNS
- Alan adı sağlayıcında bir **A kaydı**: `erp.alanadiniz.com → <sunucu-IP>`.
- Yayılmayı bekle (`ping erp.alanadiniz.com` IP'yi göstermeli). HTTPS bu alan adıyla otomatik gelir.

## 3. Docker kurulumu (sunucuda)
```bash
curl -fsSL https://get.docker.com | sh
sudo apt-get install -y git
```

## 4. Kodu getir
```bash
sudo mkdir -p /opt/emaparfums && sudo chown $USER /opt/emaparfums
git clone <REPO_URL> /opt/emaparfums
cd /opt/emaparfums
```

## 5–7. Tek komutla kurulum (önerilen)
Repo kökünde:
```bash
bash deploy/bootstrap.sh
```
Script şunları yapar: 3 soru sorar (alan adı, yönetici e-postası, yönetici parolası) → tüm gizli
anahtarları üretip `deploy/.env` yazar → derler → şemayı kurar (`prisma migrate deploy`) → **temiz
tohum** atar (yalnızca yönetici + referans veri; demo müşteri/ürün yok) → her şeyi ayağa kaldırır.

> Elle yapmak istersen: `cp deploy/env.prod.example deploy/.env`, anahtarları `openssl rand -base64 32`
> ile doldur, sonra `cd deploy && docker compose -f docker-compose.prod.yml up -d --build` ve
> `docker compose -f docker-compose.prod.yml run --rm migrate pnpm db:seed` (SEED_CLEAN=1 ile temiz).

## 8. Giriş ve doğrulama
- `https://erp.alanadiniz.com` → giriş: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
- İlk girişte **TOTP (iki adımlı doğrulama)** kurulur (Google Authenticator vb.). Parolayı değiştir.
- Telefon/PC'den aynı adresle erişilir.

## 8b. Kendi ürünlerini ekle (temiz başlangıç)
Temiz tohumda demo ürün yoktur. Kendi ürün kataloğunu içe aktar:
```bash
cd /opt/emaparfums/deploy
docker compose -f docker-compose.prod.yml run --rm migrate pnpm db:import:showcase
```
(Vitrin/koku profili verisi `pnpm db:import:showcase` ile gelir — bkz. [[vitrin-showcase]].)

## 9. Güncelleme (kullanıcılar kullanırken geliştirme)
Kodu `git push` ettikten sonra **kendi bilgisayarından tek komut** (sunucuya girmeye gerek yok):
```bash
ssh root@<sunucu> "cd /opt/emaparfums && git pull --ff-only && bash deploy/update.sh"
```
Durum (derleme bitti mi, servisler ayakta mı):
```bash
ssh root@<sunucu> "bash /opt/emaparfums/deploy/status.sh"
```
- `update.sh` derlemeyi oturumdan bağımsız (`setsid nohup`) başlatır; SSH bağlantısı kopsa da sürer. Log: `/tmp/deploy.log`.
- İmaj yeniden derlenir, container'lar yenilenir (kısa bir kesinti olur — en ucuz kurulumda beklenen).
- Şema değişikliği varsa `migrate` otomatik `prisma migrate deploy` çalıştırır.
- Kesintisiz güncelleme (mavi/yeşil) ileride ayrı bir iyileştirmedir.

## 10. Yedekleme (önerilen)
Günlük Postgres yedeği (cron):
```bash
docker compose -f /opt/emaparfums/deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U emaparfums emaparfums | gzip > /opt/emaparfums-backup-$(date +%F).sql.gz
```

## Komut kısayolları
```bash
# Loglar
docker compose -f docker-compose.prod.yml logs -f web api worker
# Durdur / başlat
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

## Yapılması gerekenler (canlı öncesi hatırlatma)
- `docs/04-entegrasyonlar.md#dogrulanacaklar` — mali müşavir/uzman teyidi gereken yasal değerler.
- Gerçek dış sistemler (e-fatura entegratörü, kargo, pazaryeri, ödeme) için anahtarlar girilip
  `INTEGRATIONS_MODE=auto` yapılmadan bu sistemler **mock** çalışır.
