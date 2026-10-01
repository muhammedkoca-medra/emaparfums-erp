#!/usr/bin/env bash
# EMAPARFUMS — tek komutla güncelleme (sunucuda çalışır).
# Kendi bilgisayarından:  ssh root@<sunucu> "cd /opt/emaparfums && git pull --ff-only && bash deploy/update.sh"
# Yeni kodu çeker, imajı derler, migrasyonları uygular ve servisleri yeniler. Derleme arka planda,
# oturumdan bağımsız sürer (SSH bağlantısı kopsa da durmaz). Durum: bash deploy/status.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
cd deploy
setsid nohup docker compose -f docker-compose.prod.yml up -d --build > /tmp/deploy.log 2>&1 < /dev/null &
echo "Guncelleme basladi (3-5 dakika surer)."
echo "Durum icin:  ssh root@<sunucu> \"bash /opt/emaparfums/deploy/status.sh\""
