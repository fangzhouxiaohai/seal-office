#!/bin/bash
set -eu
site=/www/wwwroot/seal.xingmasoft.com
backup=/www/backup/seal-cloud
test -d "$site/data"
install -d -m 700 "$backup"
systemctl stop seal-cloud.service
trap 'systemctl start seal-cloud.service' EXIT
archive="$backup/$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$archive.partial" -C "$site" data
chmod 600 "$archive.partial"
mv "$archive.partial" "$archive"
systemctl start seal-cloud.service
trap - EXIT
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8096/v1/capabilities >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent --max-time 5 http://127.0.0.1:8096/v1/capabilities >/dev/null
find "$backup" -maxdepth 1 -type f -name '*.tar.gz' -mmin +8640 -delete
