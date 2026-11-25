#!/bin/bash
# 缺失对象只读核查（2.8.0 计划 5.1 第 4 步）：列出数据库引用但 data/objects 下不存在的对象，
# 输出版本、节点、用户、时间与引用来源。只读：不修改数据库，不删除、不补写任何文件。
# 用法（服务器 root）：bash check-missing-objects.sh [输出.tsv]
set -eu
data=${SEAL_DATA_DIR:-/www/wwwroot/seal.xingmasoft.com/data}
out=${1:-/root/seal-missing-objects-$(date +%Y%m%d%H%M%S).tsv}
test -d "$data/objects"
query() {
  mysql --batch --skip-column-names seal_cloud -e "
    SELECT 'versions', id, node_id, user_id, \`blob\`, FROM_UNIXTIME(created/1000) FROM versions
    UNION ALL SELECT 'team_versions', id, node_id, actor_id, \`blob\`, FROM_UNIXTIME(created/1000) FROM team_versions
    UNION ALL SELECT 'publications', id, IFNULL(node_id,''), user_id, \`blob\`, FROM_UNIXTIME(created/1000) FROM publications WHERE \`blob\` <> ''"
}
printf '来源\t记录\t节点\t用户\t对象\t创建时间\n' > "$out"
total=0; missing=0
while IFS=$'\t' read -r source id node user blob created; do
  total=$((total + 1))
  if [ ! -f "$data/objects/$blob" ]; then
    missing=$((missing + 1))
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$source" "$id" "$node" "$user" "$blob" "$created" >> "$out"
  fi
done < <(query)
chmod 600 "$out"
echo "引用对象 $total 个，缺失 $missing 个，清单：$out"
