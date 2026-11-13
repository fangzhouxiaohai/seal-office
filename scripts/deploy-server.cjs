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
const { createHash } = require('node:crypto')
const fs = require('fs')
const path = require('path')
const { verifyManifest } = require('./admin-build-manifest.cjs')

// ── 生产服务器（写死，避免记错）──────────────────────────────
const SERVER = {
  host: '192.140.178.117',
  port: 22,
  user: 'root',
  // 站点根目录：releases/ 与 current 软链都在这里
  siteRoot: '/www/wwwroot/seal.xingmasoft.com',
  service: 'seal-cloud',
  // 主 API 为 8096；8298 是独立文档转换网关，不能用于版本发布验收。
  localPort: 8096,
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
  'index.cjs', 'store.cjs', 'adminAccess.cjs', 'sms.cjs', 'formats.cjs', 'passwords.cjs',
  // 云空间与分享
  'shareLinks.cjs', 'myShares.cjs', 'collaboration.cjs', 'realtime.cjs',
  // 账号与注销
  'accountConversion.cjs', 'accountErasure.cjs', 'eraseRecords.cjs', 'eraseBackups.cjs',
  // 公开内容与原生格式校验
  'publicValidation.cjs', 'nativeCodec.cjs', 'nativeSealFormat.cjs',
  'skinFormat.cjs', 'converterAdmin.cjs', 'validateIsolated.cjs',
  'releases.cjs', 'releaseAssets.cjs',
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
 * 临时 .cmd 助手只从子进程环境中读取密码，不把密码文本写入文件。
 * 助手放在 .upgrade-private/，结束后删除。
 */
function installAskpass(password) {
  if (process.platform !== 'win32') return {}
  const askDir = path.join(ROOT, '.upgrade-private')
  fs.mkdirSync(askDir, { recursive: true })
  const askFile = path.join(askDir, 'ask.cmd')
  fs.writeFileSync(askFile, '@echo off\r\nnode -e "process.stdout.write(process.env.SEAL_DEPLOY_PASSWORD)"\r\n', 'utf8')
  return { SSH_ASKPASS: askFile, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'localhost:0', SEAL_DEPLOY_PASSWORD: password }
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

/** 配置备份放在发布目录之外，重复部署复制 current 时不会继承并累积旧备份。 */
function createDeploymentConfigBackup({ siteRoot, release, stamp, targets }) {
  if (!path.isAbsolute(siteRoot) || !/^releases\/[A-Za-z0-9_.-]+$/.test(release) || !/^\d{14}$/.test(stamp) || !release.endsWith('-' + stamp)) throw new Error('本次部署备份标识无效')
  return { directory: path.posix.join(siteRoot.replace(/\\/g, '/'), 'deployment-config-backups', path.posix.basename(release)), targets }
}

/** 备份确切的配置文件及其原先不存在状态；函数也在服务器的 Node 进程中执行。 */
function backupDeploymentFiles({ directory, targets }) {
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
  if (!path.isAbsolute(directory) || !Array.isArray(targets) || targets.some(target => !path.isAbsolute(target))) throw new Error('部署配置备份路径无效')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const records = targets.map((target, index) => {
    if (!fs.existsSync(target)) return { target, existed: false }
    const stat = fs.lstatSync(target)
    if (!stat.isFile()) throw new Error('部署配置不是普通文件，拒绝覆盖：' + target)
    const bytes = fs.readFileSync(target), backup = `config-${index}.backup`
    fs.writeFileSync(path.join(directory, backup), bytes, { flag: 'wx', mode: 0o600 })
    return { target, existed: true, backup, mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
  })
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(records), { flag: 'wx', mode: 0o600 })
}

/** 仅恢复备份中且在本次清单内的文件，绝不扩大到目录清理。 */
function restoreDeploymentFiles({ directory, targets }) {
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
  const records = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  if (!Array.isArray(records) || records.length !== targets.length || records.some((record, index) => record.target !== targets[index])) throw new Error('部署配置备份清单不一致，拒绝恢复')
  for (const record of records) {
    if (!record.existed) { fs.rmSync(record.target, { force: true }); continue }
    if (!/^config-\d+\.backup$/.test(record.backup)) throw new Error('部署配置备份文件名无效')
    const bytes = fs.readFileSync(path.join(directory, record.backup))
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('部署配置备份校验失败')
    const temporary = record.target + '.seal-restore-' + crypto.randomUUID()
    try {
      fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: record.mode })
      fs.chmodSync(temporary, record.mode)
      if (process.platform !== 'win32') fs.chownSync(temporary, record.uid, record.gid)
      fs.renameSync(temporary, record.target)
    } finally { fs.rmSync(temporary, { force: true }) }
  }
}

