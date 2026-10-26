'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const os = require('os')
const { createHash } = require('crypto')
const { parseFontFile, extractFontFace, MAX_FONT_BYTES } = require('./fontMeta')

const CACHE_FILE = 'font-cache-v3.json'
const MANIFEST_FILE = 'index.json'
const MAX_SYSTEM_FONTS = 5000
const MAX_CUSTOM_FONTS = 256
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc'])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const idFor = (prefix, value) => `${prefix}-${sha256(Buffer.from(value)).slice(0, 20)}`

function 平台字体目录(平台 = process.platform, 环境 = process.env) {
  const home = 环境.HOME || 环境.USERPROFILE || os.homedir()
  const directories = []
  if (平台 === 'win32') {
    const windows = 环境.WINDIR || 环境.SystemRoot || 'C:\\Windows'
    directories.push(path.join(windows, 'Fonts'))
    const local = 环境.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    directories.push(path.join(local, 'Microsoft', 'Windows', 'Fonts'))
  } else if (平台 === 'darwin') {
    directories.push('/System/Library/Fonts', '/Library/Fonts', path.join(home, 'Library', 'Fonts'))
    directories.push('/System/Library/Fonts/Supplemental')
  } else {
    directories.push('/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'), path.join(home, '.local', 'share', 'fonts'))
  }
  if (环境.SEAL_FONT_DIRS) directories.push(...环境.SEAL_FONT_DIRS.split(path.delimiter).filter(Boolean))
  // 安装包附带的开源字体也要进入统一目录，保证 Linux 等系统缺少中文字体时
  // 仍有可读、可嵌入的等价字体。
  if (process.resourcesPath) {
    directories.push(path.join(process.resourcesPath, 'fonts'), path.join(process.resourcesPath, 'office-runtime', 'Fonts'))
  }
  // 开发运行时直接扫描仓库内附带字体；打包后由 extraResources 提供同一份
  // 字节，两个环境都能在系统缺少中文字体时回退到思源字体。
  const developmentFonts = path.resolve(__dirname, '..', '..', 'mobile', 'web', 'public', 'fonts')
  if (fs.existsSync(developmentFonts)) directories.push(developmentFonts)
  return [...new Set(directories.map((item) => path.resolve(item)))]
}

