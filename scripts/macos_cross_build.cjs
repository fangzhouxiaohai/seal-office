// 独立测试候选构建工具；不发布、不上传，不能替代 macOS 实机验收。
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function 内含(root, child) {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}

function 验证工作目录(work, source, bundle) {
  if (![work, source, bundle].every(path.isAbsolute)) throw new Error('所有目录必须使用绝对路径')
  const 输入 = [source, bundle].map(p => fs.realpathSync(p))
  if (内含(输入[0], 输入[1]) || 内含(输入[1], 输入[0])) throw new Error('源码与目标依赖目录不得重叠')
  const parent = fs.realpathSync(path.dirname(work))
  const target = path.join(parent, path.basename(work))
  if (fs.existsSync(target) || 输入.some(p => 内含(p, target) || 内含(target, p))) throw new Error('工作目录已存在或与输入目录重叠')
  return target
}

function 校验散列(file, expected) {
  if (!path.isAbsolute(file) || !/^[a-f0-9]{64}$/i.test(expected || '')) throw new Error('文件路径或 SHA-256 无效')
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  if (actual !== expected.toLowerCase()) throw new Error(`文件 SHA-256 不匹配：${file}`)
  return actual
}

function 检查目标依赖(bundle, arch) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('不支持的目标架构')
  const root = path.join(bundle, 'node_modules')
  const expected = path.join(root, '@napi-rs', `canvas-darwin-${arch}`, `skia.darwin-${arch}.node`)
  if (!fs.existsSync(expected)) throw new Error('目标架构的图像原生模块缺失')
  const cpu = arch === 'arm64' ? 0x0100000c : 0x01000007
  let count = 0
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) { if (file.endsWith('.node')) throw new Error('原生模块不得是符号链接'); continue }
      if (entry.isDirectory()) scan(file)
      else if (entry.isFile() && file.endsWith('.node')) {
        const fd = fs.openSync(file, 'r'), head = Buffer.alloc(32)
        try { if (fs.readSync(fd, head, 0, head.length, 0) !== 32 || head.readUInt32LE(0) !== 0xfeedfacf || head.readUInt32LE(4) !== cpu) throw new Error(`原生模块架构不符：${file}`) } finally { fs.closeSync(fd) }
        count++
      }
    }
  }
  scan(root)
  return count
}

function 纳入构建(rel) {
  if (rel === 'main/integrity-manifest.json' || /\.d\.ts$/.test(rel)) return false
  if (!rel.startsWith('main/')) return true
  const sub = rel.slice(5), parts = sub.split('/')
  return !parts.some(x => ['node_modules', '.vitest', '__fixtures__'].includes(x)) && sub !== 'main-test.js' && !/\.(test|spec)\.js$/.test(sub)
}

