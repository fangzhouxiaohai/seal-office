#!/bin/bash
# 海豹办公云端健康检查（每小时）：备份过期清理、API 存活、证书余量、磁盘余量
set -eu
backup=/www/backup/seal-cloud
if [ -d "$backup" ]; then find "$backup" -maxdepth 1 -type f -name '*.tar.gz' -mmin +8640 -delete; fi
curl --fail --silent --max-time 15 http://127.0.0.1:8097/v1/capabilities >/dev/null
echo | openssl s_client -servername seal.xingmasoft.com -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -checkend 1209600
available=$(df -Pk /www/wwwroot/seal.xingmasoft.com | awk 'NR==2 {print $4}')
test "$available" -gt 2097152
