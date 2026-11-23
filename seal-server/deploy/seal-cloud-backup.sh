#!/bin/bash
# 海豹办公云端每日备份（MySQL 版）：库结构数据 mysqldump + 数据目录整包，保留 6 天
set -eu
site=/www/wwwroot/seal.xingmasoft.com
backup=/www/backup/seal-cloud
test -d "$site/data"
install -d -m 700 "$backup"
archive="$backup/$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
stage=$(mktemp -d /tmp/seal-backup-XXXXXX)
trap 'rm -rf "$stage"' EXIT
mysqldump --single-transaction --skip-comments --complete-insert seal_cloud > "$stage/seal_cloud.sql"
chmod 600 "$stage/seal_cloud.sql"
tar -czf "$archive.partial" -C "$site" data -C "$stage" seal_cloud.sql
chmod 600 "$archive.partial"
mv "$archive.partial" "$archive"
curl --fail --silent --max-time 15 http://127.0.0.1:8097/v1/capabilities >/dev/null
find "$backup" -maxdepth 1 -type f -name '*.tar.gz' -mmin +8640 -delete
