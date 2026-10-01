# ADR-0007 · Üretim dağıtımı (ayrı Hetzner sunucusu + Docker + Caddy)

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-01
- **Bağlam:** EMAPARFUMS ERP'nin internetten (telefon/PC) erişilebilir olması isteniyor; kullanıcılar
  kullanırken geliştirmeye devam edilecek. Kullanıcının Hetzner'da **mevcut, ayrı bir uygulaması ve
  kullanıcıları var**; bu kurulumla **karışmaması** kesin bir kısıt (bkz. memory: atelier-erp izolasyonu).
  İşletme ölçeği henüz küçük; en düşük maliyet tercih ediliyor. Bir alt alan adı mevcut.

## Karar
ERP, **yeni ve ayrı** bir Hetzner VPS'inde (en ucuz CAX11/CX22, Ubuntu 24.04) çalıştırılır. Mevcut
kuruluma hiçbir şekilde dokunulmaz: ayrı sunucu, ayrı Docker Compose projesi (`emaparfums`), ayrı ağ
(`emaparfums_net`), ayrı hacimler ve portlar.

- **Tek imaj, çok servis:** Kök `Dockerfile` tüm monorepo'yu derler; aynı imaj web/api/worker olarak
  farklı `command` ile çalışır (`deploy/docker-compose.prod.yml`).
- **Ağ:** Yalnızca **Caddy** 80/443 dışa açıktır, alt alan adına **otomatik HTTPS** (Let's Encrypt)
  verir. Tarayıcı yalnızca web'e gider; web `/api`'yi sunucu tarafında `api` servisine proxy'ler
  (Next.js rewrite). api/worker/postgres/redis/s3 iç ağda, dışarıya kapalıdır.
- **Veri:** Kendi PostgreSQL 16, Redis 7, SeaweedFS (S3) container'ları ve kalıcı hacimleri.
- **Güvenlik:** Üretimde `MFA_REQUIRED=true` ve `COOKIE_SECURE=true` compose'ta sabit; gizli anahtarlar
  `deploy/.env` (git dışı), `openssl` ile üretilir. Dış sistemler başlangıçta `mock`.
- **Ad:** Dağıtım/ürün kimliği **EMAPARFUMS** (compose projesi, container'lar, DB, alan adı). İç pnpm
  paket kapsamı `@atelier/*` kod içinde kalır (kullanıcıya görünmez; topluca yeniden adlandırma ayrı,
  riskli bir iş olduğundan ertelendi).

## Gerekçe
- **İzolasyon:** Ayrı sunucu, "mevcut uygulamayla karışmasın" kısıtını en kesin biçimde karşılar;
  kaynak/ağ/veri paylaşımı sıfır.
- **En ucuz + profesyonel yeterli:** Küçük bir ARM VPS + Caddy otomatik HTTPS, işletme adı/pahalı
  altyapı gerektirmeden şifreli, alan adıyla erişim sağlar.
- **Tek imaj:** pnpm workspace'te servis başına bağımlılık izleme zahmetini ortadan kaldırır; derleme
  ve dağıtım basit ve tekrarlanabilir.
- **Caddy:** Sertifika yenileme dahil HTTPS'i otomatik yönetir; yapılandırma tek satır.

## Sonuçlar
- "Kullanıcılar kullanırken geliştirme": güncelleme `git pull && docker compose up -d --build` ile
  yapılır; en ucuz kurulumda kısa bir kesinti olur. Kesintisiz (mavi/yeşil) dağıtım ileride ayrı iyileştirme.
- İmaj devDependencies dahil tek parça olduğundan büyüktür (~1–1.5 GB); küçük VPS için kabul edilebilir.
- Gerçek dış sistemler (e-belge, kargo, pazaryeri, ödeme) anahtar girilip `INTEGRATIONS_MODE=auto`
  yapılana kadar mock çalışır. Yasal değerler `docs/04#dogrulanacaklar` teyidi bekler.
- ADR-0002 (barındırma/KVKK) ve ADR-0005 (web sitesi altyapısı) ile uyumludur; bu ADR ERP'nin kendi
  dağıtımını tanımlar. Çalıştırma adımları: `docs/08-dagitim.md`.