function 校验构建清单(root, manifest) {
  if (manifest?.版本 !== 1 || !Array.isArray(manifest.文件) || !manifest.文件.length) throw new Error('构建清单无效')
  const found = new Map()
  for (const entry of manifest.文件) {
    const rel = entry.路径
    if (typeof rel !== 'string' || !/^(main|dist)\//.test(rel) || rel.split('/').some(x => !x || x === '.' || x === '..') || !纳入构建(rel) || found.has(rel)) throw new Error('清单包含非法或重复路径')
    const file = path.join(root, ...rel.split('/'))
    if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== path.resolve(file)) throw new Error('构建文件不是安全的普通文件')
    const data = fs.readFileSync(file)
    if (data.length !== entry.字节数 || crypto.createHash('sha256').update(data).digest('hex') !== entry.校验值) throw new Error(`构建文件与清单不符：${rel}`)
    found.set(rel, true)
  }
  const actual = []
  function scan(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const sub = `${rel}/${e.name}`
      if (!纳入构建(sub)) continue
      if (e.isSymbolicLink()) throw new Error(`构建文件不得为链接：${sub}`)
      if (e.isDirectory()) scan(path.join(dir, e.name), sub)
      else if (e.isFile()) actual.push(sub)
    }
  }
  for (const dir of ['main', 'dist']) scan(path.join(root, dir), dir)
  if (actual.length !== found.size || actual.some(x => !found.has(x)) || !actual.some(x => x.startsWith('main/')) || !actual.some(x => x.startsWith('dist/'))) throw new Error('构建文件集合与清单不一致')
  return found.size
}
function 校验依赖版本(bundle, lock) {
  if (!lock || !lock.packages) throw new Error('依赖锁文件无效')
  let count = 0
  const packages = []
  function scan(root) {
    for (const item of fs.readdirSync(root, { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue
      const p = path.join(root, item.name)
      if (item.isSymbolicLink()) throw new Error(`依赖包不得是符号链接：${p}`)
      if (!item.isDirectory()) continue
      if (item.name.startsWith('@')) { scan(p); continue }
      const rel = path.relative(bundle, p).split(path.sep).join('/')
      const actual = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'))
      const expected = lock.packages[rel]
      if (!expected || !expected.version || actual.version !== expected.version) throw new Error(`依赖包版本与锁文件不符：${rel}`)
      count++
      packages.push([p, actual])
      const nested = path.join(p, 'node_modules')
      if (fs.existsSync(nested)) scan(nested)
    }
  }
  scan(path.join(bundle, 'node_modules'))
  if (!count) throw new Error('目标依赖为空')
  packages.push([bundle, JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8'))])
  const Module = require('node:module')
  for (const [dir, pkg] of packages) {
    const optional = pkg.optionalDependencies || {}
    const roots = Module._nodeModulePaths(dir).filter(p => 内含(bundle, p))
    for (const name of Object.keys(pkg.dependencies || {})) {
      if (Object.hasOwn(optional, name)) continue
      if (name.split('/').some(x => x === '..' || x === '.')) throw new Error('依赖名称无效')
      if (!roots.some(root => fs.existsSync(path.join(root, name, 'package.json')))) throw new Error(`目标依赖缺失：${pkg.name || dir} 需要 ${name}`)
    }
  }
  return count
}
function 打包暂存路径(work) {
  if (!path.isAbsolute(work)) throw new Error('工作目录必须使用绝对路径')
  return path.join(work, 'packager-temp')
}

function 校验ASAR元数据(info, expected) {
  const map = info?.ElectronAsarIntegrity
  if (!map || Object.keys(map).length !== 1 || !map['Resources/app.asar'] || map['Resources/app.asar'].algorithm !== 'SHA256' || map['Resources/app.asar'].hash !== expected) throw new Error('Electron ASAR 完整性路径或摘要无效')
}
const 构建忽略规则 = [/\.d\.ts$/, /\/main\/.*\.(test|spec)\.js$/, /\/main\/main-test\.js$/, /\/main\/.*\/(__fixtures__|node_modules|\.vitest)\//, /\/package-lock\.json$/, /\/yarn\.lock$/, /\/pnpm-lock\.yaml$/, /\/\.git($|\/)/, /\/node_modules\/\.bin($|\/)/, /\.o(bj)?$/, /\/node_gyp_bins($|\/)/]
function 排除路径(rel) {
  return 构建忽略规则.some(rule => rule.test(rel))
}

function 冻结依赖(bundle) {
  const manifest = Object.create(null)
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name)
      const rel = path.relative(bundle, absolute).split(path.sep).join('/')
      if (排除路径(`/${rel}`)) continue
      if (entry.isSymbolicLink()) throw new Error(`依赖文件不得为链接：${rel}`)
      if (entry.isDirectory()) scan(absolute)
      else if (entry.isFile()) {
        const data = fs.readFileSync(absolute)
        manifest[rel] = { size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') }
      } else throw new Error(`不支持的依赖文件类型：${rel}`)
    }
  }
  scan(path.join(bundle, 'node_modules'))
  if (!Object.keys(manifest).length) throw new Error('目标依赖内容清单为空')
  return manifest
}

function 校验依赖归档(manifest, files, read, signed = false) {
  const expected = Object.keys(manifest), actual = new Set(files)
  if (actual.size !== files.length || expected.length !== actual.size || expected.some(rel => !actual.has(rel))) throw new Error('ASAR 依赖文件集合不一致')
  const changedNative = []
  for (const rel of expected) {
    const data = read(rel), entry = manifest[rel]
    if (data.length !== entry.size || crypto.createHash('sha256').update(data).digest('hex') !== entry.sha256) {
      if (signed && rel.endsWith('.node')) changedNative.push(rel)
      else throw new Error(`ASAR 依赖文件内容不一致：${rel}`)
    }
  }
  return changedNative
}

function 校验文件关联(formats, entries) {
  if (!Array.isArray(formats) || !formats.length || !Array.isArray(entries) || entries.length !== formats.length) throw new Error('文件关联数量不符')
  const expected = new Map(formats.map(x => [x.extension, x.label]))
  if (expected.size !== formats.length) throw new Error('文件关联配置重复')
  const seen = new Set()
  for (const entry of entries) {
    const extensions = entry.CFBundleTypeExtensions
    if (!Array.isArray(extensions) || extensions.length !== 1) throw new Error('文件关联扩展名不符')
    const ext = extensions[0]
    if (!expected.has(ext) || seen.has(ext) || entry.CFBundleTypeName !== expected.get(ext) || entry.CFBundleTypeRole !== 'Editor') throw new Error('文件关联内容不符')
    seen.add(ext)
  }
}
function 整理输入记录(config) {
  const out = Object.fromEntries(['source', 'bundle', 'work', 'arch', 'electronVersion'].map(key => [key, config[key]]))
  for (const key of ['electronZip', 'packager', 'zapp', 'rcodesign', 'seven', 'sevenLibrary', 'python']) {
    if (config[key]) out[key] = { path: config[key].path, sha256: config[key].sha256 }
  }
  return out
}
function 校验Electron版本(lock, version) {
  if (lock?.packages?.['node_modules/electron']?.version !== version) throw new Error('Electron 版本与锁文件不一致')
}
function 校验配置(config) {
  if (!config || !['arm64', 'x64'].includes(config.arch) || !/^\d+\.\d+\.\d+$/.test(config.electronVersion || '')) throw new Error('目标架构或 Electron 版本无效')
  for (const key of ['source', 'bundle', 'work']) if (!path.isAbsolute(config[key] || '')) throw new Error(`${key} 必须是绝对路径`)
  for (const key of ['electronZip', 'packager', 'zapp', 'rcodesign', 'seven', 'python']) {
    const item = config[key]
    if (!item || !path.isAbsolute(item.path || '') || !/^[a-f0-9]{64}$/i.test(item.sha256 || '')) throw new Error(`${key} 必须提供绝对路径与 SHA-256`)
  }
  if (config.sevenLibrary && (!path.isAbsolute(config.sevenLibrary.path || '') || !/^[a-f0-9]{64}$/i.test(config.sevenLibrary.sha256 || ''))) throw new Error('7-Zip 动态库配置无效')
  if (path.basename(config.electronZip.path) !== `electron-v${config.electronVersion}-darwin-${config.arch}.zip`) throw new Error('Electron ZIP 名称与目标不符')
  return config
}

module.exports = { 验证工作目录, 校验散列, 检查目标依赖, 校验构建清单, 校验配置, 校验依赖版本, 构建忽略规则, 打包暂存路径, 校验ASAR元数据, 校验文件关联, 整理输入记录, 校验Electron版本, 冻结依赖, 校验依赖归档 }



async function 构建(config) {
  const { pathToFileURL } = require('node:url')
  const { createRequire } = require('node:module')
  const { spawnSync } = require('node:child_process')
  校验配置(config)
  const source = fs.realpathSync(config.source), bundle = fs.realpathSync(config.bundle)
  const work = 验证工作目录(config.work, source, bundle)
  for (const key of ['electronZip', 'packager', 'zapp', 'rcodesign', 'seven', 'python']) 校验散列(config[key].path, config[key].sha256)
  if (process.platform === 'win32') {
    if (!config.sevenLibrary || path.dirname(config.sevenLibrary.path) !== path.dirname(config.seven.path) || path.basename(config.sevenLibrary.path).toLowerCase() !== '7z.dll') throw new Error('Windows 7-Zip 必须提供同目录 7z.dll 及摘要')
    校验散列(config.sevenLibrary.path, config.sevenLibrary.sha256)
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'))
  const bundlePkg = fs.readFileSync(path.join(bundle, 'package.json'))
  if (!bundlePkg.equals(fs.readFileSync(path.join(source, 'package.json'))) || !fs.readFileSync(path.join(bundle, 'package-lock.json')).equals(fs.readFileSync(path.join(source, 'package-lock.json')))) throw new Error('目标依赖工程与源码版本或锁文件不一致')
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || !pkg.build?.appId || !pkg.build?.productName || /[/\\:]/.test(pkg.build.productName)) throw new Error('应用身份无效')
  const manifestPath = path.join(source, 'main/integrity-manifest.json')
  const manifestBytes = fs.readFileSync(manifestPath)
  if (!manifestBytes.equals(fs.readFileSync(path.join(bundle, 'main/integrity-manifest.json')))) throw new Error('源码与目标包完整性清单不同')
  const manifest = JSON.parse(manifestBytes)
  const count = 校验构建清单(source, manifest)
  校验构建清单(bundle, manifest)
  const lock = JSON.parse(fs.readFileSync(path.join(bundle, 'package-lock.json'), 'utf8'))
  校验Electron版本(lock, config.electronVersion)
  const lockedPackages = 校验依赖版本(bundle, lock)
  const nativeCount = 检查目标依赖(bundle, config.arch)
  const dependencyManifest = 冻结依赖(bundle)
  const mac = require(path.join(source, 'build/electron-macos.cjs'))
  const formats = require(path.join(source, 'main/documentFormats.json'))
  if (!Array.isArray(mac.extraResources) || !mac.extraResources.length || !Array.isArray(formats) || !formats.length) throw new Error('资源或文件关联配置为空')
  const moduleRequire = createRequire(pathToFileURL(config.packager.path))
  const { packager } = await import(pathToFileURL(config.packager.path).href)
  const asar = await import(pathToFileURL(moduleRequire.resolve('@electron/asar')).href)
  const plist = moduleRequire('plist')
  const packagerPkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(config.packager.path), '../package.json'), 'utf8'))
  if (packagerPkg.name !== '@electron/packager' || !packagerPkg.version) throw new Error('Packager 模块无效')
  fs.mkdirSync(work)
  fs.writeFileSync(path.join(work, '依赖内容清单.json'), JSON.stringify(dependencyManifest), { flag: 'wx' })
  fs.writeFileSync(path.join(work, '构建输入.json'), JSON.stringify(整理输入记录(config), null, 2), { flag: 'wx' })
  fs.writeFileSync(path.join(work, '.seal-macos-isolated'), 'macos-cross-test-only', { flag: 'wx' })
  function run(tool, args, label, json = false) {
    const result = spawnSync(tool, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    fs.writeFileSync(path.join(work, `${label}.log`), `${result.stdout || ''}${result.stderr || ''}`, { flag: 'wx' })
    if (result.error || result.status !== 0) throw new Error(`${label} 失败，请检查隔离工作目录日志：${result.error?.message || result.status}`)
    return json ? JSON.parse(result.stdout.trim()) : result.stdout
  }
  const imageName = `seal-office-${pkg.version}-macos-${config.arch}-test-only.dmg`
  const zipDir = path.join(work, 'electron'); fs.mkdirSync(zipDir)
  fs.copyFileSync(config.electronZip.path, path.join(zipDir, path.basename(config.electronZip.path)), fs.constants.COPYFILE_EXCL)
  const png = fs.readFileSync(path.join(source, 'build/icon.png'))
  if (png.length < 24 || png.readUInt32BE(16) !== 512 || png.readUInt32BE(20) !== 512) throw new Error('图标必须为 512×512 PNG')
  const head = Buffer.alloc(16); head.write('icns', 0); head.writeUInt32BE(png.length + 16, 4); head.write('ic09', 8); head.writeUInt32BE(png.length + 8, 12)
  const icon = path.join(work, 'icon.icns'); fs.writeFileSync(icon, Buffer.concat([head, png]), { flag: 'wx' })
  const apps = await packager({ dir: bundle, tmpdir: 打包暂存路径(work), out: path.join(work, 'packaged'), platform: 'darwin', arch: config.arch, electronVersion: config.electronVersion, electronZipDir: zipDir, name: pkg.build.productName, appBundleId: pkg.build.appId, appVersion: pkg.version, icon, asar: true, prune: false,
    ignore: 排除路径, junk: false,
    extendInfo: { LSMinimumSystemVersion: '11.0.0', CFBundleDocumentTypes: formats.map(({ extension, label }) => ({ CFBundleTypeExtensions: [extension], CFBundleTypeName: label, CFBundleTypeRole: 'Editor' })) } })
  if (apps.length !== 1) throw new Error('未生成唯一应用，Packager 可能跳过目标')
  const app = path.join(apps[0], `${pkg.build.productName}.app`), resources = path.join(app, 'Contents', 'Resources')
  if (!fs.existsSync(app)) throw new Error('应用目录缺失')
  for (const item of mac.extraResources) {
    if (!item.from || !item.to || path.isAbsolute(item.from) || path.isAbsolute(item.to) || [item.from, item.to].some(x => x.split(/[\\/]/).includes('..'))) throw new Error('资源路径无效')
    const base = item.from.startsWith('node_modules/') ? bundle : source
    const src = path.resolve(base, item.from), dst = path.resolve(resources, item.to)
    if (!内含(base, fs.realpathSync(src)) || !内含(resources, dst)) throw new Error('资源路径越界')
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst, fs.constants.COPYFILE_EXCL)
  }
  // Packager 在 Windows 主机上会把绝对临时路径写入 plist，须在签名前修正为 macOS 包内路径。
  const infoPath = path.join(app, 'Contents', 'Info.plist')
  const archivePath = path.join(resources, 'app.asar')
  const headerDigest = crypto.createHash('sha256').update(asar.getRawHeader(archivePath).headerString).digest('hex')
  const fixedInfo = plist.parse(fs.readFileSync(infoPath, 'utf8'))
  fixedInfo.ElectronAsarIntegrity = { 'Resources/app.asar': { algorithm: 'SHA256', hash: headerDigest } }
  fs.writeFileSync(infoPath, plist.build(fixedInfo))
  const script = path.join(__dirname, 'macos_cross_verify.py')
  run(config.python.path, [script, 'repair-links', '--app', app, '--work', work, '--electron-zip', config.electronZip.path], 'links')
  function 校验应用(signed = false) {
    const info = plist.parse(fs.readFileSync(path.join(app, 'Contents/Info.plist'), 'utf8'))
    校验ASAR元数据(info, crypto.createHash('sha256').update(asar.getRawHeader(path.join(resources, 'app.asar')).headerString).digest('hex'))
    if (info.CFBundleIdentifier !== pkg.build.appId || info.CFBundleShortVersionString !== pkg.version || info.CFBundleExecutable !== pkg.build.productName || info.LSMinimumSystemVersion !== '11.0.0') throw new Error('应用身份、版本或最低系统版本不符')
    校验文件关联(formats, info.CFBundleDocumentTypes)
    const archive = path.join(resources, 'app.asar')
    if (!asar.extractFile(archive, path.normalize('main/integrity-manifest.json')).equals(manifestBytes)) throw new Error('应用 ASAR 清单不同')
    const expected = new Set(manifest.文件.map(x => x.路径))
    const actual = []
    for (const listed of asar.listPackage(archive, {})) {
      const rel = listed.replaceAll('\\', '/').replace(/^\/+/, '')
      if (!(rel.startsWith('main/') || rel.startsWith('dist/')) || rel === 'main/integrity-manifest.json') continue
      if (!asar.statFile(archive, path.normalize(rel)).files) actual.push(rel)
    }
    if (actual.length !== expected.size || actual.some(x => !expected.has(x))) throw new Error('ASAR 构建文件集合不一致')
    for (const entry of manifest.文件) {
      const data = asar.extractFile(archive, path.normalize(entry.路径))
      if (data.length !== entry.字节数 || crypto.createHash('sha256').update(data).digest('hex') !== entry.校验值) throw new Error(`ASAR 内容不符：${entry.路径}`)
    }
    const dependencyFiles = asar.listPackage(archive, {}).map(x => x.replaceAll('\\', '/').replace(/^\/+/, '')).filter(x => x.startsWith('node_modules/') && !asar.statFile(archive, path.normalize(x)).files)
    const changedNative = 校验依赖归档(dependencyManifest, dependencyFiles, rel => asar.extractFile(archive, path.normalize(rel)), signed)
    for (let i = 0; i < changedNative.length; i++) {
      const rel = changedNative[i], input = path.join(bundle, ...rel.split('/'))
      const output = path.join(resources, 'app.asar.unpacked', ...rel.split('/'))
      校验散列(input, dependencyManifest[rel].sha256)
      run(config.python.path, [script, 'native', '--source', input, '--target', output, '--arch', config.arch], `native-${i}`)
    }
    const native = dependencyFiles.filter(x => x.endsWith('.node'))
    if (native.length !== nativeCount || !native.includes(`node_modules/@napi-rs/canvas-darwin-${config.arch}/skia.darwin-${config.arch}.node`)) throw new Error('ASAR 原生模块集合不符')
    for (const rel of native) {
      const data = asar.extractFile(archive, path.normalize(rel))
      const cpu = config.arch === 'arm64' ? 0x0100000c : 0x01000007
      if (data.length < 32 || data.readUInt32LE(0) !== 0xfeedfacf || data.readUInt32LE(4) !== cpu) throw new Error(`ASAR 原生模块架构不符：${rel}`)
    }
    for (const item of mac.extraResources) {
      const origin = path.join(item.from.startsWith('node_modules/') ? bundle : source, item.from)
      const result = path.join(resources, item.to)
      if (!fs.readFileSync(origin).equals(fs.readFileSync(result))) throw new Error(`附加资源不一致：${item.to}`)
    }
  }
  校验应用()
  run(config.rcodesign.path, ['sign', app], 'adhoc-sign')
  校验应用(true)
  const signature = run(config.python.path, [script, 'signature', '--app', app, '--arch', config.arch, '--electron-zip', config.electronZip.path], 'signature', true)
  const original = run(config.python.path, [script, 'original', '--app', app, '--electron-zip', config.electronZip.path, '--name', pkg.build.productName], 'original', true)
  const dmg = path.join(work, imageName)
  run(config.zapp.path, ['dmg', '--no-config', '--no-sign', '--no-notarize', '--app', app, '--title', pkg.build.productName, '--out', dmg], 'dmg')
  if (!fs.statSync(dmg).isFile()) throw new Error('未生成磁盘映像')
  const extracted = path.join(work, 'extracted')
  run(config.seven.path, ['x', dmg, `-o${extracted}`, '-y'], 'extract')
  const image = run(config.python.path, [script, 'image', '--app', app, '--extracted', path.join(extracted, pkg.build.productName, `${pkg.build.productName}.app`), '--dmg', dmg, '--electron-zip', config.electronZip.path, '--seven', config.seven.path, '--name', pkg.build.productName], 'image', true)
  const report = { version: pkg.version, arch: config.arch, electron: config.electronVersion, packager: packagerPkg.version, appId: pkg.build.appId, app, dmg, size: fs.statSync(dmg).size, sha256: image.sha256, manifestFiles: count, nativeModules: nativeCount, lockedPackages, dependencyFiles: Object.keys(dependencyManifest).length, signature, original, image,
    releaseReady: false, systemVerification: '未在 macOS 执行系统签名、Gatekeeper、安装或启动验收', notarization: '未公证；仅供隔离测试，禁止发布' }
  fs.writeFileSync(path.join(work, '验收记录.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
  return report
}

module.exports.构建 = 构建
if (require.main === module) {
  if (process.argv.length !== 3) { console.error('用法：node scripts/macos_cross_build.cjs <配置 JSON 绝对路径>'); process.exitCode = 2 }
  else 构建(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
}
