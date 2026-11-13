// 管理员安装包存储：顺序写盘、服务端摘要、平台结构校验；未上架文件不公开。
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { parseVersion } = require('./releases.cjs')

const MAX_BYTES = 1024 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const filenames = {
  windows: version => `seal-office-setup-${version}.exe`,
  'windows-store': version => `seal-office-${version}-microsoft-store-x64.msix`,
  macos: version => `seal-office-${version}-macos.dmg`,
  linux: version => `seal-office-${version}-amd64.deb`,
  web: version => `seal-office-${version}-web.zip`,
  android: version => `seal-office-${version}-android.apk`,
  harmony: version => `seal-office-${version}-harmony.hap`,
}
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const remove = filename => { try { fs.unlinkSync(filename) } catch (error) { if (error.code !== 'ENOENT') throw error } }

async function readAt(file, length, offset) {
  const bytes = Buffer.alloc(length)
  const { bytesRead } = await file.read(bytes, 0, length, offset)
  if (bytesRead !== length) fail(400, '安装包内容不完整，请重新选择文件')
  return bytes
}

/** 只读取压缩包目录，不解压整个安装包；内存上限与安装包总大小无关。 */
async function zipEntries(file, size) {
  if (size < 22) fail(400, '安装包不是有效的压缩容器')
  const tail = await readAt(file, Math.min(size, 65557), Math.max(0, size - 65557))
  let end = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break }
  }
  if (end < 0) fail(400, '安装包压缩目录无效')
  let count = tail.readUInt16LE(end + 10), length = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16), directoryEnd = size - tail.length + end
  if (count === 65535 || length === 0xffffffff || offset === 0xffffffff) {
    // 微软打包工具即使文件不足 4 GiB 也会写 ZIP64，不能将占位值当作分卷号。
    if (end < 20 || tail.readUInt32LE(end - 20) !== 0x07064b50 || tail.readUInt32LE(end - 16) !== 0 || tail.readUInt32LE(end - 4) !== 1) fail(400, '安装包 ZIP64 定位记录无效')
    const position = Number(tail.readBigUInt64LE(end - 12))
    if (!Number.isSafeInteger(position) || position < 0 || position + 56 > directoryEnd - 20) fail(400, '安装包 ZIP64 目录位置无效')
    const record = await readAt(file, 56, position)
    if (record.readUInt32LE(0) !== 0x06064b50 || record.readBigUInt64LE(4) < 44n || record.readUInt32LE(16) || record.readUInt32LE(20) || record.readBigUInt64LE(24) !== record.readBigUInt64LE(32)) fail(400, '安装包 ZIP64 目录无效，不支持分卷文件')
    count = Number(record.readBigUInt64LE(32)); length = Number(record.readBigUInt64LE(40)); offset = Number(record.readBigUInt64LE(48)); directoryEnd = position
  } else if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || tail.readUInt16LE(end + 8) !== count) fail(400, '安装包压缩目录无效，不支持分卷文件')
  if (![count, length, offset].every(Number.isSafeInteger) || count <= 0 || count > 50000 || length < 0 || offset < 0 || length > 16 * 1024 * 1024 || offset + length > directoryEnd) fail(400, '安装包压缩目录超出允许范围')
  const directory = await readAt(file, length, offset), names = new Set()
  let cursor = 0
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > length || directory.readUInt32LE(cursor) !== 0x02014b50) fail(400, '安装包压缩目录损坏')
    const nameLength = directory.readUInt16LE(cursor + 28), extraLength = directory.readUInt16LE(cursor + 30), commentLength = directory.readUInt16LE(cursor + 32)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (!nameLength || nameLength > 2048 || next > length || directory.readUInt16LE(cursor + 8) & 1) fail(400, '安装包包含无效或加密文件')
    const name = directory.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    if (name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').includes('..') || /^[A-Za-z]:/.test(name)) fail(400, '安装包包含不安全的文件路径')
    names.add(name); cursor = next
  }
  if (cursor !== length) fail(400, '安装包压缩目录长度不一致')
  return names
}

