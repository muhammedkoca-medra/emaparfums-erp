#!/usr/bin/env bash
# EMAPARFUMS — otomatik güncellemeyi bir kez kurar (sunucuda, root olarak).
# Kendi bilgisayarından:  ssh root@<sunucu> "cd /opt/emaparfums && git pull --ff-only && bash deploy/install-autodeploy.sh"
# Sonrasında main'e her push 2 dakika içinde algılanır ve 3-5 dakikada canlıya çıkar. Kaldırmak: rm /etc/cron.d/emaparfums-autodeploy
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
chmod +x "$DIR/update.sh" "$DIR/status.sh" "$DIR/autodeploy.sh"
cat > /etc/cron.d/emaparfums-autodeploy <<CRON
# EMAPARFUMS otomatik guncelleme: her 2 dakikada GitHub'i kontrol eder.
*/2 * * * * root bash $DIR/autodeploy.sh
CRON
chmod 644 /etc/cron.d/emaparfums-autodeploy
touch /var/log/emaparfums-deploy.log
echo "Otomatik guncelleme kuruldu: her 2 dakikada GitHub kontrol edilir."
echo "Kayit: tail -n 20 /var/log/emaparfums-deploy.log"
# Kurulumda en güncel kod bir kez hemen derlenip canlıya alınır.
bash "$DIR/update.sh"
