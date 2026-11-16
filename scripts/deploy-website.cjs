#!/usr/bin/env node
// 官网和后台联合发布：保留原后台资源，核验失败时恢复旧入口和配置。
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const siteRoot = '/www/wwwroot/seal.xingmasoft.com'
const nginxConfig = '/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com/40-website.conf'
const digest = value => createHash('sha256').update(value).digest('hex')

function validateReleaseFiles(files) {
  const site = files.get('website/index.html')?.toString()
  const admin = files.get('admin/index.html')?.toString()
  if (!site?.includes('海豹办公｜让每一份工作都清晰落地')) throw new Error('官网入口缺失或内容不正确')
  if (!admin?.includes('海豹办公管理后台')) throw new Error('后台入口缺失或内容不正确')
  const findAsset = (html, prefix, label) => {
    const match = html.match(new RegExp('(?:src|href)="' + prefix + '(assets/[^"?#]+\\.js)"'))
    if (!match || !files.has(label + '/' + match[1])) throw new Error((label === 'admin' ? '后台' : '官网') + '入口资源缺失')
    return { url: prefix + match[1], hash: digest(files.get(label + '/' + match[1])) }
  }
  return { site: findAsset(site, '/website-assets/', 'website'), admin: findAsset(admin, '/admin-assets/', 'admin') }
}
async function checkPublicResponses(options, fetcher = fetch) {
  const checks = [
    ['/', '官网', body => body.includes('海豹办公｜让每一份工作都清晰落地')],
    ['/admin/', '后台', body => body.includes('海豹办公管理后台')],
    [options.siteAsset, '官网资源', body => digest(body) === options.siteHash],
    [options.adminAsset, '后台资源', body => digest(body) === options.adminHash],
    ['/office/', '在线办公', body => body.includes('<title>海豹办公</title>')],
    ['/share/', '分享页面', body => body.includes('文件下载') && body.includes('海豹办公')],
    ['/api/v1/capabilities', '能力接口', body => { try { return JSON.parse(body).version === 1 } catch { return false } }],
  ]
  for (const [url, label, validate] of checks) {
    const response = await fetcher(new URL(url, options.baseUrl), { redirect: 'error', signal: AbortSignal.timeout(20000) })
    const body = await response.text()
    if (response.status !== 200 || !validate(body)) throw new Error(label + '验收失败（状态 ' + response.status + '，标题 ' + (body.match(/<title>([^<]*)<\/title>/i)?.[1] || '无') + '）')
    console.log(label + '验收通过')
  }
}
function collect(directory, prefix, output) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    const name = prefix + '/' + entry.name
    if (entry.isDirectory()) collect(file, name, output)
    else if (entry.isFile()) output.set(name, fs.readFileSync(file))
    else throw new Error('发布目录包含非普通文件：' + name)
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options })
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || '命令失败').trim())
  return result.stdout || ''
}
async function main() {
  const files = new Map()
  collect(path.join(root, 'website-dist'), 'website', files)
  collect(path.join(root, 'server/tpadmin/web/dist'), 'admin', files)
  const assets = validateReleaseFiles(files)
  const conf = fs.readFileSync(path.join(root, 'server/deploy/nginx-website.conf'))
  const secretPath = path.join(root, '.upgrade-private/deploy-server.json')
  const password = process.env.SEAL_DEPLOY_PASSWORD || JSON.parse(fs.readFileSync(secretPath, 'utf8')).password
  if (!password) throw new Error('缺少部署凭据')
  const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomBytes(4).toString('hex')
  const local = path.join(root, '.upgrade-private', 'website-release-' + id)
  const ask = path.join(root, '.upgrade-private', 'website-ask-' + id + '.cmd')
  const archive = path.join(root, '.upgrade-private', 'website-release-' + id + '.tar')
  const remote = `${siteRoot}/website-releases/${id}`
  const env = { ...process.env, SEAL_DEPLOY_PASSWORD: password, SSH_ASKPASS: ask, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'localhost:0' }
  const sshArgs = ['-T', '-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no', '-o', 'ConnectTimeout=20', '-p', '22', 'root@192.140.178.117']
  const ssh = (script) => run('ssh', [...sshArgs, 'bash -s'], { input: script, env })
  const rollback = `set -eu\ncd '${siteRoot}'\nif [ -e '${remote}/activated' ]; then\n  mv admin 'admin.failed-${id}'\n  mv 'admin.backup-${id}' admin\n  rm -f '${nginxConfig}' websitecurrent\n  nginx -t && systemctl reload nginx\n  rm -f '${remote}/activated'\nfi\n`
  try {
    fs.mkdirSync(local, { recursive: true })
    for (const [name, bytes] of files) { const target = path.join(local, ...name.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes) }
    fs.writeFileSync(path.join(local, 'nginx.conf'), conf)
    fs.writeFileSync(ask, '@echo off\r\nnode -e "process.stdout.write(process.env.SEAL_DEPLOY_PASSWORD)"\r\n')
    run('tar', ['-cf', archive, '-C', local, '.'])
    ssh(`set -eu\nmkdir -p '${siteRoot}/website-releases'\ntest ! -e '${remote}'\nmkdir '${remote}'\n`)
    run('scp', ['-o', 'StrictHostKeyChecking=no', '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no', '-P', '22', archive, `root@192.140.178.117:${remote}/release.tar`], { env })
    const activate = `set -eu\ncd '${siteRoot}'\ntest ! -e '${nginxConfig}'\ntest ! -e websitecurrent\ntest -f admin/index.html\ntest ! -e 'admin.backup-${id}'\ntar -xf '${remote}/release.tar' -C '${remote}'\ntest -f '${remote}/website/index.html'\ntest -f '${remote}/admin/index.html'\nmkdir 'admin.next-${id}'\ncp -a admin/. 'admin.next-${id}/'\ncp -a '${remote}/admin/.' 'admin.next-${id}/'\nrestore() {\n  if [ -e 'admin.backup-${id}' ]; then\n    if [ -e admin ]; then mv admin 'admin.failed-${id}'; fi\n    mv 'admin.backup-${id}' admin\n  fi\n  rm -f '${nginxConfig}' websitecurrent\n  nginx -t && systemctl reload nginx\n}\ntrap restore ERR\nln -s '${remote}/website' websitecurrent\nmv admin 'admin.backup-${id}'\nmv 'admin.next-${id}' admin\ncp '${remote}/nginx.conf' '${nginxConfig}'\nnginx -t\nsystemctl reload nginx\ntouch '${remote}/activated'\ntrap - ERR\n`
    ssh(activate)
    try {
      await checkPublicResponses({ baseUrl: 'https://seal.xingmasoft.com', siteAsset: assets.site.url, siteHash: assets.site.hash, adminAsset: assets.admin.url, adminHash: assets.admin.hash })
    } catch (error) {
      try { ssh(rollback) } catch (rollbackError) { throw new Error('公网验收失败，自动回滚也失败：' + error.message + '；' + rollbackError.message) }
      throw new Error('公网验收失败，已恢复原后台与配置：' + error.message)
    }
    console.log('发布成功，服务器备份标识：' + id)
  } finally {
    fs.rmSync(ask, { force: true })
    fs.rmSync(archive, { force: true })
    fs.rmSync(local, { recursive: true, force: true })
  }
}
if (require.main === module) main().catch(error => { console.error('官网发布中止：' + error.message); process.exitCode = 1 })
module.exports = { validateReleaseFiles, checkPublicResponses }
