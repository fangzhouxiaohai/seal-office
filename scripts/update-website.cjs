#!/usr/bin/env node
// 仅更新官网，保留既有后台及旧版静态资源。
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const siteRoot = '/www/wwwroot/seal.xingmasoft.com'

function validateWebsite(files) {
  const html = files.get('index.html')?.toString()
  if (!html?.includes('海豹办公｜让每一份工作都清晰落地')) throw new Error('官网入口缺失或内容不正确')
  const paths = [...html.matchAll(/(?:src|href)="\/website-assets\/(assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1])
  if (!paths.some(p => p.endsWith('.js')) || !paths.some(p => p.endsWith('.css'))) throw new Error('官网入口资源缺失')
  return paths.map(p => {
    if (!files.has(p)) throw new Error('官网资源缺失：' + p)
    return { path: p }
  })
}

function makeActivationScript(id, assets) {
  if (!/^\d{14}-[a-f0-9]{8}$/.test(id) || assets.some(p => !/^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(p))) throw new Error('发布标识或资源路径无效')
  const remote = `${siteRoot}/website-releases/${id}`
  const checks = ['index.html', ...assets].map(p => {
    const url = p === 'index.html' ? '/' : '/website-assets/' + p
    return `check_file '${remote}/website/${p}' '${url}'`
  }).join('\n')
  return `set -Eeuo pipefail
cd '${siteRoot}'
test -L websitecurrent
old=$(readlink -f websitecurrent)
case "$old" in '${siteRoot}'/website-releases/*/website) ;; *) echo '现有官网目录不符合预期' >&2; exit 1;; esac
test -f "$old/index.html"
tar -xf '${remote}/release.tar' -C '${remote}'
test -f '${remote}/website/index.html'
mkdir -p '${remote}/website/assets'
if [ -d "$old/assets" ]; then cp -an "$old/assets/." '${remote}/website/assets/'; fi
printf '%s\n' "$old" > '${remote}/previous'
rollback() {
  status=$?
  trap - ERR
  if [ "$switched" = 1 ]; then
    ln -s "$old" 'websitecurrent.rollback-${id}'
    mv -Tf 'websitecurrent.rollback-${id}' websitecurrent
    echo '验收失败，已恢复原官网' >&2
  fi
  exit "$status"
}
switched=0
trap rollback ERR
ln -s '${remote}/website' 'websitecurrent.next-${id}'
mv -Tf 'websitecurrent.next-${id}' websitecurrent
switched=1
check_file() {
  local expected="$1" url="$2" result
  result=$(curl --fail --silent --show-error --max-time 20 --insecure --noproxy '*' --resolve seal.xingmasoft.com:443:127.0.0.1 "https://seal.xingmasoft.com$url" | sha256sum | cut -d' ' -f1)
  test "$result" = "$(sha256sum "$expected" | cut -d' ' -f1)"
}
${checks}
for route in /admin/ /office/ /share/ /api/v1/capabilities; do
  curl --fail --silent --show-error --max-time 20 --insecure --noproxy '*' --resolve seal.xingmasoft.com:443:127.0.0.1 "https://seal.xingmasoft.com$route" -o /dev/null
done
trap - ERR
printf '官网更新成功：%s\n原官网：%s\n' '${id}' "$old"
`
}

function collect(dir, prefix, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(file, relative, files)
    else if (entry.isFile()) files.set(relative, fs.readFileSync(file))
    else throw new Error('构建目录包含非普通文件：' + relative)
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options })
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || '命令失败').trim())
  return result.stdout || ''
}
function main() {
  const files = new Map()
  collect(path.join(root, 'website-dist'), '', files)
  const assets = validateWebsite(files).map(item => item.path)
  const password = process.env.SEAL_DEPLOY_PASSWORD || JSON.parse(fs.readFileSync(path.join(root, '.upgrade-private/deploy-server.json'), 'utf8')).password
  if (!password) throw new Error('缺少部署凭据')
  const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomBytes(4).toString('hex')
  const local = path.join(root, '.upgrade-private', 'website-update-' + id)
  const ask = local + '.cmd'
  const archive = local + '.tar'
  const remote = `${siteRoot}/website-releases/${id}`
  const env = { ...process.env, SEAL_DEPLOY_PASSWORD: password, SSH_ASKPASS: ask, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'localhost:0' }
  const options = ['-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no', '-o', 'ConnectTimeout=20']
  const ssh = script => run('ssh', ['-T', ...options, '-p', '22', 'root@192.140.178.117', 'bash -s'], { input: script, env })
  try {
    fs.mkdirSync(path.join(local, 'website'), { recursive: true })
    for (const [name, bytes] of files) {
      const target = path.join(local, 'website', ...name.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, bytes)
    }
    fs.writeFileSync(ask, '@echo off\r\nnode -e "process.stdout.write(process.env.SEAL_DEPLOY_PASSWORD)"\r\n')
    run('tar', ['--force-local', '-cf', archive, '-C', local, 'website'])
    ssh(`set -eu\nmkdir -p '${siteRoot}/website-releases'\ntest ! -e '${remote}'\nmkdir '${remote}'\n`)
    run('scp', [...options, '-P', '22', archive, `root@192.140.178.117:${remote}/release.tar`], { env })
    process.stdout.write(ssh(makeActivationScript(id, assets)))
  } finally {
    fs.rmSync(ask, { force: true })
    fs.rmSync(archive, { force: true })
    fs.rmSync(local, { recursive: true, force: true })
  }
}
if (require.main === module) {
  try { main() } catch (error) { console.error('官网更新中止：' + error.message); process.exitCode = 1 }
}
module.exports = { validateWebsite, makeActivationScript }
