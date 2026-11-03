#!/usr/bin/env node
/**
 * 海豹办公服务端部署脚本（固定生产环境连接信息，避免每次重新摸索）。
 *
 * 设计依据 server/README.md「部署、备份和回滚」：
 *   1. 新版本放在 releases/<版本>/，不要就地改 current；
 *   2. 补齐全部运行时依赖（nativeSealFormat.cjs、documentFormats.json、skinFormat.cjs 等）；
 *   3. 先在独立端口加载验证，通过后才切换 current；
 *   4. 任何一步失败立即保留旧 current，不留半成品。
 *
 * 用法：
 *   node scripts/deploy-server.cjs --check          只做只读体检，不改服务器
 *   node scripts/deploy-server.cjs --dry-run        打印将执行的动作
 *   node scripts/deploy-server.cjs                 正式部署
 *   node scripts/deploy-server.cjs --rollback      回滚到 previous-release
 *
 * 密码不写入本文件，通过环境变量 SEAL_DEPLOY_PASSWORD 提供，
 * 或用 --ask 交互输入（脚本一律不回显、不落盘）。
 */
const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// ── 生产服务器（写死，避免记错）──────────────────────────────
const SERVER = {
  host: '192.140.178.117',
  port: 22,
  user: 'root',
  // 站点根目录：releases/ 与 current 软链都在这里
  siteRoot: '/www/wwwroot/seal.xingmasoft.com',
  service: 'seal-cloud',
  // 生产 API 端口（systemd 里 node 监听 8298，Nginx 反代 /api）
  localPort: 8298,
  // 隔离验证端口：切换前用它确认新版本能真正启动
  verifyPort: 8791,
  publicUrl: 'https://seal.xingmasoft.com/api/v1/capabilities',
}

/**
 * 读取部署密码。优先级：环境变量 > .upgrade-private/deploy-server.json。
 * 凭据文件位于 .gitignore 中的 .upgrade-private/，不会进仓库；
 * 不再要求每次手动设环境变量，避免因为“找不到密码”而反复中断部署。
 */
function 读取部署密码() {
  if (process.env.SEAL_DEPLOY_PASSWORD) return process.env.SEAL_DEPLOY_PASSWORD
  const 凭据文件 = path.join(ROOT, '.upgrade-private/deploy-server.json')
  if (fs.existsSync(凭据文件)) {
    try {
      const 凭据 = JSON.parse(fs.readFileSync(凭据文件, 'utf8'))
      if (凭据.password) return String(凭据.password)
    } catch (error) {
      fail(`凭据文件解析失败：${凭据文件}\n${error.message}`)
    }
  }
  return ''
}

/** 服务端运行时必需文件。缺任何一个都会在启动时 MODULE_NOT_FOUND。 */
const REQUIRED_FILES = [
  // 核心
  'index.cjs', 'store.cjs', 'sms.cjs', 'formats.cjs', 'passwords.cjs',
  // 云空间与分享
  'shareLinks.cjs', 'collaboration.cjs', 'realtime.cjs',
  // 账号与注销
  'accountConversion.cjs', 'accountErasure.cjs', 'eraseRecords.cjs', 'eraseBackups.cjs',
  // 公开内容与原生格式校验
  'publicValidation.cjs', 'nativeCodec.cjs', 'nativeSealFormat.cjs',
  'skinFormat.cjs', 'converterAdmin.cjs', 'validateIsolated.cjs',
  // 数据与元数据
  'documentFormats.json', 'package.json',
]

/** 源文件 → 部署文件名的映射（仓库里叫法和服务端不一致的） */
const RENAME = {
  // 服务端要求根目录有 documentFormats.json
  'main/documentFormats.json': 'documentFormats.json',
  // 服务端要求 nativeSealFormat.cjs，内容来自桌面端 sealFormat.js
  'main/office/sealFormat.js': 'nativeSealFormat.cjs',
  // 皮肤格式校验：服务端与主进程共用同一份实现
  'server/skinFormat.cjs': 'skinFormat.cjs',
}

/** 需要整体搬运的子目录（相对 server/），内部结构保持不变。 */
const REQUIRED_DIRECTORIES = ['converter']

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, '.upgrade-private/deploy-server')

const log = (...args) => console.log(...args)
const fail = message => { throw new Error(message) }

function sshArgs(extra = []) {
  return [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'PreferredAuthentications=password',
    '-o', 'PubkeyAuthentication=no',
    '-o', 'NumberOfPasswordPrompts=1',
    '-o', 'ConnectTimeout=20',
    '-p', String(SERVER.port),
    `${SERVER.user}@${SERVER.host}`,
    ...extra,
  ]
}

