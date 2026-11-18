// 安装包使用隔离目录与合成文件，验证可选平台、流式上传和公开下载边界。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash, scryptSync } = require('node:crypto')
const http = require('node:http')
const JSZip = require('jszip')
const { createCloud } = require('../index.cjs')
const { listenLoopback } = require('./collaborationFixture.cjs')

function installer(size = 512) {
  const bytes = Buffer.alloc(size, 7)
  bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.write('PE\0\0', 128)
  return bytes
}
function diskImage() {
  const bytes = Buffer.alloc(2048), trailer = bytes.subarray(-512)
  trailer.write('koly'); trailer.writeUInt32BE(4, 4); trailer.writeUInt32BE(512, 8)
  trailer.writeBigUInt64BE(1024n, 32); trailer.writeUInt32BE(1, 56); trailer.writeUInt32BE(1, 60)
  trailer.writeBigUInt64BE(1024n, 216); trailer.writeBigUInt64BE(512n, 224); trailer.writeBigUInt64BE(2n, 492)
  return bytes
}
async function archive(entries) {
  const zip = new JSZip()
  for (const name of entries) zip.file(name, '隔离验收资料')
  return zip.generateAsync({ type: 'nodebuffer' })
}
function zip64(bytes) {
  const end = Buffer.from(bytes.subarray(-22)), offset = bytes.length - 22
  const record = Buffer.alloc(56), locator = Buffer.alloc(20)
  record.writeUInt32LE(0x06064b50); record.writeBigUInt64LE(44n, 4); record.writeUInt16LE(45, 12); record.writeUInt16LE(45, 14)
  record.writeBigUInt64LE(BigInt(end.readUInt16LE(8)), 24); record.writeBigUInt64LE(BigInt(end.readUInt16LE(10)), 32)
  record.writeBigUInt64LE(BigInt(end.readUInt32LE(12)), 40); record.writeBigUInt64LE(BigInt(end.readUInt32LE(16)), 48)
  locator.writeUInt32LE(0x07064b50); locator.writeBigUInt64LE(BigInt(offset), 8); locator.writeUInt32LE(1, 16)
  end.fill(255, 4, 20)
  return Buffer.concat([bytes.subarray(0, offset), record, locator, end])
}
async function fixture(t, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-release-assets-'))
  const cloud = await createCloud({ directory, sms: { configured: true, send: async () => {} }, env: {
    SEAL_ADMIN_PASSWORD_HASH: scryptSync('验收密码', 'seal-admin-v1', 32).toString('hex'), ...env,
  } })
  await listenLoopback(cloud.server)
  const base = `http://127.0.0.1:${cloud.server.address().port}`
  t.after(async () => { await cloud.close(); fs.rmSync(directory, { recursive: true, force: true }) })
  const request = async (route, body, token, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json() }
  }
  const token = (await request('/v1/admin/login', { username: 'admin', password: '验收密码' })).body.token
  const upload = async (platform, version, filename, bytes, authorization = token) => {
    const query = new URLSearchParams({ platform, version, filename })
    const response = await fetch(base + '/v1/admin/release-assets?' + query, { method: 'POST', headers: {
      'Content-Type': 'application/octet-stream', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
    }, body: bytes })
    return { status: response.status, body: await response.json() }
  }
  const download = (asset, options) => fetch(base + new URL(asset.url).pathname.replace(/^\/api/, ''), options)
  return { directory, cloud, base, request, token, upload, download }
}

