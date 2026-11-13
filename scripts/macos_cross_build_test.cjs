const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { 验证工作目录, 校验散列, 检查目标依赖, 校验构建清单, 校验配置, 校验依赖版本, 构建忽略规则, 打包暂存路径, 校验ASAR元数据, 校验文件关联, 整理输入记录, 校验Electron版本 } = require('./macos_cross_build.cjs')

test('工作目录必须全新且不能与输入目录重叠', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-mac-test-'))
  try {
    const source = path.join(dir, 'source'), bundle = path.join(dir, 'bundle')
    fs.mkdirSync(source); fs.mkdirSync(bundle)
    assert.equal(验证工作目录(path.join(dir, 'work'), source, bundle), path.join(dir, 'work'))
    for (const target of [dir, source, bundle, path.join(source, 'child')]) assert.throws(() => 验证工作目录(target, source, bundle))
    assert.throws(() => 验证工作目录(path.join(dir, 'work'), source, source))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('外部工具和 Electron 文件必须匹配明确的摘要', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-hash-test-'))
  try {
    const file = path.join(dir, 'file'); fs.writeFileSync(file, 'abc')
    const digest = crypto.createHash('sha256').update('abc').digest('hex')
    校验散列(file, digest)
    assert.throws(() => 校验散列(file, '0'.repeat(64)))
    assert.throws(() => 校验散列(file, ''))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('目标依赖拒绝宿主架构或缺少目标原生模块', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-native-test-'))
  try {
    const native = path.join(dir, 'node_modules', '@napi-rs', 'canvas-darwin-arm64', 'skia.darwin-arm64.node')
    fs.mkdirSync(path.dirname(native), { recursive: true })
    const data = Buffer.alloc(32); data.writeUInt32LE(0xfeedfacf, 0); data.writeUInt32LE(0x0100000c, 4); fs.writeFileSync(native, data)
    assert.equal(检查目标依赖(dir, 'arm64'), 1)
    assert.throws(() => 检查目标依赖(dir, 'x64'))
    data.writeUInt32LE(0x01000007, 4); fs.writeFileSync(native, data)
    assert.throws(() => 检查目标依赖(dir, 'arm64'))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('构建清单必须逐字节匹配且拒绝越界或重复条目', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-manifest-test-'))
  try {
    fs.mkdirSync(path.join(dir, 'main')); fs.mkdirSync(path.join(dir, 'dist'))
    fs.writeFileSync(path.join(dir, 'main', 'a.js'), 'a'); fs.writeFileSync(path.join(dir, 'dist', 'b.js'), 'b')
    const item = (路径, value) => ({ 路径, 字节数: Buffer.byteLength(value), 校验值: crypto.createHash('sha256').update(value).digest('hex') })
    const manifest = { 版本: 1, 文件: [item('main/a.js', 'a'), item('dist/b.js', 'b')] }
    校验构建清单(dir, manifest)
    assert.throws(() => 校验构建清单(dir, { ...manifest, 文件: [...manifest.文件, manifest.文件[0]] }))
    assert.throws(() => 校验构建清单(dir, { ...manifest, 文件: [item('main/../../outside', 'a'), manifest.文件[1]] }))
    fs.writeFileSync(path.join(dir, 'dist', 'b.js'), 'changed')
    assert.throws(() => 校验构建清单(dir, manifest))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('构建配置仅允许两个架构且每个工具必须具有摘要', () => {
  const tool = { path: path.resolve('tool'), sha256: 'a'.repeat(64) }
  const config = { source: path.resolve('source'), bundle: path.resolve('bundle'), work: path.resolve('work'), arch: 'arm64', electronVersion: '25.9.8', electronZip: { ...tool, path: path.resolve('electron-v25.9.8-darwin-arm64.zip') }, packager: tool, zapp: tool, rcodesign: tool, seven: tool, python: tool }
  校验配置(config)
  assert.throws(() => 校验配置({ ...config, arch: 'universal' }))
  assert.throws(() => 校验配置({ ...config, arch: 'x64' }))
  assert.throws(() => 校验配置({ ...config, zapp: { ...tool, sha256: '' } }))
  assert.throws(() => 校验配置({ ...config, source: 'relative' }))
})




test('目标依赖版本必须匹配锁文件且不能增加未登记包', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-lock-test-'))
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }))
    const packageDir = path.join(dir, 'node_modules', 'example'); fs.mkdirSync(packageDir, { recursive: true })
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }))
    const lock = { packages: { 'node_modules/example': { version: '1.0.0' } } }
    assert.equal(校验依赖版本(dir, lock), 1)
    assert.throws(() => 校验依赖版本(dir, { packages: {} }))
    assert.throws(() => 校验依赖版本(dir, { packages: { 'node_modules/example': { version: '2.0.0' } } }))
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0', dependencies: { missing: '1.0.0' } }))
    assert.throws(() => 校验依赖版本(dir, lock))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('打包过滤全路径类型声明但保留运行时脚本', () => {
  assert(构建忽略规则.some(rule => rule.test('/dist/file-viewer/vendor/ppt/types.d.ts')))
  assert(构建忽略规则.some(rule => rule.test('/main/demo.test.js')))
  assert(!构建忽略规则.some(rule => rule.test('/dist/file-viewer/vendor/ppt/runtime.js')))
})

test('每次打包的临时目录严格位于独立工作目录', () => {
  const work = path.resolve('some-isolated-work')
  assert.equal(打包暂存路径(work), path.join(work, 'packager-temp'))
  assert.throws(() => 打包暂存路径('relative'))
})

test('苹果系统 ASAR 完整性键必须是相对路径且摘要正确', () => {
  const hash = 'a'.repeat(64)
  const info = { ElectronAsarIntegrity: { 'Resources/app.asar': { algorithm: 'SHA256', hash } } }
  校验ASAR元数据(info, hash)
  assert.throws(() => 校验ASAR元数据({ ElectronAsarIntegrity: { '../E:\\Temp\\app.asar': { algorithm: 'SHA256', hash } } }, hash))
  assert.throws(() => 校验ASAR元数据(info, 'b'.repeat(64)))
  assert.throws(() => 校验ASAR元数据({ ElectronAsarIntegrity: { ...info.ElectronAsarIntegrity, other: { algorithm: 'SHA256', hash } } }, hash))
})



test('文件关联必须完整且名称和角色正确', () => {
  const formats = [{ extension: 'pdf', label: 'PDF 文件' }]
  const entries = [{ CFBundleTypeExtensions: ['pdf'], CFBundleTypeName: 'PDF 文件', CFBundleTypeRole: 'Editor' }]
  校验文件关联(formats, entries)
  assert.throws(() => 校验文件关联(formats, []))
  assert.throws(() => 校验文件关联(formats, [{ ...entries[0], CFBundleTypeName: '错误' }]))
  assert.throws(() => 校验文件关联(formats, [{ ...entries[0], CFBundleTypeRole: 'Viewer' }]))
  assert.throws(() => 校验文件关联(formats, [...entries, ...entries]))
})

test('构建记录仅包含显式核验的输入，不保存额外配置', () => {
  const item = { path: path.resolve('tool'), sha256: 'a'.repeat(64), password: '不应记录' }
  const config = { source: path.resolve('source'), bundle: path.resolve('bundle'), work: path.resolve('work'), arch: 'arm64', electronVersion: '25.9.8', electronZip: item, packager: item, zapp: item, rcodesign: item, seven: item, python: item, secret: '不应记录' }
  const record = 整理输入记录(config)
  assert(!JSON.stringify(record).includes('不应记录'))
  assert.deepEqual(record.zapp, { path: item.path, sha256: item.sha256 })
})

test('Electron 版本必须等于锁文件中的实际版本', () => {
  const lock = { packages: { 'node_modules/electron': { version: '25.9.8' } } }
  校验Electron版本(lock, '25.9.8')
  assert.throws(() => 校验Electron版本(lock, '26.0.0'))
  assert.throws(() => 校验Electron版本({ packages: {} }, '25.9.8'))
})

test('真实入口预检后只在新工作目录记录输入并保留失败证据', () => {
  const { spawnSync } = require('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-pipeline-test-'))
  try {
    const source = path.join(dir, 'source'), bundle = path.join(dir, 'bundle'), work = path.join(dir, 'work'), tools = path.join(dir, 'tools')
    for (const root of [source, bundle]) for (const sub of ['main', 'dist']) fs.mkdirSync(path.join(root, sub), { recursive: true })
    fs.mkdirSync(path.join(source, 'build'))
    const pkg = { name: 'fixture', version: '1.0.0', build: { appId: 'test.app', productName: '测试' } }
    const lock = { packages: { 'node_modules/electron': { version: '25.9.8' }, 'node_modules/@napi-rs/canvas-darwin-arm64': { version: '1.0.0' } } }
    const files = { 'main/main.js': 'main', 'main/documentFormats.json': JSON.stringify([{ extension: 'pdf', label: 'PDF' }]), 'dist/index.html': 'test' }
    const entries = Object.entries(files).map(([路径, contents]) => ({ 路径, 字节数: Buffer.byteLength(contents), 校验值: crypto.createHash('sha256').update(contents).digest('hex') }))
    for (const root of [source, bundle]) {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg)); fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock))
      for (const [rel, contents] of Object.entries(files)) fs.writeFileSync(path.join(root, rel), contents)
      fs.writeFileSync(path.join(root, 'main/integrity-manifest.json'), JSON.stringify({ 版本: 1, 文件: entries }))
    }
    fs.writeFileSync(path.join(source, 'build/electron-macos.cjs'), "module.exports={extraResources:[{from:'build/icon.png',to:'icon.png'}]}")
    const png = Buffer.alloc(24); png.writeUInt32BE(512, 16); png.writeUInt32BE(512, 20); fs.writeFileSync(path.join(source, 'build/icon.png'), png)
    const native = path.join(bundle, 'node_modules/@napi-rs/canvas-darwin-arm64'); fs.mkdirSync(native, { recursive: true })
    fs.writeFileSync(path.join(native, 'package.json'), JSON.stringify({ name: 'canvas', version: '1.0.0' }))
    const macho = Buffer.alloc(32); macho.writeUInt32LE(0xfeedfacf, 0); macho.writeUInt32LE(0x0100000c, 4); fs.writeFileSync(path.join(native, 'skia.darwin-arm64.node'), macho)
    const packager = path.join(tools, 'node_modules/@electron/packager'); fs.mkdirSync(path.join(packager, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(packager, 'package.json'), JSON.stringify({ name: '@electron/packager', version: '19.0.4', type: 'module' }))
    fs.writeFileSync(path.join(packager, 'dist/index.js'), "export async function packager(){throw new Error('预期终止')}")
    for (const [name, contents] of [['@electron/asar', 'module.exports={}'], ['plist', 'module.exports={}']]) {
      const p = path.join(tools, 'node_modules', name); fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'index.js'), contents)
    }
    const tool = file => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })
    for (const name of ['electron-v25.9.8-darwin-arm64.zip', 'zapp', 'rcodesign', '7z.exe', '7z.dll', 'python']) fs.writeFileSync(path.join(tools, name), name)
    const config = { source, bundle, work, arch: 'arm64', electronVersion: '25.9.8', electronZip: tool(path.join(tools, 'electron-v25.9.8-darwin-arm64.zip')), packager: tool(path.join(packager, 'dist/index.js')), zapp: tool(path.join(tools, 'zapp')), rcodesign: tool(path.join(tools, 'rcodesign')), seven: tool(path.join(tools, '7z.exe')), sevenLibrary: tool(path.join(tools, '7z.dll')), python: tool(path.join(tools, 'python')), secret: '不能写入' }
    const configFile = path.join(dir, 'config.json'); fs.writeFileSync(configFile, JSON.stringify(config))
    const result = spawnSync(process.execPath, [path.join(__dirname, 'macos_cross_build.cjs'), configFile], { encoding: 'utf8' })
    assert.equal(result.status, 1); assert.match(result.stderr, /预期终止/)
    assert.equal(fs.readFileSync(path.join(work, '.seal-macos-isolated'), 'utf8'), 'macos-cross-test-only')
    assert(!fs.readFileSync(path.join(work, '构建输入.json'), 'utf8').includes('不能写入'))
    assert(!fs.existsSync(path.join(work, '验收记录.json')))
    assert.equal(fs.readFileSync(path.join(source, 'main/main.js'), 'utf8'), 'main')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