async function 收集字体文件(directories, depth = 0) {
  const files = []
  const seen = new Set()
  async function walk(directory, level) {
    if (level > 5) return
    let actual
    try { actual = await fsp.realpath(directory) } catch { return }
    if (seen.has(actual)) return
    seen.add(actual)
    let entries
    try { entries = await fsp.readdir(actual, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(actual, entry.name)
      if (entry.isDirectory()) { await walk(full, level + 1); continue }
      if (!entry.isFile() || !FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      files.push(full)
      if (files.length > 20000) return
    }
  }
  for (const directory of directories) await walk(directory, depth)
  return files
}

function normalizeFontRecord(face, file, source) {
  const id = idFor(source === 'custom' ? 'user' : 'system', `${file}::${face.faceIndex}`)
  return {
    标识: id,
    名称: face.family,
    家族: face.family,
    英文名: face.postScriptName || face.fullName,
    别名: face.aliases,
    样式: face.subfamily,
    字重: face.weight,
    斜体: face.italic,
    格式: face.format,
    大小: face.bytes,
    集合: face.collection,
    字面序号: face.faceIndex,
    中文字形: face.supportsCjk,
    拉丁字形: face.supportsLatin,
    可嵌入: face.embeddable,
    授权位: face.fsType,
    来源: source,
    文件路径: file,
    文件名: path.basename(file),
  }
}

function publicRecord(record) {
  if (!record) return null
  const { 文件路径, ...rest } = record
  return rest
}

function 排序字体(fonts) {
  return [...fonts].sort((left, right) => {
    if (left.中文字形 !== right.中文字形) return left.中文字形 ? -1 : 1
    if (left.来源 !== right.来源) return left.来源 === 'custom' ? -1 : 1
    return left.名称.localeCompare(right.名称, 'zh-CN')
  })
}

function 创建字体服务(依赖 = {}) {
  const 数据目录 = 依赖.数据目录
  if (!数据目录) throw new Error('缺少字体数据目录')
  const 自定义目录 = path.join(数据目录, 'fonts')
  const 缓存路径 = path.join(数据目录, CACHE_FILE)
  const 清单路径 = path.join(自定义目录, MANIFEST_FILE)
  const 选择文件 = 依赖.选择文件
  const 打开目录 = 依赖.打开目录
  let systemCache = null
  let systemPromise = null
  let customCache = null

  async function 读取缓存() {
    try {
      const parsed = JSON.parse(await fsp.readFile(缓存路径, 'utf8'))
      return parsed && parsed.version === 3 && parsed.fonts && typeof parsed.fonts === 'object' ? parsed : null
    } catch { return null }
  }

  async function 写入缓存(fonts, scannedAt) {
    await fsp.mkdir(数据目录, { recursive: true })
    const payload = { version: 3, scannedAt, fonts }
    await fsp.writeFile(缓存路径, JSON.stringify(payload))
  }

  async function 建立系统字体目录(force = false) {
    if (!force && systemCache) return systemCache
    if (systemPromise) return systemPromise
    systemPromise = (async () => {
      const directories = 依赖.字体目录 ?? 平台字体目录()
      const cache = force ? null : await 读取缓存()
      const cachedByKey = cache?.fonts ?? {}
      const files = await 收集字体文件(directories)
      const nextCache = {}
      const fonts = []
      let skipped = 0
      for (const file of files) {
        if (fonts.length >= MAX_SYSTEM_FONTS) break
        let stat
        try { stat = await fsp.stat(file) } catch { skipped += 1; continue }
        const key = `${file}|${stat.mtimeMs}|${stat.size}`
        let records = cachedByKey[key]
        if (!Array.isArray(records)) {
          try {
            const bytes = await fsp.readFile(file)
            const faces = parseFontFile(bytes, { fileName: path.basename(file) })
            records = faces.map((face) => normalizeFontRecord(face, file, 'system'))
          } catch { skipped += 1; continue }
        }
        nextCache[key] = records
        for (const record of records) {
          if (fonts.length >= MAX_SYSTEM_FONTS) break
          fonts.push(record)
        }
      }
      const scannedAt = new Date().toISOString()
      systemCache = { fonts: 排序字体(fonts), scannedAt, directories, skipped, cached: true }
      try { await 写入缓存(nextCache, scannedAt) } catch { /* 只读缓存失败不影响本次扫描 */ }
      return systemCache
    })().finally(() => { systemPromise = null })
    return systemPromise
  }

  async function 读取自定义清单() {
    if (customCache) return customCache
    try {
      const parsed = JSON.parse(await fsp.readFile(清单路径, 'utf8'))
      const records = Array.isArray(parsed?.fonts) ? parsed.fonts.filter((item) => item && typeof item.标识 === 'string' && typeof item.文件 === 'string' && fs.existsSync(path.join(自定义目录, item.文件))) : []
      customCache = { version: 1, fonts: records }
    } catch { customCache = { version: 1, fonts: [] } }
    return customCache
  }

  async function 写自定义清单(manifest) {
    await fsp.mkdir(自定义目录, { recursive: true })
    await fsp.writeFile(清单路径, JSON.stringify(manifest, null, 2) + '\n')
    customCache = manifest
  }

  function 自定义记录(record) {
    const { 文件路径, ...rest } = record
    return { ...rest, 来源: 'custom', 文件路径: 文件路径 ? path.join(自定义目录, 文件路径) : undefined }
  }

  async function 列出(选项 = {}) {
    const [system, manifest] = await Promise.all([建立系统字体目录(Boolean(选项.刷新)), 读取自定义清单()])
    const custom = manifest.fonts.map(自定义记录)
    return {
      系统: system.fonts.map(publicRecord),
      自定义: custom.map(publicRecord),
      平台: process.platform,
      扫描时间: system.scannedAt,
      目录: system.directories,
      跳过: system.skipped,
      字体目录: 自定义目录,
    }
  }

  async function 查找记录(标识) {
    const manifest = await 读取自定义清单()
    const custom = manifest.fonts.find((item) => item.标识 === 标识)
    if (custom) return 自定义记录(custom)
    const system = await 建立系统字体目录(false)
    return system.fonts.find((item) => item.标识 === 标识) ?? null
  }

  async function 读取字体(标识) {
    const record = await 查找记录(标识)
    if (!record) throw new Error('字体不存在或已被移除')
    const filename = record.来源 === 'custom' ? path.join(自定义目录, manifestFileName(record)) : record.文件路径
    let bytes
    try { bytes = await fsp.readFile(filename) } catch { throw new Error('字体文件已不可读取，请重新导入或刷新系统字体') }
    if (bytes.length > MAX_FONT_BYTES) throw new Error('字体文件超过 96 MiB')
    const face = record.集合 ? extractFontFace(bytes, record.字面序号) : bytes
    if (face.length > MAX_FONT_BYTES) throw new Error('拆出的字面超过 96 MiB')
    return { ...publicRecord(record), 数据: face.toString('base64') }
  }

  function manifestFileName(record) {
    const manifest = customCache
    const stored = manifest?.fonts.find((item) => item.标识 === record.标识)
    if (!stored?.文件) throw new Error('字体记录缺少文件')
    return stored.文件
  }

  async function 导入字体() {
    if (typeof 选择文件 !== 'function') throw new Error('当前环境不支持选择字体文件')
    const selected = await 选择文件()
    if (!selected || selected.length === 0) return { 已取消: true, 导入: [], 重复: [], 失败: [] }
    await fsp.mkdir(自定义目录, { recursive: true })
    const manifest = await 读取自定义清单()
    const 导入 = [], 重复 = [], 失败 = []
    for (const source of selected) {
      const extension = path.extname(source).toLowerCase()
      if (!FONT_EXTENSIONS.has(extension)) { 失败.push({ 文件: path.basename(source), 原因: '只支持 TTF、OTF 或 TTC 字体' }); continue }
      try {
        const stat = await fsp.stat(source)
        if (stat.size < 12 || stat.size > MAX_FONT_BYTES) throw new Error('字体文件超过 96 MiB')
        const bytes = await fsp.readFile(source)
        const digest = sha256(bytes)
        const faces = parseFontFile(bytes, { fileName: path.basename(source) })
        const existing = new Set(manifest.fonts.filter((item) => item.文件哈希 === digest).map((item) => item.字面序号))
        if (faces.every((face) => existing.has(face.faceIndex))) {
          重复.push({ 名称: faces[0]?.family || path.basename(source), 文件: path.basename(source) })
          continue
        }
        const storedName = `${digest.slice(0, 16)}${extension}`
        const target = path.join(自定义目录, storedName)
        try { await fsp.writeFile(target, bytes, { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error }
        for (const face of faces) {
          const id = idFor('user', `${target}::${face.faceIndex}`)
          if (manifest.fonts.some((item) => item.标识 === id)) { 重复.push({ 名称: face.family, 文件: path.basename(source) }); continue }
          const record = normalizeFontRecord(face, target, 'custom')
          const stored = {
            标识: id, 名称: record.名称, 家族: record.家族, 英文名: record.英文名, 别名: record.别名,
            样式: record.样式, 字重: record.字重, 斜体: record.斜体, 格式: record.格式, 大小: record.大小,
            集合: record.集合, 字面序号: face.faceIndex, 中文字形: record.中文字形, 拉丁字形: record.拉丁字形,
            可嵌入: record.可嵌入, 授权位: record.授权位, 来源: 'custom', 文件: storedName,
            文件哈希: digest, 导入时间: new Date().toISOString(), 原始文件名: path.basename(source),
          }
          manifest.fonts.push(stored)
          导入.push(publicRecord(record))
        }
      } catch (error) {
        失败.push({ 文件: path.basename(source), 原因: error instanceof Error ? error.message : '字体解析失败' })
      }
    }
    if (manifest.fonts.length > MAX_CUSTOM_FONTS) {
      for (const item of manifest.fonts.slice(MAX_CUSTOM_FONTS)) 失败.push({ 文件: item.原始文件名 || item.文件, 原因: '自定义字体数量超过 256 个' })
      manifest.fonts = manifest.fonts.slice(0, MAX_CUSTOM_FONTS)
    }
    if (导入.length > 0) await 写自定义清单(manifest)
    return { 导入, 重复, 失败 }
  }

  async function 移除字体(标识) {
    const manifest = await 读取自定义清单()
    const target = manifest.fonts.find((item) => item.标识 === 标识)
    if (!target) throw new Error('只能移除通过海豹办公导入的字体')
    const sameFile = manifest.fonts.filter((item) => item.文件 === target.文件)
    manifest.fonts = manifest.fonts.filter((item) => item.文件 !== target.文件)
    await 写自定义清单(manifest)
    if (!manifest.fonts.some((item) => item.文件 === target.文件)) {
      try { await fsp.unlink(path.join(自定义目录, target.文件)) } catch { /* 文件已消失时仍以清单为准 */ }
    }
    return { 移除: sameFile.map((item) => item.名称) }
  }

  async function 打开字体目录() {
    await fsp.mkdir(自定义目录, { recursive: true })
    if (typeof 打开目录 !== 'function') return { 路径: 自定义目录 }
    await 打开目录(自定义目录)
    return { 路径: 自定义目录 }
  }

  return { 列出, 读取字体, 导入字体, 移除字体, 打开字体目录, 建立系统字体目录 }
}

module.exports = { 创建字体服务, 平台字体目录, 收集字体文件, _internals: { normalizeFontRecord, publicRecord, 排序字体 } }