test('大于普通接口上限的安装包流式上传并由服务端生成校验值，发布前不可下载', async t => {
  const f = await fixture(t), bytes = installer(3 * 1024 * 1024 + 11)
  const result = await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', bytes)
  assert.equal(result.status, 200)
  const item = result.body.item
  assert.equal(item.platform, 'windows'); assert.equal(item.version, '2.7.2')
  assert.equal(item.bytes, bytes.length)
  assert.equal(item.sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal((await f.download(item)).status, 404)
  assert.ok(fs.readdirSync(path.join(f.directory, 'release-assets')).every(name => !name.endsWith('.part')))
})

test('只发布所选平台，旧版单条接口仍可用，公开下载与范围读取返回真实安装包', async t => {
  const f = await fixture(t), bytes = installer()
  const asset = (await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', bytes)).body.item
  const result = await f.request('/v1/admin/releases/batch', { version: '2.7.2', notes: '隔离验收', platforms: [{ platform: 'windows', assetId: asset?.id }] }, f.token)
  assert.equal(result.status, 200); assert.equal(result.body.items.length, 1)
  const latest = await f.request('/v1/updates/latest?platform=windows&version=2.7.1')
  assert.equal(latest.status, 200); assert.equal(latest.body.version, '2.7.2')
  assert.equal(latest.body.bytes, bytes.length)
  assert.deepEqual((await f.request('/v1/updates/latest?platform=android&version=2.7.1')).body, { hasUpdate: false })
  const response = await f.download(asset)
  assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  const head = await f.download(asset, { method: 'HEAD' })
  assert.equal(head.headers.get('content-length'), String(bytes.length)); assert.equal((await head.arrayBuffer()).byteLength, 0)
  const part = await f.download(asset, { headers: { Range: 'bytes=0-15' } })
  assert.equal(part.status, 206); assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(0, 16))
  assert.equal((await f.download(asset, { headers: { Range: 'bytes=900-1000' } })).status, 416)
  assert.equal((await f.request('/v1/admin/releases', { platform: 'web', version: '2.7.1', notes: '保留旧版协议' }, f.token)).status, 200)
  assert.equal((await f.request('/v1/admin/releases/' + result.body.items[0].id, { withdrawn: true }, f.token, 'PATCH')).status, 200)
  assert.equal((await f.download(asset)).status, 404)
})

test('同版本修复包可由管理员安全替换附件，校验平台与版本并保留其他发布信息', async t => {
  const f = await fixture(t), first = installer(), second = installer()
  second[200] = 8
  const old = (await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', first)).body.item
  const next = (await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', second)).body.item
  const other = (await f.upload('windows', '2.7.3', 'seal-office-setup-2.7.3.exe', installer())).body.item
  const created = await f.request('/v1/admin/releases', { platform:'windows', version:'2.7.2', notes:'原说明', assetId:old.id }, f.token)
  const id = created.body.item.id
  assert.equal((await f.request('/v1/admin/releases/' + id, {assetId:next.id}, '', 'PATCH')).status, 401)
  assert.equal((await f.request('/v1/admin/releases/' + id, {assetId:other.id}, f.token, 'PATCH')).status, 400)
  assert.equal((await f.request('/v1/admin/releases/' + id, {assetId:next.id, expectedAssetId:'outdated'}, f.token, 'PATCH')).status, 409)
  assert.equal((await f.request('/v1/admin/releases', null, f.token)).body.items[0].assetId, old.id)
  assert.equal((await f.download(old)).status, 200)
  const changed = await f.request('/v1/admin/releases/' + id, {assetId:next.id, expectedAssetId:old.id, bytes:1, sha256:'a'.repeat(64)}, f.token, 'PATCH')
  assert.equal(changed.status, 200)
  assert.equal(changed.body.item.assetId, next.id)
  assert.equal(changed.body.item.sha256, createHash('sha256').update(second).digest('hex'))
  assert.equal(changed.body.item.bytes, second.length)
  assert.equal(changed.body.item.notes, '原说明')
  assert.deepEqual(Buffer.from(await (await f.download(next)).arrayBuffer()), second)
  assert.equal((await f.download(old)).status, 404)
  const latest = await f.request('/v1/updates/latest?platform=windows&version=2.7.1')
  assert.equal(latest.body.sha256, changed.body.item.sha256)
  assert.deepEqual((await f.request('/v1/updates/latest?platform=windows&version=2.7.2')).body, {hasUpdate:false})
})

test('批量发布先校验全部平台，错配、重复和旧记录冲突均不会写入任何新记录', async t => {
  const f = await fixture(t)
  const asset = (await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', installer())).body.item
  for (const platforms of [[], [{ platform: 'android', assetId: asset?.id }], [{ platform: 'windows', assetId: asset?.id }, { platform: 'windows', assetId: asset?.id }]]) {
    assert.equal((await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms }, f.token)).status, 400)
  }
  assert.equal((await f.request('/v1/admin/releases/batch', { version: '2.7.3', platforms: [{ platform: 'windows', assetId: asset?.id }] }, f.token)).status, 400)
  assert.equal((await f.request('/v1/admin/releases', null, f.token)).body.items.length, 0)
  await f.request('/v1/admin/releases', { platform: 'web', version: '2.7.2', notes: '已有记录' }, f.token)
  assert.equal((await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'windows', assetId: asset?.id }, { platform: 'web' }] }, f.token)).status, 409)
  const items = (await f.request('/v1/admin/releases', null, f.token)).body.items
  assert.equal(items.length, 1); assert.equal(items[0].notes, '已有记录')
})