async function validatePackage(filename, platform, size) {
  const file = await fs.promises.open(filename, 'r')
  try {
    if (platform === 'macos') {
      // UDIF 结构依据 QEMU 的 DMG 驱动及 libmodi 格式文档；只读末尾，不装载整包。
      // https://github.com/qemu/qemu/blob/master/block/dmg.c
      // https://github.com/libyal/libmodi/blob/main/documentation/Mac%20OS%20disk%20image%20types.asciidoc
      if (size <= 512) fail(400, 'macOS DMG 缺少完整的 UDIF 数据和尾部')
      const trailer = await readAt(file, 512, size - 512), limit = BigInt(size - 512)
      if (trailer.toString('ascii', 0, 4) !== 'koly' || trailer.readUInt32BE(4) !== 4 || trailer.readUInt32BE(8) !== 512) fail(400, 'macOS DMG 的 UDIF 尾部格式无效')
      if (trailer.readUInt32BE(56) > 1 || trailer.readUInt32BE(60) > 1 || trailer.readBigUInt64BE(16) !== 0n) fail(400, 'macOS DMG 必须为完整的单文件 UDIF，不能上传分段文件')
      const ranges = [[24, 32], [40, 48], [216, 224]].map(([offset, length]) => [trailer.readBigUInt64BE(offset), trailer.readBigUInt64BE(length)])
      if (ranges[0][1] === 0n || trailer.readBigUInt64BE(492) === 0n) fail(400, 'macOS DMG 的 UDIF 数据区为空')
      for (const [offset, length] of ranges) if (offset > limit || length > limit - offset) fail(400, 'macOS DMG 的 UDIF 数据区或索引超出文件范围')
      // XML 可为空（合法 UDIF 占位映像）；非空数据区不能与资源或 XML 索引重叠。
      const occupied = ranges.filter(([, length]) => length > 0n).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
      for (let index = 1; index < occupied.length; index++) if (occupied[index][0] < occupied[index - 1][0] + occupied[index - 1][1]) fail(400, 'macOS DMG 的 UDIF 数据区和索引发生重叠')
      return
    }
    if (platform === 'windows') {
      if (size < 64) fail(400, 'Windows 安装包格式无效，请上传安装程序')
      const header = await readAt(file, 64, 0), offset = header.readUInt32LE(60)
      if (header.toString('ascii', 0, 2) !== 'MZ' || offset < 64 || offset > Math.min(size - 4, 1024 * 1024) || (await readAt(file, 4, offset)).toString('ascii') !== 'PE\0\0') fail(400, 'Windows 安装包格式无效，请上传安装程序')
      return
    }
    if (platform === 'linux') {
      if (size < 8 || (await readAt(file, 8, 0)).toString('ascii') !== '!<arch>\n') fail(400, 'Ubuntu 安装包格式无效，请上传 DEB 文件')
      return
    }
    const names = await zipEntries(file, size)
    const valid = platform === 'android' ? names.has('AndroidManifest.xml') && names.has('classes.dex') && !names.has('module.json')
      : platform === 'harmony' ? names.has('module.json') && names.has('ets/modules.abc') && !names.has('AndroidManifest.xml')
      : platform === 'windows-store' ? ['AppxManifest.xml', 'AppxBlockMap.xml', '[Content_Types].xml'].every(name => names.has(name))
      : platform === 'web' ? names.has('index.html') && [...names].some(name => /^assets\/.+\.js$/.test(name)) && !names.has('AndroidManifest.xml') && !names.has('AppxManifest.xml')
      : false
    if (!valid) fail(400, '安装包内容与所选平台不一致，请选择对应平台的正式安装包')
  } finally { await file.close() }
}

