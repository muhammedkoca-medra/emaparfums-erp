#!/usr/bin/env bash
# EMAPARFUMS ERP — sunucuda tek komutla kurulum.
# Kullanım (sunucuda, repo kökünde):  bash deploy/bootstrap.sh
# Gizli anahtarları üretir, deploy/.env'i yazar, derler, şemayı kurar, TEMİZ tohum atar, ayağa kaldırır.
set -euo pipefail
cd "$(dirname "$0")"              # deploy/ klasörüne geç
COMPOSE="docker compose -f docker-compose.prod.yml"

gen() { openssl rand -base64 "${1:-32}" | tr -d '\n'; }

if [ ! -f .env ]; then
  echo "== EMAPARFUMS ilk kurulum =="
  read -rp "Alan adı (örn. erp.alanadiniz.com): " DOMAIN
  read -rp "Yönetici e-postası [admin@emaparfums.local]: " ADMIN_EMAIL
  ADMIN_EMAIL=${ADMIN_EMAIL:-admin@emaparfums.local}
  read -rsp "Yönetici parolası (ilk giriş; sonra değiştir): " ADMIN_PW; echo
  [ -n "$DOMAIN" ] || { echo "Alan adı zorunlu."; exit 1; }
  [ -n "$ADMIN_PW" ] || { echo "Yönetici parolası zorunlu."; exit 1; }

  cat > .env <<EOF
DOMAIN=$DOMAIN
DB_PASSWORD=$(gen 24)
AUTH_SECRET=$(gen 32)
PII_ENC_KEYS=k1:$(gen 32)
PII_ENC_ACTIVE_KEY=k1
PII_HASH_KEY=$(gen 32)
PAYMENT_WEBHOOK_SECRET=$(gen 24)
EINVOICE_WEBHOOK_SECRET=$(gen 24)
INTEGRATIONS_MODE=mock
LOG_LEVEL=info
SEED_ADMIN_EMAIL=$ADMIN_EMAIL
SEED_ADMIN_PASSWORD=$ADMIN_PW
SEED_CLEAN=1
EOF
  chmod 600 .env
  echo "✓ deploy/.env oluşturuldu (gizli anahtarlar üretildi)."
else
  echo "ℹ deploy/.env zaten var; dokunulmadı."
fi

echo "== Derleniyor ve ayağa kaldırılıyor (ilk sefer birkaç dakika sürebilir) =="
$COMPOSE up -d --build

echo "== Temiz tohum (yalnızca yönetici + referans veri) =="
$COMPOSE run --rm migrate pnpm db:seed

DOMAIN_VAL=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
echo
echo "========================================================"
echo "  Hazır →  https://${DOMAIN_VAL}"
echo "  Giriş: deploy/.env içindeki SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD"
echo "  İlk girişte iki adımlı doğrulama (TOTP) kurulacak, parolayı değiştir."
echo "  Kendi ürünlerini eklemek için: $COMPOSE run --rm migrate pnpm db:import:showcase"
echo "========================================================"