/**
 * 自动应答密码。
 * Windows 自带的 OpenSSH 直接从终端读密码，不读 stdin，所以 spawnSync 的 input
 * 永远喂不进去，表现就是“卡住不动”。这里改用 SSH_ASKPASS：把密码写进一个
 * 临时 .cmd 助手脚本，设 SSH_ASKPASS_REQUIRE=force 后 ssh 会主动调用它取密码。
 * 助手脚本放在已被 .gitignore 忽略的 .upgrade-private/ 下。
 */
function installAskpass(password) {
  if (process.platform !== 'win32') return {}
  const askDir = path.join(ROOT, '.upgrade-private')
  fs.mkdirSync(askDir, { recursive: true })
  const askFile = path.join(askDir, 'ask.cmd')
  fs.writeFileSync(askFile, `@echo off\r\necho ${password}\r\n`, 'utf8')
  return { SSH_ASKPASS: askFile, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'localhost:0' }
}

/** 部署机侧执行；密码经 ASKPASS 提供，不出现在进程参数里。 */
function runRemote(command, { password, check = false } = {}) {
  if (!password) fail('缺少服务器密码：请在 .upgrade-private/deploy-server.json 写入 password，或设置环境变量 SEAL_DEPLOY_PASSWORD')
  const result = spawnSync('ssh', sshArgs([command]), {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, ...installAskpass(password) },
  })
  if (check) return { code: result.status, out: (result.stdout || '') + (result.stderr || '') }
  if (result.status !== 0) {
    fail(`远程命令失败（退出码 ${result.status}）：${command}\n${result.stderr || result.stdout}`)
  }
  return result.stdout || ''
}

/** 收集并校验本地待部署文件；缺文件立即中止，绝不上传残缺版本。 */
function collect() {
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  const missing = []
  for (const name of REQUIRED_FILES) {
    // 已在 RENAME 中声明的，来源路径单独解析
    const source = Object.entries(RENAME).find(([, target]) => target === name)?.[0] ?? `server/${name}`
    const absolute = path.join(ROOT, source)
    if (!fs.existsSync(absolute)) { missing.push(`${name}（期望来源 ${source}）`); continue }
    fs.copyFileSync(absolute, path.join(OUT, name))
  }
  for (const directory of REQUIRED_DIRECTORIES) {
    const absolute = path.join(ROOT, 'server', directory)
    if (!fs.existsSync(absolute)) { missing.push(`${directory}/（期望来源 server/${directory}）`); continue }
    fs.cpSync(absolute, path.join(OUT, directory), { recursive: true })
  }
  if (missing.length) {
    fail('以下服务端必需文件缺失，拒绝部署：\n  - ' + missing.join('\n  - '))
  }
  // 加载期依赖自检：把 require 链上出现的 ./xxx.cjs 全部比对一遍
  const referenced = new Set()
  for (const file of fs.readdirSync(OUT).filter(name => name.endsWith('.cjs'))) {
    const code = fs.readFileSync(path.join(OUT, file), 'utf8')
    for (const match of code.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)) referenced.add(match[1])
  }
  const unresolved = [...referenced].filter(name => !fs.existsSync(path.join(OUT, name)))
  if (unresolved.length) {
    fail('以下被 require 的文件没有打进部署包，会在启动时崩溃：\n  - ' + unresolved.join('\n  - '))
  }
  return { directory: OUT, files: fs.readdirSync(OUT), referenced: [...referenced] }
}

// ── 管理后台静态站点 ─────────────────────────────────────
// Nginx 把站点根路径指向 <siteRoot>/admin，但后台是 Vite 产物，不属于后端
// releases/ 的发布流程。此前部署脚本只同步后端，导致线上 /assets/*.js 全部
// 404 并回落 index.html，管理后台因脚本加载失败而白屏。
const ADMIN = {
  // 本地构建产物
  source: 'server/admin/dist',
  // 服务器上 nginx root 指向的目录（与 deploy/nginx-https.conf 的 root 一致）
  target: 'admin',
  // 后台资源 location 补丁：主配置的 js/css/png 正则缺 root，会把请求回落到
  // server 级 root，导致 /assets/*.js 404、后台白屏。该补丁放进 extension 目录，
  // 由站点主配置 include，且宝塔重建站点时不会覆盖。
  nginxPatch: 'server/deploy/nginx-admin-assets.conf',
  nginxTarget: '/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com/10-admin-assets.conf',
}

