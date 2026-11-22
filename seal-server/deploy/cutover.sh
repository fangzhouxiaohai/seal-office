#!/bin/bash
# 海豹办公后端灰度切换：/api/ 上游 8096(Node) ↔ 8097(Spring Boot)
# 用法：bash cutover.sh <8096|8097>
# 只改 nginx 扩展配置中的上游端口，nginx -t 校验通过才 reload；失败自动还原。
set -e
PORT="${1:?用法：bash cutover.sh <8096|8097>}"
if [ "$PORT" != "8096" ] && [ "$PORT" != "8097" ]; then echo "端口只能是 8096 或 8097"; exit 1; fi
EXT=/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com
BACKUP=$(mktemp -d)
cp -a "$EXT"/. "$BACKUP"/
restore() { cp -a "$BACKUP"/. "$EXT"/; /www/server/nginx/sbin/nginx -s reload 2>/dev/null; echo "已还原配置"; rm -rf "$BACKUP"; exit 1; }
# 主业务与附件两条上游一起切换
sed -i -E "s#proxy_pass http://127.0.0.1:80(96|97)#proxy_pass http://127.0.0.1:$PORT#g" "$EXT"/seal-office-app.conf "$EXT"/20-release-assets.conf
grep -q "127.0.0.1:$PORT" "$EXT"/seal-office-app.conf || restore
/www/server/nginx/sbin/nginx -t || restore
/www/server/nginx/sbin/nginx -s reload || restore
sleep 2
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://seal.xingmasoft.com/api/v1/capabilities")
if [ "$CODE" != "200" ]; then echo "切换后能力集不可达（$CODE），执行回滚"; restore; fi
echo "已切换到 127.0.0.1:$PORT，能力集 200"
rm -rf "$BACKUP"
