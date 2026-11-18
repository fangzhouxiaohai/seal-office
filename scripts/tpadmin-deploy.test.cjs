// 使用隔离目录验证后台三部分切换与失败恢复，不连接正式服务器。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createManifest, verifyManifest, switchDeployment, rollbackDeployment } = require('./tpadmin-deploy.cjs')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-tpadmin-deploy-'))
  t.after(() => {
    assert.equal(fs.realpathSync(root), root)
    assert.ok(path.basename(root).startsWith('seal-tpadmin-deploy-'))
    fs.rmSync(root, { recursive: true, force: true })
  })
  const file = (name, value) => { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); return target }
  const inputs = {
    admin: { active: path.join(root, 'admin'), candidate: path.join(root, 'admin.next') },
    php: { active: path.join(root, 'php'), candidate: path.join(root, 'php.next') },
    nginx: { active: path.join(root, 'nginx.conf'), candidate: path.join(root, 'nginx.next.conf') },
  }
  file('admin/index.html', '旧后台'); file('admin.next/index.html', '新后台')
  file('php/index.php', '旧后端'); file('php.next/index.php', '新后端')
  file('nginx.conf', '旧配置'); file('nginx.next.conf', '新配置')
  file('source/view.vue', '前端源文件'); file('source/bridge.php', '后端源文件')
  file('other/user-data', '业务数据保持原样')
  return { root, file, inputs, source: path.join(root, 'source') }
}

function snapshot(inputs) {
  return {
    admin: fs.readFileSync(path.join(inputs.admin.active, 'index.html'), 'utf8'),
    php: fs.readFileSync(path.join(inputs.php.active, 'index.php'), 'utf8'),
    nginx: fs.readFileSync(inputs.nginx.active, 'utf8'),
  }
}

function deployment(f, options = {}) {
  const paths = { source: f.source, admin: f.inputs.admin.candidate, php: f.inputs.php.candidate, nginx: f.inputs.nginx.candidate }
  return { inputs: f.inputs, source: f.source, manifest: createManifest(paths), id: 'case', verify: () => {}, ...options }
}

test('构建记录绑定全部源码和产物，任何遗漏、额外文件与改动均拒绝上线', t => {
  const f = fixture(t), manifest = createManifest({ source: f.source, admin: f.inputs.admin.candidate, php: f.inputs.php.candidate, nginx: f.inputs.nginx.candidate })
  assert.doesNotThrow(() => verifyManifest(manifest, { source: f.source, admin: f.inputs.admin.candidate, php: f.inputs.php.candidate, nginx: f.inputs.nginx.candidate }))
  f.file('source/view.vue', '前端已改')
  assert.throws(() => verifyManifest(manifest, { source: f.source, admin: f.inputs.admin.candidate, php: f.inputs.php.candidate, nginx: f.inputs.nginx.candidate }), /源码或产物/)
  f.file('source/view.vue', '前端源文件'); f.file('admin.next/extra.js', '未列入产物')
  assert.throws(() => verifyManifest(manifest, { source: f.source, admin: f.inputs.admin.candidate, php: f.inputs.php.candidate, nginx: f.inputs.nginx.candidate }), /源码或产物/)
})

for (const point of ['backup-admin', 'activate-admin', 'backup-php', 'activate-php', 'backup-nginx', 'activate-nginx', 'verify']) {
  test('阶段失败后恢复三部分原状：' + point, t => {
    const f = fixture(t)
    assert.throws(() => switchDeployment(deployment(f, { verify: () => { if (point === 'verify') throw new Error('模拟验收失败') }, hook: name => { if (name === point) throw new Error('模拟阶段失败') } })), /模拟/)
    assert.deepEqual(snapshot(f.inputs), { admin: '旧后台', php: '旧后端', nginx: '旧配置' })
    assert.equal(fs.readFileSync(path.join(f.root, 'other/user-data'), 'utf8'), '业务数据保持原样')
    assert.equal(fs.readFileSync(path.join(f.inputs.admin.candidate, 'index.html'), 'utf8'), '新后台')
    assert.equal(fs.readFileSync(path.join(f.inputs.php.candidate, 'index.php'), 'utf8'), '新后端')
    assert.equal(fs.readFileSync(f.inputs.nginx.candidate, 'utf8'), '新配置')
  })
}

test('通过验收后保留旧版备份，显式回滚恢复三部分', t => {
  const f = fixture(t), state = switchDeployment(deployment(f, { verify: () => assert.deepEqual(snapshot(f.inputs), { admin: '新后台', php: '新后端', nginx: '新配置' }) }))
  assert.deepEqual(snapshot(f.inputs), { admin: '新后台', php: '新后端', nginx: '新配置' })
  rollbackDeployment(state)
  assert.deepEqual(snapshot(f.inputs), { admin: '旧后台', php: '旧后端', nginx: '旧配置' })
})

test('原路径不存在时失败后保持不存在，已有独立备份不被覆盖', t => {
  const f = fixture(t)
  fs.renameSync(f.inputs.nginx.active, path.join(f.root, 'other', 'old-nginx.conf'))
  assert.throws(() => switchDeployment(deployment(f, { verify: () => { throw new Error('模拟失败') } })), /模拟/)
  assert.equal(fs.existsSync(f.inputs.nginx.active), false)
  fs.writeFileSync(f.inputs.nginx.active + '.previous-case', '已有备份')
  assert.throws(() => switchDeployment(deployment(f)), /备份/)
  assert.equal(fs.readFileSync(f.inputs.nginx.active + '.previous-case', 'utf8'), '已有备份')
  assert.deepEqual(snapshot({ ...f.inputs, nginx: { active: path.join(f.root, 'other', 'old-nginx.conf') } }), { admin: '旧后台', php: '旧后端', nginx: '旧配置' })
})

test('切换前强制核验清单，源码或候选变化时不触碰任何正式路径', t => {
  const f = fixture(t), options = deployment(f)
  f.file('source/view.vue', '已修改源码')
  assert.throws(() => switchDeployment(options), /源码或产物/)
  assert.deepEqual(snapshot(f.inputs), { admin: '旧后台', php: '旧后端', nginx: '旧配置' })
  assert.throws(() => switchDeployment({ inputs: f.inputs, id: 'case', verify: () => {} }), /清单/)
})

test('异步验收不能被误判为同步通过', t => {
  const f = fixture(t)
  assert.throws(() => switchDeployment(deployment(f, { verify: () => Promise.resolve() })), /同步/)
  assert.deepEqual(snapshot(f.inputs), { admin: '旧后台', php: '旧后端', nginx: '旧配置' })
})