/** 校验本地后台产物存在且入口资源齐全；缺失就拒绝部署，不推半成品上去。 */
function collectAdmin() {
  const dist = path.join(ROOT, ADMIN.source)
  if (!fs.existsSync(dist)) {
    fail(`管理后台构建产物不存在：${ADMIN.source}\n请先在 server/admin 下执行构建，或确认 dist 已随仓库提供。`)
  }
  const indexFile = path.join(dist, 'index.html')
  if (!fs.existsSync(indexFile)) fail(`管理后台缺少 index.html：${ADMIN.source}`)
  // index.html 引用的 /assets/* 必须真实存在，否则线上仍然白屏
  const html = fs.readFileSync(indexFile, 'utf8')
  const referenced = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(match => match[1])
  if (referenced.length === 0) fail('管理后台 index.html 未引用任何 /assets 资源，产物可能不完整')
  const missing = referenced.filter(name => !fs.existsSync(path.join(dist, 'assets', name)))
  if (missing.length) {
    fail('管理后台 index.html 引用的资源缺失，部署后仍会白屏：\n  - ' + missing.join('\n  - '))
  }
  return { dist, referenced }
}

function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--check') ? 'check'
    : args.includes('--rollback') ? 'rollback'
      : args.includes('--dry-run') ? 'dry-run' : 'deploy'
  const password = 读取部署密码()
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const release = `releases/${version}-backend-${stamp}`

  // 0) 管理后台静态站点：与后端发布流程解耦，独立同步
  //    先做本地校验，产物不完整时不会走到后端上传，避免只部署一半。
  const adminInfo = collectAdmin()
  log(`\n管理后台 ${ADMIN.source} → ${SERVER.siteRoot}/${ADMIN.target}`)
  adminInfo.referenced.forEach(name => log('  assets/' + name))
  log(`站点    ${SERVER.siteRoot}`)
  log(`版本    ${version}`)
  log(`模式    ${mode}`)

  if (mode === 'check') {
    const out = runRemote(
      `systemctl is-active ${SERVER.service}; readlink ${SERVER.siteRoot}/current; ` +
      `cat ${SERVER.siteRoot}/previous-release 2>/dev/null; ` +
      `curl -s -o /dev/null -w 'local=%{http_code}\\n' http://127.0.0.1:${SERVER.localPort}/api/v1/capabilities`,
      { password, check: true },
    )
    log('\n--- 只读体检 ---')
    log(out.out.trim())
    log(`公网 ${SERVER.publicUrl}`)
    log(execFileSync('curl', ['-s', '-o', '/dev/null', '-w', 'http=%{http_code}', SERVER.publicUrl], { encoding: 'utf8' }).trim())
    return
  }

  if (mode === 'rollback') {
    const previous = runRemote(`cat ${SERVER.siteRoot}/previous-release`, { password }).trim()
    if (!previous) fail('服务器上没有 previous-release 记录，无法自动回滚')
    log(`回滚到 ${previous}`)
    runRemote(
      `cd ${SERVER.siteRoot} && ln -sfn ${SERVER.siteRoot}/${previous} current && ` +
      `systemctl restart ${SERVER.service} && sleep 4 && systemctl is-active ${SERVER.service}`,
      { password },
    )
    log('回滚完成')
    return
  }

  const collected = collect()
  log(`\n本地待部署 ${collected.files.length} 个文件，require 链共 ${collected.referenced.length} 项，均已解析`)
  if (mode === 'dry-run') {
    log('将执行：上传 → 解压到 ' + release + ' → 隔离端口 ' + SERVER.verifyPort + ' 验证 → 切换 current → 重启')
    collected.files.forEach(name => log('  ' + name))
    return
  }

  // 1) 上传部署包
  const archive = path.join(ROOT, '.upgrade-private/deploy-server.zip')
  fs.rmSync(archive, { force: true })
  execFileSync(process.platform === 'win32' ? 'powershell' : 'zip', process.platform === 'win32'
    ? ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${archive}' -Force`]
    : ['-qr', archive, '.'], { cwd: OUT, stdio: 'inherit' })
  log(`\n部署包 ${archive}`)

  const scp = spawnSync('scp', [
    '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password',
    '-o', 'PubkeyAuthentication=no', '-P', String(SERVER.port),
    archive, `${SERVER.user}@${SERVER.host}:/tmp/deploy-server.zip`,
  ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...installAskpass(password) } })
  if (scp.status !== 0) fail('上传失败：' + (scp.stderr || scp.stdout))

  // 2) 管理后台：先打包上传，再解压到站点根下的 admin 目录。
  //    解压前先清空旧目录，避免上一版的 assets 残留导致页面引用错版本而白屏。
  if (mode === 'deploy') {
    const adminArchive = path.join(ROOT, '.upgrade-private/deploy-admin.zip')
    fs.rmSync(adminArchive, { force: true })
    execFileSync(process.platform === 'win32' ? 'powershell' : 'zip', process.platform === 'win32'
      ? ['-NoProfile', '-Command', `Compress-Archive -Path '${adminInfo.dist}\\*' -DestinationPath '${adminArchive}' -Force`]
      : ['-qr', adminArchive, '.'], { cwd: adminInfo.dist, stdio: 'inherit' })
    const adminScp = spawnSync('scp', [
      '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password',
      '-o', 'PubkeyAuthentication=no', '-P', String(SERVER.port),
      adminArchive, `${SERVER.user}@${SERVER.host}:/tmp/deploy-admin.zip`,
    ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...installAskpass(password) } })
    if (adminScp.status !== 0) fail('管理后台上传失败：' + (adminScp.stderr || adminScp.stdout))
    runRemote([
      `set -e`,
      `cd ${SERVER.siteRoot}`,
      `rm -rf ${ADMIN.target}.next && mkdir -p ${ADMIN.target}.next`,
      `unzip -oq /tmp/deploy-admin.zip -d ${ADMIN.target}.next`,
      // 原子替换：先建新目录再换名，避免替换中突出现短暂 404
      `rm -rf ${ADMIN.target}.old && mv ${ADMIN.target} ${ADMIN.target}.old 2>/dev/null || true`,
      `mv ${ADMIN.target}.next ${ADMIN.target}`,
      `rm -rf ${ADMIN.target}.old`,
    ].join(' && '), { password })
    log('管理后台已同步到 ' + SERVER.siteRoot + '/' + ADMIN.target)

    // 同步 nginx 资源规则补丁并重载，避免改完产物仍因 location 缺 root 而 404
    const patchFile = path.join(ROOT, ADMIN.nginxPatch)
    if (fs.existsSync(patchFile)) {
      const patchScp = spawnSync('scp', [
        '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password',
        '-o', 'PubkeyAuthentication=no', '-P', String(SERVER.port),
        patchFile, `${SERVER.user}@${SERVER.host}:${ADMIN.nginxTarget}`,
      ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...installAskpass(password) } })
      if (patchScp.status !== 0) fail('nginx 资源规则上传失败：' + (patchScp.stderr || patchScp.stdout))
      const reload = runRemote('nginx -t && systemctl reload nginx && echo NGINX_RELOADED', { password })
      if (!/NGINX_RELOADED/.test(reload)) fail('nginx 重载失败：' + reload)
      log('nginx 资源规则已更新并重载')
    } else {
      log('未找到 nginx 资源规则补丁，跳过：' + ADMIN.nginxPatch)
    }
  }

  // 3) 建版本目录、解压、加载验证（不碰 current）
  runRemote([
    `set -e`,
    `cd ${SERVER.siteRoot}`,
    `mkdir -p ${release}`,
    `cp -a current/. ${release}/   # 先继承旧版本的 node_modules 等运行时依赖`,
    `unzip -oq /tmp/deploy-server.zip -d ${release}`,
    `cd ${release} && for f in *.cjs; do node --check "$f"; done`,
    // 关键：真实加载一次，能捕获 MODULE_NOT_FOUND 这类语法检查发现不了的问题
    `cd ${release} && PORT=${SERVER.verifyPort} SEAL_DATA_DIR=${SERVER.siteRoot}/data node -e "require('./index.cjs')" >/tmp/verify-load.log 2>&1 || (cat /tmp/verify-load.log; exit 1)`,
  ].join(' && '), { password })
  log('新版本语法检查与加载验证通过')

  // 4) 切换并重启
  //    重启后一并校验后台首屏与它引用的脚本，避免「服务是活的但页面白屏」被当成成功。
  //    用 nginx 实际服务的地址探测，而不是只看后端进程状态。
  const adminProbe = [
    "curl -s -o /dev/null -w 'admin=%{http_code}\\n' http://127.0.0.1/",
    ...adminInfo.referenced.map((name) =>
      `curl -s -o /dev/null -w 'asset-${name}=%{http_code}\\n' http://127.0.0.1/assets/${name}`),
  ].join('; ')
  runRemote([
    `set -e`,
    `cd ${SERVER.siteRoot}`,
    `readlink current | sed 's|${SERVER.siteRoot}/||' > previous-release`,
    `chown -R seal-cloud:seal-cloud ${release}`,
    `ln -sfn ${SERVER.siteRoot}/${release} current`,
    `systemctl restart ${SERVER.service}`,
    `sleep 5`,
    `systemctl is-active ${SERVER.service}`,
    `curl -s http://127.0.0.1:${SERVER.localPort}/api/v1/capabilities`,
    adminProbe,
  ].join(' && '), { password })
  log('切换完成')
}

try { main() } catch (error) { console.error('\n部署中止：' + error.message); process.exitCode = 1 }
