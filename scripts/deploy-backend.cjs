#!/usr/bin/env node
/**
 * 海豹办公后端部署：Spring Boot 云服务（seal-server）+ 管理后台（seal-admin-web）。
 *
 * 用法：
 *   node scripts/deploy-backend.cjs --check            只读体检：服务状态、版本摘要、公网入口、nginx 上游、旧服务残留
 *   node scripts/deploy-backend.cjs --dry-run          本地构建并打包，打印将执行的远程脚本，不连接服务器
 *   node scripts/deploy-backend.cjs                    构建 → 上传 → 备份 → 替换 → 重启 → 验收，失败自动回滚
 *   node scripts/deploy-backend.cjs --skip-build       使用现有 target/*.jar 与 seal-admin-web/dist 部署
 *   node scripts/deploy-backend.cjs --retire-legacy    确认 /api/ 已指向 8097 后，停用并禁止自启旧 Node(8096) 与 PHP 后台服务（不删除文件）
 *
 * 凭据：环境变量 SEAL_DEPLOY_PASSWORD，或 .upgrade-private/deploy-server.json 的 password（该目录已被 .gitignore 排除）。
 * 密码只通过 SSH_ASKPASS 助手经子进程环境传递，不出现在命令行参数，也不写入文件。
 */
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const SERVER = {
  host: '103.236.97.150',
  port: 22,
  user: 'root',
  siteRoot: '/www/wwwroot/seal.xingmasoft.com',
  jar: '/www/server/java_project/seal-server/seal-server.jar',
  // Java 进程自 2026-11-23 起由宝塔「Java 项目」登记托管，单元名为 spring_<项目名>
  service: 'spring_seal-cloud',
  localPort: 8097,
  publicBase: 'https://seal.xingmasoft.com',
  nginxExtension: '/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com',
  legacyServices: ['seal-cloud.service', 'seal-admin-php.service'],
}
const ADMIN_TITLE = '海豹办公云端管理'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'"

function parseArgs(argv) {
  const known = new Set(['--check', '--dry-run', '--skip-build', '--skip-tests', '--retire-legacy'])
  for (const arg of argv) if (!known.has(arg)) throw new Error('未知参数：' + arg)
  return {
    check: argv.includes('--check'),
    dryRun: argv.includes('--dry-run'),
    skipBuild: argv.includes('--skip-build'),
    skipTests: argv.includes('--skip-tests'),
    retireLegacy: argv.includes('--retire-legacy'),
  }
}

function readCredentials() {
  const file = path.join(ROOT, '.upgrade-private/deploy-server.json')
  let stored = {}
  if (fs.existsSync(file)) stored = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
  const password = process.env.SEAL_DEPLOY_PASSWORD || stored.password || ''
  if (!password) throw new Error('缺少服务器密码：设置 SEAL_DEPLOY_PASSWORD，或在 .upgrade-private/deploy-server.json 写入 password')
  return { password, host: stored.host || SERVER.host, user: stored.user || SERVER.user, port: Number(stored.port || SERVER.port) }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' && /^(npm|mvn)$/.test(command), ...options })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败：${(result.stderr || result.stdout || result.error?.message || '').trim().slice(-2000)}`)
  }
  return result.stdout || ''
}

/** 本地构建：后端全量测试后打包，管理后台 npm ci + build。 */
function build({ skipTests }) {
  console.log('== 构建 seal-server' + (skipTests ? '（跳过测试）' : '（含全量测试）'))
  run('mvn', ['-q', '-B', ...(skipTests ? ['-DskipTests'] : []), 'package'], { cwd: path.join(ROOT, 'seal-server'), stdio: ['ignore', 'pipe', 'pipe'] })
  console.log('== 构建 seal-admin-web')
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: path.join(ROOT, 'seal-admin-web') })
  run('npm', ['run', 'build'], { cwd: path.join(ROOT, 'seal-admin-web') })
}

/** 找出可执行 jar 与后台产物，并做内容校验。 */
function locateArtifacts() {
  const target = path.join(ROOT, 'seal-server/target')
  const jars = fs.existsSync(target) ? fs.readdirSync(target).filter(name => /^seal-server(-[^/]+)?\.jar$/.test(name) && !name.endsWith('.original')) : []
  if (jars.length !== 1) throw new Error('seal-server/target 下应恰有一个可执行 jar，实际：' + (jars.join('、') || '无'))
  const jar = path.join(target, jars[0])
  const jarBytes = fs.readFileSync(jar)
  if (jarBytes.subarray(0, 2).toString('latin1') !== 'PK' || jarBytes.length < 10 * 1024 * 1024) throw new Error('jar 文件异常：' + jar)
  const dist = path.join(ROOT, 'seal-admin-web/dist')
  const index = path.join(dist, 'index.html')
  if (!fs.existsSync(index)) throw new Error('管理后台未构建：缺少 seal-admin-web/dist/index.html')
  const html = fs.readFileSync(index, 'utf8')
  if (!html.includes(ADMIN_TITLE)) throw new Error('管理后台入口标题不正确')
  const entry = html.match(/src="\/admin\/(assets\/[^"]+\.js)"/)
  if (!entry || !fs.existsSync(path.join(dist, entry[1]))) throw new Error('管理后台入口脚本缺失')
  return { jar, jarSha: sha256(jarBytes), dist, adminEntry: '/admin/' + entry[1], adminEntrySha: sha256(fs.readFileSync(path.join(dist, entry[1]))) }
}