test('安装包上传鉴权、大小、文件名版本、路径及二进制格式均在发布前校验', async t => {
  const f = await fixture(t, { SEAL_RELEASE_MAX_BYTES: '1024' })
  assert.equal((await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', installer(), '')).status, 401)
  assert.equal((await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', installer(2048))).status, 413)
  for (const filename of ['../seal-office-setup-2.7.2.exe', 'seal-office-setup-2.7.1.exe', 'seal-office-2.7.2-android.apk']) {
    assert.equal((await f.upload('windows', '2.7.2', filename, installer())).status, 400)
  }
  assert.equal((await f.upload('windows', '2.7.2', 'seal-office-setup-2.7.2.exe', Buffer.from('不是安装程序'))).status, 400)
  assert.equal((await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'web' }] })).status, 401)
  assert.deepEqual(fs.readdirSync(path.join(f.directory, 'release-assets')), [])
})

test('安卓、鸿蒙、商店和网页压缩包按内部结构区分，不能只改扩展名冒充其他平台', async t => {
  const f = await fixture(t)
  const apk = await archive(['AndroidManifest.xml', 'classes.dex'])
  assert.equal((await f.upload('harmony', '2.7.2', 'seal-office-2.7.2-harmony.hap', apk)).status, 400)
  assert.equal((await f.upload('android', '2.7.2', 'seal-office-2.7.2-android.apk', apk)).status, 200)
  const store = (await f.upload('windows-store', '2.7.2', 'seal-office-2.7.2-microsoft-store-x64.msix', await archive(['AppxManifest.xml', 'AppxBlockMap.xml', '[Content_Types].xml']))).body.item
  const storeUrl = 'ms-windows-store://pdp/?productid=9NGPL705R5Z3'
  const result = await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'windows-store', assetId: store?.id, url: storeUrl }] }, f.token)
  assert.equal(result.status, 200)
  assert.equal((await f.request('/v1/updates/latest?platform=windows-store&version=2.7.1')).body.url, storeUrl)
  assert.equal(result.body.items[0].asset.id, store.id)
})

test('新增 Ubuntu 平台与原平台隔离，安装包版本不可被客户端伪造的元数据覆盖', async t => {
  const f = await fixture(t)
  const deb = Buffer.concat([Buffer.from('!<arch>\n'), Buffer.alloc(64)])
  const asset = (await f.upload('linux', '2.7.2', 'seal-office-2.7.2-amd64.deb', deb)).body.item
  const result = await f.request('/v1/admin/releases', { platform: 'linux', version: '2.7.2', assetId: asset?.id, sha256: 'f'.repeat(64), bytes: 1 }, f.token)
  assert.equal(result.status, 200)
  assert.equal(result.body.item.bytes, deb.length)
  assert.equal(result.body.item.sha256, createHash('sha256').update(deb).digest('hex'))
  assert.equal((await f.request('/v1/updates/latest?platform=linux&version=2.7.1')).body.version, '2.7.2')
  assert.deepEqual((await f.request('/v1/updates/latest?platform=windows&version=2.7.1')).body, { hasUpdate: false })
})

