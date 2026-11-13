// 验证部署包实际依赖和后台源文件指纹，避免功能已写但产物仍是旧版。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const http = require('node:http')
const { createHash } = require('node:crypto')
function deployment() {
  return require('./deploy-server.cjs')
}
test('部署文件清单覆盖入口的每一项本地运行依赖', () => {
  const { REQUIRED_FILES } = deployment()
  const requires = [...fs.readFileSync(path.join(root, 'server/index.cjs'), 'utf8').matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)].map(match => match[1])
  assert.deepEqual(requires.filter(name => !REQUIRED_FILES.includes(name)), [])
})
test('后台部署校验拒绝缺失源文件指纹的旧构建', () => {
  const { collectAdmin } = deployment()
  const os = require('node:os'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-admin-build-'))
  try {
    fs.mkdirSync(path.join(directory, 'assets'))
    fs.writeFileSync(path.join(directory, 'index.html'), '<script src="/assets/old.js"></script>')
    fs.writeFileSync(path.join(directory, 'assets/old.js'), '旧后台')
    assert.throws(() => collectAdmin(directory), /构建记录|重新构建|源文件/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
test('后台服务体检使用当前生产主服务端口', () => {
  assert.equal(deployment().SERVER.localPort, 8096)
})

test('部署失败恢复已有配置并清除本次新增配置，不触碰其他文件', () => {
  const { backupDeploymentFiles, restoreDeploymentFiles } = deployment()
  assert.equal(typeof backupDeploymentFiles, 'function')
  assert.equal(typeof restoreDeploymentFiles, 'function')
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seal-deploy-config-'))
  try {
    const existing = path.join(directory, 'existing.conf'), added = path.join(directory, 'added.conf'), untouched = path.join(directory, 'user.conf'), backup = path.join(directory, 'backup')
    fs.writeFileSync(existing, '原配置'); fs.writeFileSync(untouched, '其他配置')
    const targets = [existing, added]
    backupDeploymentFiles({ directory: backup, targets })
    fs.writeFileSync(existing, '无效配置'); fs.writeFileSync(added, '新增配置')
    restoreDeploymentFiles({ directory: backup, targets })
    assert.equal(fs.readFileSync(existing, 'utf8'), '原配置')
    assert.equal(fs.existsSync(added), false)
    assert.equal(fs.readFileSync(untouched, 'utf8'), '其他配置')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('再次部署复制旧发布目录后使用本次独立配置备份，不能覆盖或误恢复上次备份', () => {
  const { createDeploymentConfigBackup, backupDeploymentFiles, restoreDeploymentFiles } = deployment()
  assert.equal(typeof createDeploymentConfigBackup, 'function')
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seal-redeploy-'))
  try {
    const previous = path.join(directory, 'releases/previous'), release = 'releases/2.7.2-backend-20261113150000'
    const active = path.join(directory, 'active.conf')
    fs.mkdirSync(path.join(previous, 'deployment-config-backup'), { recursive: true })
    fs.writeFileSync(path.join(previous, 'deployment-config-backup/config-0.backup'), '更早配置')
    fs.cpSync(previous, path.join(directory, release), { recursive: true })
    fs.writeFileSync(active, '本次部署前配置')
    const options = createDeploymentConfigBackup({ siteRoot: directory, release, stamp: '20261113150000', targets: [active] })
    backupDeploymentFiles(options)
    fs.writeFileSync(active, '本次无效配置'); restoreDeploymentFiles(options)
    assert.equal(fs.readFileSync(active, 'utf8'), '本次部署前配置')
    assert.equal(fs.readFileSync(path.join(directory, release, 'deployment-config-backup/config-0.backup'), 'utf8'), '更早配置')
    assert.ok(options.directory.endsWith('deployment-config-backups/2.7.2-backend-20261113150000'))
    assert.ok(!options.directory.includes('/releases/'))
    assert.throws(() => backupDeploymentFiles(options), /EEXIST/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('后台替换失败后即使当前目录不存在，也能从本次备份恢复', () => {
  const { restoreAdminDirectory } = deployment()
  assert.equal(typeof restoreAdminDirectory, 'function')
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'seal-deploy-admin-'))
  try {
    const backupName = 'admin.backup-20261113120000', failedName = 'admin.failed-20261113120000'
    fs.mkdirSync(path.join(directory, backupName)); fs.writeFileSync(path.join(directory, backupName, 'index.html'), '原后台')
    restoreAdminDirectory({ siteRoot: directory, backupName, failedName })
    assert.equal(fs.readFileSync(path.join(directory, 'admin/index.html'), 'utf8'), '原后台')
    assert.equal(fs.existsSync(path.join(directory, backupName)), false)
    assert.equal(fs.existsSync(path.join(directory, failedName)), false)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

async function probeFixture(t, overrides = {}) {
  const html = '<!doctype html><html><head><title>海豹办公</title></head><body>后台</body></html>'
  const script = 'document.title="海豹办公"', style = 'body{color:#123456}', requests = []
  const responses = {
    '/api/v1/capabilities': { type: 'application/json', body: JSON.stringify({ version: 1 }) },
    '/api/v1/updates/latest?platform=windows&version=2.7.2': { type: 'application/json', body: JSON.stringify({ hasUpdate: false }) },
    '/': { type: 'text/html; charset=utf-8', body: html },
    '/share/': { type: 'text/html; charset=utf-8', body: '<!doctype html><html><title>文件下载 · 海豹办公</title></html>' },
    '/assets/current.js': { type: 'application/javascript', body: script },
    '/assets/current.css': { type: 'text/css', body: style },
    ...overrides,
  }
  const server = http.createServer((req, res) => {
    requests.push(req.url)
    const result = responses[req.url]
    if (!result) { res.writeHead(404); res.end(); return }
    res.writeHead(result.status || 200, { 'Content-Type': result.type }); res.end(result.body)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const sha = value => createHash('sha256').update(value).digest('hex')
  return { requests, options: {
    baseUrl: `http://127.0.0.1:${server.address().port}`, version: '2.7.2', adminSha256: sha(html),
    assets: [{ path: '/assets/current.js', kind: 'javascript', sha256: sha(script) }, { path: '/assets/current.css', kind: 'css', sha256: sha(style) }],
  } }
}

test('Node 公网探针检查更新协议、后台、分享页和本次构建资源', async t => {
  const { probeDeployment } = deployment()
  assert.equal(typeof probeDeployment, 'function')
  const f = await probeFixture(t)
  const result = await probeDeployment(f.options)
  assert.equal(result.passed, true)
  assert.equal(result.checks.length, 6)
  assert.deepEqual(new Set(f.requests), new Set(['/api/v1/capabilities', '/api/v1/updates/latest?platform=windows&version=2.7.2', '/', '/share/', '/assets/current.js', '/assets/current.css']))
})

test('公网探针拒绝非 200 响应，即使请求库认为该状态成功', async t => {
  const { probeDeployment } = deployment()
  assert.equal(typeof probeDeployment, 'function')
  const f = await probeFixture(t, { '/share/': { status: 206, type: 'text/html', body: '<html>文件下载 · 海豹办公</html>' } })
  await assert.rejects(probeDeployment(f.options), /分享页.*206/)
})

test('公网探针拒绝旧登录接口与无效更新协议，不能将异常当作已最新', async t => {
  const { probeDeployment } = deployment()
  assert.equal(typeof probeDeployment, 'function')
  const f = await probeFixture(t, { '/api/v1/updates/latest?platform=windows&version=2.7.2': { type: 'application/json', body: JSON.stringify({ error: '登录已过期' }) } })
  await assert.rejects(probeDeployment(f.options), /更新.*协议/)
})

test('公网探针拒绝回落 HTML 的脚本资源和内容不一致的旧资源', async t => {
  const { probeDeployment } = deployment()
  assert.equal(typeof probeDeployment, 'function')
  const html = await probeFixture(t, { '/assets/current.js': { type: 'text/html', body: '<html>页面回落</html>' } })
  await assert.rejects(probeDeployment(html.options), /资源.*类型/)
  const stale = await probeFixture(t, { '/assets/current.js': { type: 'application/javascript', body: '旧构建内容' } })
  await assert.rejects(probeDeployment(stale.options), /资源.*本次构建/)
})