/** 部署远程脚本：备份 → 替换 → 重启 → 本机与公网验收；任一步失败恢复原 jar 与后台目录。 */
function deployScript({ id, remote, jarSha, adminEntry, adminEntrySha }) {
  const s = SERVER
  return `set -eu
SITE=${quote(s.siteRoot)}; REMOTE=${quote(remote)}; JAR=${quote(s.jar)}; ID=${quote(id)}
cd "$REMOTE"
tar -xf release.tar
test "$(sha256sum seal-server.jar | cut -d' ' -f1)" = ${quote(jarSha)}
test -f admin/index.html
grep -q ${quote(ADMIN_TITLE)} admin/index.html
test -f "$JAR"
test -d "$SITE/admin"
cp -a "$JAR" "$REMOTE/previous-seal-server.jar"
cp -a "$SITE/admin" "$SITE/admin.backup-$ID"
restore() {
  echo '!! 验收失败，恢复原版本'
  cp -a "$REMOTE/previous-seal-server.jar" "$JAR"
  if [ -d "$SITE/admin.backup-$ID" ]; then rm -rf "$SITE/admin.failed-$ID"; [ -d "$SITE/admin" ] && mv "$SITE/admin" "$SITE/admin.failed-$ID"; cp -a "$SITE/admin.backup-$ID" "$SITE/admin"; fi
  systemctl restart ${quote(s.service)} || true
}
trap restore ERR
cp seal-server.jar "$JAR.next"
chown --reference="$JAR" "$JAR.next"
chmod --reference="$JAR" "$JAR.next"
mv -f "$JAR.next" "$JAR"
rm -rf "$SITE/admin.next-$ID"
cp -a admin "$SITE/admin.next-$ID"
chown -R --reference="$SITE/admin" "$SITE/admin.next-$ID"
mv "$SITE/admin" "$SITE/admin.replaced-$ID"
mv "$SITE/admin.next-$ID" "$SITE/admin"
rm -rf "$SITE/admin.replaced-$ID"
systemctl restart ${quote(s.service)}
ok=0
for i in $(seq 1 60); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:${s.localPort}/v1/capabilities >/dev/null; then ok=1; break; fi
  sleep 2
done
test "$ok" = 1
systemctl is-active --quiet ${quote(s.service)}
curl --fail --silent --max-time 15 ${quote(s.publicBase + '/api/v1/capabilities')} | grep -q '"version"'
curl --fail --silent --max-time 15 ${quote(s.publicBase + '/admin/')} | grep -q ${quote(ADMIN_TITLE)}
test "$(curl --fail --silent --max-time 15 ${quote(s.publicBase + adminEntry)} | sha256sum | cut -d' ' -f1)" = ${quote(adminEntrySha)}
code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 ${quote(s.publicBase + '/api/v1/admin/overview/stats')})
test "$code" = 401
trap - ERR
rm -f release.tar
# 后台目录只保留最近 3 份备份
ls -1d "$SITE"/admin.backup-* 2>/dev/null | sort | head -n -3 | xargs -r rm -rf
echo "部署完成：$ID"
`
}

/** 只读体检脚本。 */
function checkScript() {
  const s = SERVER
  return `set -u
echo "服务 ${s.service}: $(systemctl is-active ${quote(s.service)} 2>&1)"
echo "jar 摘要: $(sha256sum ${quote(s.jar)} 2>&1 | cut -d' ' -f1)"
echo "jar 修改时间: $(stat -c %y ${quote(s.jar)} 2>&1)"
echo "本机接口: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:${s.localPort}/v1/capabilities)"
echo "公网接口: $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 ${quote(s.publicBase + '/api/v1/capabilities')})"
echo "公网后台: $(curl -s --max-time 15 ${quote(s.publicBase + '/admin/')} | grep -o '<title>[^<]*</title>')"
echo "数据概览统计接口(未登录应 401): $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 ${quote(s.publicBase + '/api/v1/admin/overview/stats')})"
echo "nginx 上游端口: $(grep -ho 'proxy_pass http://127.0.0.1:[0-9]*' ${quote(s.nginxExtension)}/*.conf 2>/dev/null | sort | uniq -c | tr '\\n' ';')"
${s.legacyServices.map(name => `echo "旧服务 ${name}: $(systemctl is-active ${quote(name)} 2>&1) / 自启 $(systemctl is-enabled ${quote(name)} 2>&1)"`).join('\n')}
echo "旧 Node 8096 监听: $(ss -ltn 2>/dev/null | grep -c ':8096 ' || true)"
`
}