test('macOS DMG 上传、批量发布和匿名查询独立于其他平台，未选平台不会误发', async t => {
  const f = await fixture(t), bytes = diskImage()
  const before = await f.request('/v1/updates/latest?platform=macos&version=2.7.1')
  assert.equal(before.status, 200); assert.deepEqual(before.body, { hasUpdate: false })
  const missing = await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'macos' }] }, f.token)
  assert.equal(missing.status, 400)
  const uploaded = await f.upload('macos', '2.7.2', 'seal-office-2.7.2-macos.dmg', bytes)
  assert.equal(uploaded.status, 200)
  const asset = uploaded.body.item
  assert.equal((await f.download(asset)).status, 404)
  assert.equal((await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'windows', assetId: asset.id }] }, f.token)).status, 400)
  const published = await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'macos', assetId: asset.id }] }, f.token)
  assert.equal(published.status, 200); assert.equal(published.body.items.length, 1)
  const latest = await f.request('/v1/updates/latest?platform=macos&version=2.7.1')
  assert.equal(latest.body.version, '2.7.2'); assert.equal(latest.body.bytes, bytes.length)
  assert.equal(latest.body.sha256, createHash('sha256').update(bytes).digest('hex'))
  for (const platform of ['windows', 'windows-store', 'linux', 'web', 'android', 'harmony']) assert.deepEqual((await f.request('/v1/updates/latest?platform=' + platform + '&version=2.7.1')).body, { hasUpdate: false })
  assert.deepEqual(Buffer.from(await (await f.download(asset)).arrayBuffer()), bytes)
})

test('macOS 拒绝改名文件、无效 UDIF 尾部和越界 64 位区间，失败不留附件', async t => {
  const f = await fixture(t)
  const mutations = [
    bytes => bytes.fill(0, bytes.length - 512, bytes.length - 508),
    bytes => bytes.writeUInt32BE(3, bytes.length - 508),
    bytes => bytes.writeUInt32BE(511, bytes.length - 504),
    bytes => bytes.writeBigUInt64BE(0n, bytes.length - 480),
    bytes => bytes.writeBigUInt64BE(2048n, bytes.length - 488),
    bytes => bytes.writeBigUInt64BE(0xffffffffffffffffn, bytes.length - 480),
    bytes => bytes.writeBigUInt64BE(1500n, bytes.length - 296),
    bytes => bytes.writeBigUInt64BE(2048n, bytes.length - 464),
    bytes => bytes.writeUInt32BE(2, bytes.length - 452),
    bytes => bytes.writeBigUInt64BE(0n, bytes.length - 20),
  ]
  for (const change of mutations) {
    const bytes = diskImage(); change(bytes)
    const result = await f.upload('macos', '2.7.2', 'seal-office-2.7.2-macos.dmg', bytes)
    assert.equal(result.status, 400); assert.match(result.body.error, /DMG|UDIF/)
  }
  for (const bytes of [installer(), Buffer.from('koly'), await archive(['index.html'])]) assert.equal((await f.upload('macos', '2.7.2', 'seal-office-2.7.2-macos.dmg', bytes)).status, 400)
  assert.equal((await f.upload('macos', '2.7.2', 'seal-office-2.7.1-macos.dmg', diskImage())).status, 400)
  assert.deepEqual(fs.readdirSync(path.join(f.directory, 'release-assets')), [])
  assert.equal((await f.request('/v1/admin/releases', null, f.token)).body.items.length, 0)
})

test('macOS 接受无 XML 的单文件 UDIF，原六平台附件仍可分别上传', async t => {
  const f = await fixture(t), stub = diskImage()
  stub.writeBigUInt64BE(0n, stub.length - 296); stub.writeBigUInt64BE(0n, stub.length - 288)
  stub.writeUInt32BE(0, stub.length - 456); stub.writeUInt32BE(0, stub.length - 452)
  assert.equal((await f.upload('macos', '2.7.2', 'seal-office-2.7.2-macos.dmg', stub)).status, 200)
  const samples = [
    ['windows', 'seal-office-setup-2.7.2.exe', installer()],
    ['windows-store', 'seal-office-2.7.2-microsoft-store-x64.msix', await archive(['AppxManifest.xml', 'AppxBlockMap.xml', '[Content_Types].xml'])],
    ['linux', 'seal-office-2.7.2-amd64.deb', Buffer.concat([Buffer.from('!<arch>\n'), Buffer.alloc(64)])],
    ['web', 'seal-office-2.7.2-web.zip', await archive(['index.html', 'assets/app.js'])],
    ['android', 'seal-office-2.7.2-android.apk', await archive(['AndroidManifest.xml', 'classes.dex'])],
    ['harmony', 'seal-office-2.7.2-harmony.hap', await archive(['module.json', 'ets/modules.abc'])],
  ]
  for (const [platform, filename, bytes] of samples) assert.equal((await f.upload(platform, '2.7.2', filename, bytes)).status, 200, platform)
})

