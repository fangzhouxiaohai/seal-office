#!/bin/bash
set -e
R=/www/wwwroot/seal.xingmasoft.com
N=$R/releases/2.5.1-live
BASE=$R/releases/2.1.1-backend-identity-20261021-191812

echo "=== 1. 从完整旧版本建立基线 ==="
rm -rf "$N"
mkdir -p "$N"
cp -a "$BASE/." "$N/"
echo "基线: $BASE"
echo -n "node_modules 存在: "; [ -d "$N/node_modules" ] && echo yes || echo no

echo "=== 2. 解压部署包 ==="
unzip -oq /tmp/ds.zip -d "$N"

echo "=== 3. 关键文件确认 ==="
cd "$N"
for f in index.cjs store.cjs shareLinks.cjs skinFormat.cjs skinFormat.js nativeSealFormat.cjs documentFormats.json converter/index.cjs; do
  if [ -f "$f" ]; then echo "OK  $f"; else echo "MISS $f"; exit 1; fi
done
echo -n "方法覆盖: "; grep -c "x-seal-method-override" index.cjs

echo "=== 4. 真实加载验证 ==="
cd "$N"
PORT=8791 SEAL_DATA_DIR="$R/data" timeout 15 node index.cjs > /tmp/v3.log 2>&1 &
VPID=$!
sleep 11
if kill -0 $VPID 2>/dev/null; then
  echo "加载成功（进程存活）"
  kill $VPID 2>/dev/null || true
else
  echo "启动失败，日志："
  cat /tmp/v3.log
  exit 1
fi
wait $VPID 2>/dev/null || true

echo "=== 5. 切换并重启 ==="
cd "$R"
readlink current | sed "s|$R/||" > previous-release
chown -R seal-cloud:seal-cloud "$N"
ln -sfn "$N" current
systemctl restart seal-cloud
sleep 10
echo -n "服务状态: "; systemctl is-active seal-cloud
echo -n "本地接口: "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8298/api/v1/capabilities
echo -n "公网接口: "; curl -s -o /dev/null -w "%{http_code}\n" https://seal.xingmasoft.com/api/v1/capabilities
echo "=== 完成 ==="