/** 停用旧 Node/PHP 服务：先确认 nginx 不再引用 8096 和 PHP 后台。 */
function retireScript() {
  const s = SERVER
  return `set -eu
EXT=${quote(s.nginxExtension)}
if grep -rq '127.0.0.1:8096' "$EXT"; then echo '!! nginx 仍有指向 8096 的上游，拒绝停用旧服务'; grep -rn '127.0.0.1:8096' "$EXT"; exit 1; fi
if grep -rqi 'seal-admin-php\\|location ^~ /seal-admin/' "$EXT"; then echo '!! nginx 仍有旧 PHP 后台路由，拒绝停用'; exit 1; fi
curl --fail --silent --max-time 15 ${quote(s.publicBase + '/api/v1/capabilities')} >/dev/null
for unit in ${s.legacyServices.map(quote).join(' ')}; do
  if systemctl list-unit-files "$unit" >/dev/null 2>&1 && systemctl list-unit-files "$unit" | grep -q "$unit"; then
    systemctl disable --now "$unit" && echo "已停用：$unit"
  else
    echo "不存在：$unit"
  fi
done
sleep 2
curl --fail --silent --max-time 15 ${quote(s.publicBase + '/api/v1/capabilities')} >/dev/null && echo '停用后公网接口仍正常'
`
}

function sshSession(credentials, id) {
  const askDir = path.join(ROOT, '.upgrade-private')
  fs.mkdirSync(askDir, { recursive: true, mode: 0o700 })
  const ask = path.join(askDir, `backend-ask-${id}${process.platform === 'win32' ? '.cmd' : '.sh'}`)
  if (process.platform === 'win32') fs.writeFileSync(ask, '@echo off\r\nnode -e "process.stdout.write(process.env.SEAL_DEPLOY_PASSWORD)"\r\n')
  else { fs.writeFileSync(ask, '#!/bin/sh\nprintf %s "$SEAL_DEPLOY_PASSWORD"\n'); fs.chmodSync(ask, 0o700) }
  const env = { ...process.env, SEAL_DEPLOY_PASSWORD: credentials.password, SSH_ASKPASS: ask, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: process.env.DISPLAY || 'localhost:0' }
  const common = ['-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no', '-o', 'NumberOfPasswordPrompts=1', '-o', 'ConnectTimeout=20']
  const target = `${credentials.user}@${credentials.host}`
  return {
    ssh: script => run('ssh', ['-T', ...common, '-p', String(credentials.port), target, 'bash -s'], { input: script, env }),
    scp: (local, remote) => run('scp', [...common, '-P', String(credentials.port), local, `${target}:${remote}`], { env }),
    close: () => fs.rmSync(ask, { force: true }),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomBytes(3).toString('hex')
  if (options.check || options.retireLegacy) {
    const session = sshSession(readCredentials(), id)
    try {
      if (options.retireLegacy) console.log(session.ssh(retireScript()))
      console.log(session.ssh(checkScript()))
    } finally { session.close() }
    return
  }
  if (!options.skipBuild) build(options)
  const artifacts = locateArtifacts()
  const remote = `${SERVER.siteRoot}/backend-releases/${id}`
  const script = deployScript({ id, remote, ...artifacts })
  console.log(`jar: ${path.basename(artifacts.jar)} sha256=${artifacts.jarSha}`)
  console.log(`后台入口: ${artifacts.adminEntry} sha256=${artifacts.adminEntrySha}`)
  if (options.dryRun) { console.log('--- 将在服务器执行 ---\n' + script); return }

  const stage = path.join(ROOT, '.upgrade-private', 'backend-release-' + id)
  const archive = stage + '.tar'
  const session = sshSession(readCredentials(), id)
  try {
    fs.mkdirSync(stage, { recursive: true })
    fs.copyFileSync(artifacts.jar, path.join(stage, 'seal-server.jar'))
    fs.cpSync(artifacts.dist, path.join(stage, 'admin'), { recursive: true })
    run('tar', ['-cf', archive, '-C', stage, '.'])
    session.ssh(`set -eu\nmkdir -p ${quote(SERVER.siteRoot + '/backend-releases')}\ntest ! -e ${quote(remote)}\nmkdir ${quote(remote)}\n`)
    session.scp(archive, `${remote}/release.tar`)
    console.log(session.ssh(script))
    console.log(session.ssh(checkScript()))
  } finally {
    session.close()
    fs.rmSync(archive, { force: true })
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

if (require.main === module) main().catch(error => { console.error('后端部署中止：' + error.message); process.exitCode = 1 })
module.exports = { parseArgs, deployScript, checkScript, retireScript, locateArtifacts }
