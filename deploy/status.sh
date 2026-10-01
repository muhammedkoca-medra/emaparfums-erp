#!/usr/bin/env bash
# EMAPARFUMS — güncelleme ve servis durumu.
cd "$(dirname "$0")"
if pgrep -f "docker-compose.prod.yml up" > /dev/null; then
  echo "Derleme SURUYOR... birazdan tekrar bakin."
else
  echo "Derleme BITTI."
fi
echo "--- son log satirlari ---"
tail -n 6 /tmp/deploy.log 2>/dev/null || echo "(log yok)"
echo "--- servisler ---"
docker compose -f docker-compose.prod.yml ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