/** 精确恢复本次后台备份；任何移动失败立即抛错，不能继续把备份嵌入错误目录。 */
function restoreAdminDirectory({ siteRoot, backupName, failedName }) {
  const fs = require('node:fs'), path = require('node:path')
  if (!path.isAbsolute(siteRoot) || !/^admin\.backup-\d{14}$/.test(backupName) || !/^admin\.failed-\d{14}$/.test(failedName)) throw new Error('后台恢复路径无效')
  const root = path.resolve(siteRoot), admin = path.resolve(root, 'admin'), backup = path.resolve(root, backupName), failed = path.resolve(root, failedName)
  if ([admin, backup, failed].some(target => path.dirname(target) !== root)) throw new Error('后台恢复目标超出站点目录')
  if (!fs.existsSync(backup)) return
  if (fs.existsSync(admin)) {
    if (fs.existsSync(failed)) throw new Error('本次失败后台目录已存在，拒绝覆盖')
    fs.renameSync(admin, failed)
  }
  fs.renameSync(backup, admin)
}

/** 使用 Node 默认 TLS 校验检查公网响应；函数原样发送到服务器，保持本机和远端验收一致。 */
async function probeDeployment({ baseUrl, version, adminSha256, assets = [], checkUpdates = true }) {
  const { createHash } = require('node:crypto')
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('部署验收要求启用默认 TLS 证书校验')
  const checks = []
  const get = async (pathname, label, kind, expectedHash) => {
    let response
    try { response = await fetch(new URL(pathname, baseUrl), { redirect: 'error', signal: AbortSignal.timeout(20000) }) }
    catch (error) { throw new Error(`${label}请求失败：${error.cause?.message || error.message}`) }
    if (response.status !== 200) throw new Error(`${label}状态码不是 200：${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    const expectedType = { json: /application\/json/i, html: /text\/html/i, javascript: /(?:application|text)\/javascript/i, css: /text\/css/i }[kind]
    if (!expectedType || !expectedType.test(contentType)) throw new Error(`${label}响应类型不正确：${contentType || '未声明类型'}`)
    const bytes = Buffer.from(await response.arrayBuffer()), body = bytes.toString('utf8')
    if (expectedHash && createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error(`${label}内容与本次构建不一致`)
    if (kind === 'html' && !/<html(?:\s|>)/i.test(body)) throw new Error(`${label}没有返回完整网页`)
    checks.push({ name: label, path: pathname, status: response.status, contentType, ...(expectedHash ? { sha256: expectedHash } : {}) })
    if (kind !== 'json') return body
    try { return JSON.parse(body) } catch { throw new Error(`${label}没有返回有效的 JSON 协议`) }
  }
  const capabilities = await get('/api/v1/capabilities', '能力接口', 'json')
  if (capabilities?.version !== 1) throw new Error('能力接口协议版本不正确')
  if (checkUpdates) {
    const update = await get('/api/v1/updates/latest?platform=windows&version=' + encodeURIComponent(version), '更新接口', 'json')
    if (typeof update?.hasUpdate !== 'boolean' || (update.hasUpdate && typeof update.version !== 'string')) throw new Error('更新接口协议不完整')
  }
  await get('/', '后台首页', 'html', adminSha256)
  const share = await get('/share/', '分享页', 'html')
  if (!/<title>[^<]*文件下载[^<]*海豹办公[^<]*<\/title>/i.test(share)) throw new Error('分享页没有返回海豹办公文件下载页面')
  for (const asset of assets) await get(asset.path, '后台资源 ' + asset.path, asset.kind, asset.sha256)
  return { passed: true, tlsVerification: 'default', checks }
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
const SHARE_LANDING = {
  files: ['share/index.html', 'share/app.js'],
  target: 'share',
}
const NGINX_PATCHES = [
  { source: ADMIN.nginxPatch, target: ADMIN.nginxTarget },
  { source: 'server/deploy/nginx-release-assets.conf', target: '/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com/20-release-assets.conf' },
]

/** 校验本地后台产物存在且入口资源齐全；缺失就拒绝部署，不推半成品上去。 */
function collectAdmin(dist = path.join(ROOT, ADMIN.source)) {
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
  verifyManifest(ROOT, dist)
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
  const adminInfo = ['check', 'rollback'].includes(mode) ? null : collectAdmin()
  for (const file of SHARE_LANDING.files) {
    if (!fs.existsSync(path.join(ROOT, file))) fail(`匿名下载页缺少文件：${file}`)
  }
  log(`\n管理后台 ${ADMIN.source} → ${SERVER.siteRoot}/${ADMIN.target}`)
  adminInfo?.referenced.forEach(name => log('  assets/' + name))
  log(`站点    ${SERVER.siteRoot}`)
  log(`版本    ${version}`)
  log(`模式    ${mode}`)

  if (mode === 'check') {
    const out = runRemote(
      `systemctl is-active ${SERVER.service}; readlink ${SERVER.siteRoot}/current; ` +
      `cat ${SERVER.siteRoot}/previous-release 2>/dev/null; ` +
      `curl -s -o /dev/null -w 'local=%{http_code}\\n' http://127.0.0.1:${SERVER.localPort}/v1/capabilities; ` +
      `curl -s -o /dev/null -w 'updates=%{http_code}\\n' 'http://127.0.0.1:${SERVER.localPort}/v1/updates/latest?platform=windows&version=${version}'`,
      { password, check: true },
    )
    log('\n--- 只读体检 ---')
    log(out.out.trim())
    log(`公网 ${SERVER.publicUrl}`)
    const probeScript = `(${probeDeployment.toString()})(${JSON.stringify({ baseUrl: new URL(SERVER.publicUrl).origin, version })}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1})`
    log(execFileSync(process.execPath, ['-e', probeScript], { encoding: 'utf8', windowsHide: true }).trim())
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

  // 候选后端在独立临时数据库上真正启动并请求接口，通过后才触碰线上指针与后台。
  const expectedIndexSha = createHash('sha256').update(fs.readFileSync(path.join(OUT, 'index.cjs'))).digest('hex')
  const candidateCheck = `
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'seal-deploy-check-'));
let cloud;
(async()=>{try{
  cloud=await require('./index.cjs').createCloud({directory,env:{},sms:{configured:false,send:async()=>{throw new Error('验收环境不发送短信')}}});
  await new Promise(resolve=>cloud.server.listen(${SERVER.verifyPort},'127.0.0.1',resolve));
  for(const route of ['/v1/capabilities','/v1/updates/latest?platform=windows&version=${version}','/v1/updates/latest?platform=linux&version=${version}']){
    const response=await fetch('http://127.0.0.1:${SERVER.verifyPort}'+route);
    if(response.status!==200)throw new Error('候选接口校验失败：'+route+' '+response.status);
    const value=await response.json();if(route.includes('/updates/')&&typeof value.hasUpdate!=='boolean')throw new Error('候选更新协议不完整');
  }
  console.log('CANDIDATE_VERIFIED');
}finally{if(cloud)await cloud.close();fs.rmSync(directory,{recursive:true,force:true})}})().catch(error=>{console.error(error.message);process.exitCode=1});`
  runRemote([
    'set -e', `cd ${SERVER.siteRoot}`, `mkdir -p ${release}`, `cp -a current/. ${release}/`,
    `unzip -oq /tmp/deploy-server.zip -d ${release}`, `test -f ${release}/myShares.cjs`, `test -f ${release}/releases.cjs`, `test -f ${release}/releaseAssets.cjs`,
    `test "$(sha256sum ${release}/index.cjs | cut -d ' ' -f1)" = '${expectedIndexSha}'`, `cd ${release}`,
    'for f in *.cjs; do node --check "$f"; done', "node - <<'SEAL_CANDIDATE_CHECK'", candidateCheck, 'SEAL_CANDIDATE_CHECK',
  ].join('\n'), { password })
  log('候选服务已在隔离数据目录启动，匿名更新与平台查询均通过')

  const previous = runRemote(`readlink -f ${SERVER.siteRoot}/current`, { password }).trim()
  if (!previous.startsWith(SERVER.siteRoot + '/releases/') || !/^[A-Za-z0-9/_.-]+$/.test(previous)) fail('服务器当前版本指针无效，拒绝切换')
  const configBackup = createDeploymentConfigBackup({ siteRoot: SERVER.siteRoot, release, stamp, targets: NGINX_PATCHES.map(patch => patch.target) })
  const adminBackup = `${ADMIN.target}.backup-${stamp}`
  const backupCommand = `node - <<'SEAL_CONFIG_BACKUP'\n(${backupDeploymentFiles.toString()})(${JSON.stringify(configBackup)});\nSEAL_CONFIG_BACKUP`
  runRemote(backupCommand, { password })
  try {
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
      `test ! -e ${adminBackup}`,
      `if [ -e ${ADMIN.target} ]; then mv ${ADMIN.target} ${adminBackup}; fi`,
      `mv ${ADMIN.target}.next ${ADMIN.target}`,
    ].join(' && '), { password })
    log('管理后台已同步到 ' + SERVER.siteRoot + '/' + ADMIN.target)

    // 本轮匿名下载页没有变化，保留线上文件，避免扩大部署与回滚范围。

    // 同步 nginx 资源规则补丁并重载，避免改完产物仍因 location 缺 root 而 404
    for (const patch of NGINX_PATCHES) {
      const patchFile = path.join(ROOT, patch.source)
      if (!fs.existsSync(patchFile)) fail('nginx 必要配置缺失：' + patch.source)
      const patchScp = spawnSync('scp', [
        '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password',
        '-o', 'PubkeyAuthentication=no', '-P', String(SERVER.port),
        patchFile, `${SERVER.user}@${SERVER.host}:${patch.target}`,
      ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...installAskpass(password) } })
      if (patchScp.status !== 0) fail('nginx 资源规则上传失败：' + (patchScp.stderr || patchScp.stdout))
    }
    const reload = runRemote('nginx -t && systemctl reload nginx && echo NGINX_RELOADED', { password })
    if (!/NGINX_RELOADED/.test(reload)) fail('nginx 重载失败：' + reload)
    log('nginx 后台资源与大文件上传规则已更新并重载')
  }

  // 4) 切换并重启
  //    重启后一并校验后台首屏与它引用的脚本，避免「服务是活的但页面白屏」被当成成功。
  //    用 nginx 实际服务的地址探测，而不是只看后端进程状态。
  const publicProbeOptions = {
    baseUrl: new URL(SERVER.publicUrl).origin, version,
    adminSha256: createHash('sha256').update(fs.readFileSync(path.join(adminInfo.dist, 'index.html'))).digest('hex'),
    assets: adminInfo.referenced.map(name => ({ path: '/assets/' + name, kind: name.endsWith('.css') ? 'css' : 'javascript', sha256: createHash('sha256').update(fs.readFileSync(path.join(adminInfo.dist, 'assets', name))).digest('hex') })),
  }
  const publicProbe = `node - <<'SEAL_PUBLIC_PROBE'\n(${probeDeployment.toString()})(${JSON.stringify(publicProbeOptions)}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1});\nSEAL_PUBLIC_PROBE`
  runRemote([
    `set -e`,
    `cd ${SERVER.siteRoot}`,
    `readlink current | sed 's|${SERVER.siteRoot}/||' > previous-release`,
    `chown -R seal-cloud:seal-cloud ${release}`,
    `ln -sfn ${SERVER.siteRoot}/${release} current`,
    `systemctl restart ${SERVER.service}`,
    `sleep 5`,
    `systemctl is-active ${SERVER.service}`,
    `curl -fsS http://127.0.0.1:${SERVER.localPort}/v1/capabilities`,
    publicProbe,
    `rm -rf ${adminBackup}`,
  ].join('\n'), { password })
  log('切换完成')
  } catch (error) {
    const restoreCommand = `node - <<'SEAL_CONFIG_RESTORE'\n(${restoreDeploymentFiles.toString()})(${JSON.stringify(configBackup)});\nSEAL_CONFIG_RESTORE`
    const configRestore = runRemote(restoreCommand, { password, check: true })
    const nginxRestore = configRestore.code === 0 ? runRemote('nginx -t && systemctl reload nginx', { password, check: true }) : configRestore
    const adminRestoreCommand = `node - <<'SEAL_ADMIN_RESTORE'\n(${restoreAdminDirectory.toString()})(${JSON.stringify({ siteRoot: SERVER.siteRoot, backupName: adminBackup, failedName: `${ADMIN.target}.failed-${stamp}` })});\nSEAL_ADMIN_RESTORE`
    const adminRestore = runRemote(adminRestoreCommand, { password, check: true })
    const rollback = runRemote([
      `cd ${SERVER.siteRoot}`, `ln -sfn ${previous} current`,
      `systemctl restart ${SERVER.service}`, `systemctl is-active ${SERVER.service}`,
    ].join(' && '), { password, check: true })
    if (rollback.code !== 0 || nginxRestore.code !== 0 || adminRestore.code !== 0) fail('部署验收失败且自动恢复失败，请检查服务状态：' + error.message + '\n' + rollback.out + '\n' + nginxRestore.out + '\n' + adminRestore.out)
    fail('部署验收失败，已恢复原后端、后台与 Nginx 配置：' + error.message)
  }
}

if (require.main === module) {
  try { main() } catch (error) { console.error('\n部署中止：' + error.message); process.exitCode = 1 }
  finally { fs.rmSync(path.join(ROOT, '.upgrade-private/ask.cmd'), { force: true }) }
}
module.exports = { REQUIRED_FILES, SERVER, collectAdmin, collect, createDeploymentConfigBackup, backupDeploymentFiles, restoreDeploymentFiles, restoreAdminDirectory, probeDeployment }
