#!/usr/bin/env bash
# EMAPARFUMS — otomatik güncelleme (cron her 2 dakikada çalıştırır; kurulum: deploy/install-autodeploy.sh).
# GitHub'da main dalında yeni commit varsa update.sh ile derleyip canlıya alır. Aynı anda iki kez
# çalışmaz; süren bir derleme varsa bekler. Kayıt: /var/log/emaparfums-deploy.log
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/emaparfums-autodeploy.lock
flock -n 9 || exit 0
pgrep -f "docker-compose.prod.yml up" > /dev/null && exit 0
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
echo "$(date -Is) yeni surum bulundu: $(git rev-parse --short origin/main) — guncelleniyor" >> /var/log/emaparfums-deploy.log
bash deploy/update.sh >> /var/log/emaparfums-deploy.log 2>&1