function createReleaseAssets({ directory, db, env = process.env, clock = Date.now, audit }) {
  const root = path.join(directory, 'release-assets')
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  const configuredLimit = Number(env.SEAL_RELEASE_MAX_BYTES || MAX_BYTES)
  if (!Number.isSafeInteger(configuredLimit) || configuredLimit <= 0 || configuredLimit > MAX_BYTES) throw new Error('安装包上传上限配置无效')
  const publicBase = String(env.SEAL_PUBLIC_API_URL || 'https://seal.xingmasoft.com/api').replace(/\/$/, '')
  const origin = new URL(publicBase)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash) throw new Error('安装包公开服务地址必须是有效的 HTTPS 地址')
  let reserved = 0
  const fileFor = item => path.join(root, item.id + path.extname(item.filename))
  function get(id) {
    if (typeof id !== 'string' || !UUID.test(id)) fail(400, '安装包标识无效')
    let item
    try { item = JSON.parse(fs.readFileSync(path.join(root, id + '.json'), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') fail(404, '安装包不存在，请重新上传'); fail(503, '安装包记录暂时不可用，请联系管理员') }
    if (item.id !== id || !filenames[item.platform] || !parseVersion(item.version) || item.filename !== filenames[item.platform](item.version) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) fail(503, '安装包记录不完整，请联系管理员')
    if (!fs.existsSync(fileFor(item)) || fs.statSync(fileFor(item)).size !== item.bytes) fail(503, '安装包文件不完整，请联系管理员重新上传')
    return { ...item, url: `${publicBase}/v1/release-assets/${item.id}/${item.filename}` }
  }
  async function upload({ req, url, reply }) {
    const platform = url.searchParams.get('platform'), version = url.searchParams.get('version'), filename = url.searchParams.get('filename')
    if (!Object.hasOwn(filenames, platform)) fail(400, '上传平台无效')
    if (!parseVersion(version)) fail(400, '上传版本号无效')
    if (filename !== filenames[platform](version)) fail(400, `安装包文件名与平台或版本不一致，应为 ${filenames[platform](version)}`)
    if (req.headers['content-type']?.split(';')[0] !== 'application/octet-stream') fail(415, '请按安装包文件流上传')
    const declared = req.headers['content-length'], total = Number(declared)
    if (typeof declared !== 'string' || !/^\d+$/.test(declared) || !Number.isSafeInteger(total) || total <= 0) fail(411, '上传安装包必须提供准确的文件字节数')
    if (total > configuredLimit) fail(413, `安装包超过上传上限（${Math.floor(configuredLimit / 1024 / 1024)} MiB）`)
    const disk = fs.statfsSync(root)
    if (Number(disk.bavail) * Number(disk.bsize) < reserved + total + 2 * 1024 * 1024 * 1024) fail(503, '服务器存储余量不足，请联系管理员后重试')
    const id = randomUUID(), temp = path.join(root, id + '.part'), target = path.join(root, id + path.extname(filename)), metadata = path.join(root, id + '.json')
    reserved += total
    let file, complete = false
    try {
      file = await fs.promises.open(temp, 'wx', 0o600)
      const digest = createHash('sha256'); let received = 0
      for await (const chunk of req) {
        received += chunk.length
        if (received > total) fail(413, '安装包实际大小超出声明，上传已取消')
        digest.update(chunk)
        await file.writeFile(chunk)
      }
      if (received !== total || !req.complete) fail(400, '安装包上传不完整，请重新上传')
      await file.sync(); await file.close(); file = null
      await validatePackage(temp, platform, received)
      const item = { id, platform, version, filename, bytes: received, sha256: digest.digest('hex'), createdAt: clock() }
      await fs.promises.rename(temp, target)
      fs.writeFileSync(metadata, JSON.stringify(item), { flag: 'wx', mode: 0o600 })
      db.transaction(() => audit('admin', 'release-asset-upload', JSON.stringify({ platform, version, filename, bytes: received })))
      complete = true
      reply({ item: get(id) })
    } finally {
      reserved -= total
      if (file) await file.close()
      remove(temp)
      if (!complete) { remove(target); remove(metadata) }
    }
  }
  async function handleAdmin(context) {
    if (context.route !== '/v1/admin/release-assets' || context.method !== 'POST') return false
    await upload(context)
    return true
  }
  function handlePublic({ route, method, req, res }) {
    const match = /^\/v1\/release-assets\/([0-9a-f-]{36})\/([^/]+)$/.exec(route)
    if (!match || !['GET', 'HEAD'].includes(method)) return false
    if (!db.one('SELECT id FROM releases WHERE asset_id=? AND withdrawn=0', [match[1]])) fail(404, '安装包尚未发布或已经下架')
    const item = get(match[1])
    if (match[2] !== item.filename) fail(404, '安装包文件名不存在')
    let start = 0, end = item.bytes - 1
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
      if (!range || (!range[1] && !range[2])) fail(416, '请求的安装包范围无效')
      if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end }
      else { const suffix = Number(range[2]); if (suffix <= 0) fail(416, '请求的安装包范围无效'); start = Math.max(0, item.bytes - suffix) }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= item.bytes) fail(416, '请求的安装包范围无效')
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${item.bytes}`)
    }
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${item.filename}"`)
    res.setHeader('Content-Length', end - start + 1)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('ETag', `"${item.sha256}"`)
    if (method === 'HEAD') res.end()
    else {
      const stream = fs.createReadStream(fileFor(item), { start, end })
      stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res)
    }
    return true
  }
  return { get, handleAdmin, handlePublic, maxBytes: configuredLimit }
}

module.exports = { MAX_BYTES, filenames, validatePackage, createReleaseAssets }