test('单项新建 macOS 必须绑定已校验 DMG，历史无附件记录仍可修改备注和上下架', async t => {
  const f = await fixture(t)
  const result = await f.request('/v1/admin/releases', { platform: 'macos', version: '2.7.2', url: 'https://example.com/pretend.dmg', sha256: 'a'.repeat(64), bytes: 2048 }, f.token)
  assert.equal(result.status, 400); assert.match(result.body.error, /macOS.*已校验.*DMG/)
  assert.equal((await f.request('/v1/admin/releases', null, f.token)).body.items.length, 0)
  const id = '11111111-1111-4111-8111-111111111111'
  f.cloud.db.run('INSERT INTO releases(id,platform,version,channel,url,notes,published,withdrawn) VALUES(?,?,?,?,?,?,?,?)', [id, 'macos', '2.7.1', 'stable', 'https://example.com/legacy.dmg', '历史记录', Date.now(), 0])
  const edited = await f.request('/v1/admin/releases/' + id, { notes: '更新历史备注', withdrawn: true }, f.token, 'PATCH')
  assert.equal(edited.status, 200); assert.equal(edited.body.item.notes, '更新历史备注'); assert.equal(edited.body.item.withdrawn, true)
  assert.equal((await f.request('/v1/admin/releases/' + id, { withdrawn: false }, f.token, 'PATCH')).status, 200)
})

test('批量新建 macOS 不接受仅 URL 的伪包，已绑定附件的 PATCH 继续使用服务器元数据', async t => {
  const f = await fixture(t)
  const result = await f.request('/v1/admin/releases/batch', { version: '2.7.2', platforms: [{ platform: 'web' }, { platform: 'macos', url: 'https://example.com/pretend.dmg', sha256: 'a'.repeat(64), bytes: 2048 }] }, f.token)
  assert.equal(result.status, 400); assert.match(result.body.error, /macOS.*已校验.*DMG/)
  assert.equal((await f.request('/v1/admin/releases', null, f.token)).body.items.length, 0)
  const asset = (await f.upload('macos', '2.7.2', 'seal-office-2.7.2-macos.dmg', diskImage())).body.item
  const created = await f.request('/v1/admin/releases', { platform: 'macos', version: '2.7.2', assetId: asset.id }, f.token)
  assert.equal(created.status, 200)
  const edited = await f.request('/v1/admin/releases/' + created.body.item.id, { url: 'https://example.com/other.zip', bytes: 1, sha256: 'b'.repeat(64), notes: '只修改说明' }, f.token, 'PATCH')
  assert.equal(edited.status, 200); assert.equal(edited.body.item.url, asset.url); assert.equal(edited.body.item.bytes, asset.bytes); assert.equal(edited.body.item.sha256, asset.sha256)
})

test('微软打包工具生成的 ZIP64 商店安装包可以流式验证和上传', async t => {
  const f = await fixture(t)
  const bytes = zip64(await archive(['AppxManifest.xml', 'AppxBlockMap.xml', '[Content_Types].xml']))
  const result = await f.upload('windows-store', '2.7.2', 'seal-office-2.7.2-microsoft-store-x64.msix', bytes)
  assert.equal(result.status, 200)
  assert.equal(result.body.item.bytes, bytes.length)
})

test('中断安装包上传会清除临时文件且不生成发布记录', async t => {
  const f = await fixture(t)
  const query = new URLSearchParams({ platform: 'windows', version: '2.7.2', filename: 'seal-office-setup-2.7.2.exe' })
  const request = http.request(f.base + '/v1/admin/release-assets?' + query, { method: 'POST', headers: {
    Authorization: `Bearer ${f.token}`, 'Content-Type': 'application/octet-stream', 'Content-Length': 1024 * 1024,
  } })
  request.on('error', () => {})
  request.write(installer())
  const root = path.join(f.directory, 'release-assets')
  for (let i = 0; i < 50 && !fs.readdirSync(root).some(name => name.endsWith('.part')); i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(fs.readdirSync(root).some(name => name.endsWith('.part')))
  request.destroy()
  for (let i = 0; i < 50 && fs.readdirSync(root).length; i++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(fs.readdirSync(root), [])
  assert.equal((await f.request('/v1/admin/releases', null, f.token)).body.items.length, 0)
})
