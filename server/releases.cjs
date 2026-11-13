// 版本发布与更新检查：语义化版本比较、匿名更新查询（按 IP 令牌桶限流）、管理员发布管理。
const { randomUUID } = require('node:crypto')

const PLATFORMS = ['windows', 'windows-store', 'macos', 'linux', 'web', 'android', 'harmony']
const CHANNELS = ['stable', 'beta']
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }

/** 解析语义化版本（主.次.修订[-预发布]），不接受前缀 v、两段式或前导零；无效返回 null。 */
function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 64) return null
  const match = VERSION_PATTERN.exec(value)
  if (!match) return null
  const pre = match[4] ? match[4].split('.') : []
  if (pre.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return null
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre }
}

/** 比较两个语义化版本：a>b 返回 1，相等 0，小于 -1；预发布版本低于同号正式版。 */
function compareVersions(a, b) {
  const left = parseVersion(a), right = parseVersion(b)
  if (!left || !right) throw new Error('版本号格式无效')
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1
  if (!left.pre.length || !right.pre.length) return left.pre.length === right.pre.length ? 0 : left.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) return Number(x) > Number(y) ? 1 : -1
    if (xn !== yn) return xn ? -1 : 1
    return x > y ? 1 : -1
  }
  return 0
}

/** 内存令牌桶：每个键最多 capacity 个令牌，每分钟回补 refillPerMinute 个。 */
function createRateLimiter({ capacity = 30, refillPerMinute = 30, clock = Date.now, maxKeys = 50000 } = {}) {
  const buckets = new Map()
  return key => {
    const now = clock()
    let bucket = buckets.get(key)
    if (!bucket) {
      // 键过多时清掉已回满的桶，防止异常流量撑爆内存
      if (buckets.size >= maxKeys) for (const [name, item] of buckets) if (item.tokens + (now - item.time) * refillPerMinute / 60000 >= capacity) buckets.delete(name)
      if (buckets.size >= maxKeys) return false
      bucket = { tokens: capacity, time: now }
      buckets.set(key, bucket)
    }
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.time) * refillPerMinute / 60000)
    bucket.time = now
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }
}

const present = row => ({
  id: row.id, platform: row.platform, version: row.version, versionCode: row.version_code ?? null, channel: row.channel,
  mandatory: Boolean(row.mandatory), minVersion: row.min_version || null, notes: row.notes || '', url: row.url || null,
  sha256: row.sha256 || null, bytes: row.bytes ?? null, publishedAt: Number(row.published) || 0, withdrawn: Boolean(row.withdrawn), createdBy: row.created_by || null,
})

/** 校验并规范一条发布记录；windows（NSIS）必须给出 https 安装包、sha256 与字节数，供客户端下载后校验。 */
function normalizeRelease(input) {
  if (!input || typeof input !== 'object') fail(400, '发布内容无效')
  const platform = input.platform, version = input.version, channel = input.channel ?? 'stable'
  if (!PLATFORMS.includes(platform)) fail(400, '平台无效')
  if (!parseVersion(version)) fail(400, '版本号须为语义化版本，例如 2.7.1')
  if (!CHANNELS.includes(channel)) fail(400, '发布通道无效')
  if (typeof input.mandatory !== 'boolean' && input.mandatory !== undefined) fail(400, '强制更新标记无效')
  const minVersion = input.minVersion === undefined || input.minVersion === null || input.minVersion === '' ? null : input.minVersion
  if (minVersion !== null && (!parseVersion(minVersion) || compareVersions(minVersion, version) > 0)) fail(400, '最低版本须为有效版本号，且不能高于本次发布版本')
  const notes = input.notes === undefined || input.notes === null ? '' : input.notes
  if (typeof notes !== 'string' || notes.length > 4000) fail(400, '更新说明不能超过 4000 字')
  const url = input.url === undefined || input.url === null || input.url === '' ? null : input.url
  if (url !== null) {
    let parsed
    try { parsed = new URL(url) } catch { fail(400, '安装包地址格式无效') }
    const allowed = platform === 'windows-store' ? ['https:', 'ms-windows-store:'] : ['https:']
    if (typeof url !== 'string' || url.length > 2048 || !allowed.includes(parsed.protocol) || parsed.username || parsed.password) fail(400, platform === 'windows-store' ? '商店地址须为 https 或 ms-windows-store 链接' : '安装包地址须为 https 链接')
  }
  if (url === null && platform !== 'web') fail(400, platform === 'windows-store' ? '请填写微软商店链接' : platform === 'harmony' ? '请填写 AppGallery 链接' : '请填写安装包地址')
  const sha256 = input.sha256 === undefined || input.sha256 === null || input.sha256 === '' ? null : String(input.sha256).toLowerCase()
  if (sha256 !== null && !/^[a-f0-9]{64}$/.test(sha256)) fail(400, 'sha256 须为 64 位十六进制')
  const bytes = input.bytes === undefined || input.bytes === null || input.bytes === '' ? null : input.bytes
  if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes <= 0)) fail(400, '安装包字节数须为正整数')
  if (platform === 'windows' && (sha256 === null || bytes === null)) fail(400, 'Windows 安装包必须填写 sha256 与字节数，客户端下载后据此校验')
  const versionCode = input.versionCode === undefined || input.versionCode === null || input.versionCode === '' ? null : input.versionCode
  if (versionCode !== null && (!Number.isSafeInteger(versionCode) || versionCode <= 0)) fail(400, '构建号须为正整数')
  return { platform, version, channel, mandatory: input.mandatory === true, minVersion, notes, url, sha256, bytes, versionCode }
}

function createReleases({ db, clock = Date.now, audit, rateLimit = {}, assets }) {
  const allow = createRateLimiter({ capacity: 30, refillPerMinute: 30, ...rateLimit, clock })
  const find = id => db.one('SELECT * FROM releases WHERE id=?', [id])
  const presentRelease = row => ({ ...present(row), assetId: row.asset_id || null, asset: row.asset_id ? assets.get(row.asset_id) : null })
  function prepareRelease(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, '发布内容无效')
    if (!input.assetId) return { ...normalizeRelease(input), assetId: null }
    const asset = assets.get(input.assetId)
    if (asset.platform !== input.platform || asset.version !== input.version) fail(400, '安装包所属平台或版本与发布内容不一致')
    return { ...normalizeRelease({ ...input, url: input.platform === 'windows-store' ? input.url : asset.url, bytes: asset.bytes, sha256: asset.sha256 }), assetId: asset.id }
  }
  function assertNew(release) {
    // 仅约束新建，历史无附件记录的备注和上下架管理仍沿用原流程。
    if (release.platform === 'macos' && !release.assetId) fail(400, 'macOS 新版本必须先上传并绑定已校验的 DMG 安装包')
    if (db.one('SELECT id FROM releases WHERE platform=? AND version=? AND channel=?', [release.platform, release.version, release.channel])) fail(409, '该平台与通道已登记此版本，请修改原记录')
  }
  function insertRelease(release) {
    const id = randomUUID()
    db.run('INSERT INTO releases(id,platform,version,version_code,channel,mandatory,min_version,notes,url,sha256,bytes,published,created_by,withdrawn,asset_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)',
      [id, release.platform, release.version, release.versionCode, release.channel, release.mandatory ? 1 : 0, release.minVersion, release.notes, release.url, release.sha256, release.bytes, clock(), 'admin', release.assetId])
    audit('admin', 'release-create', JSON.stringify({ platform: release.platform, version: release.version, channel: release.channel, mandatory: release.mandatory }))
    return id
  }

  /** 当前版本可升级到的最新发布；跨越的任一版本被标为强制，或当前低于其最低版本，则本次更新为强制。 */
  function latest(platform, version, channel) {
    const channels = channel === 'beta' ? ['stable', 'beta'] : ['stable']
    const rows = db.query(`SELECT * FROM releases WHERE platform=? AND withdrawn=0 AND channel IN (${channels.map(() => '?').join(',')})`, [platform, ...channels])
      .filter(row => parseVersion(row.version) && compareVersions(row.version, version) > 0)
    if (!rows.length) return { hasUpdate: false }
    rows.sort((a, b) => compareVersions(b.version, a.version))
    const top = rows[0]
    const mandatory = rows.some(row => row.mandatory || (row.min_version && parseVersion(row.min_version) && compareVersions(version, row.min_version) < 0))
    return { hasUpdate: true, version: top.version, mandatory, notes: top.notes || '', url: top.url || null, sha256: top.sha256 || null, bytes: top.bytes ?? null, publishedAt: Number(top.published) || 0 }
  }

  async function handlePublic({ route, method, url, reply, ip }) {
    if (route !== '/v1/updates/latest' || method !== 'GET') return false
    if (!allow(String(ip || 'unknown'))) fail(429, '更新检查过于频繁，请稍后再试')
    const platform = url.searchParams.get('platform'), version = url.searchParams.get('version'), channel = url.searchParams.get('channel') || 'stable'
    if (!PLATFORMS.includes(platform)) fail(400, '平台无效')
    if (!parseVersion(version)) fail(400, '版本号无效')
    if (!CHANNELS.includes(channel)) fail(400, '发布通道无效')
    reply(latest(platform, version, channel))
    return true
  }

  async function handleAdmin({ route, method, url, json, reply }) {
    if (route === '/v1/admin/releases' && method === 'GET') {
      const platform = url.searchParams.get('platform')
      if (platform && !PLATFORMS.includes(platform)) fail(400, '平台无效')
      const rows = (platform ? db.query('SELECT * FROM releases WHERE platform=?', [platform]) : db.query('SELECT * FROM releases')).map(presentRelease)
      rows.sort((a, b) => a.platform.localeCompare(b.platform) || compareVersions(b.version, a.version) || b.publishedAt - a.publishedAt)
      const versions = new Map()
      for (const row of rows) { const key = row.version + '/' + row.channel; versions.set(key, Boolean(versions.get(key)) || !row.withdrawn) }
      reply({ items: rows, statistics: { all: versions.size, published: [...versions.values()].filter(Boolean).length, withdrawn: [...versions.values()].filter(value => !value).length } })
      return true
    }
    if (route === '/v1/admin/releases/batch' && method === 'POST') {
      const input = await json()
      if (!input || !Array.isArray(input.platforms) || !input.platforms.length || input.platforms.length > PLATFORMS.length) fail(400, '请至少选择一个需要发布的平台')
      const selected = new Set()
      const prepared = input.platforms.map(item => {
        if (!item || typeof item !== 'object' || selected.has(item.platform)) fail(400, '发布平台不能重复')
        selected.add(item.platform)
        const release = prepareRelease({ ...item, version: input.version, channel: input.channel, notes: input.notes, mandatory: input.mandatory, minVersion: input.minVersion })
        assertNew(release)
        return release
      })
      let ids
      db.transaction(() => { ids = prepared.map(insertRelease) })
      reply({ items: ids.map(id => presentRelease(find(id))) })
      return true
    }
    if (route === '/v1/admin/releases' && method === 'POST') {
      const release = prepareRelease(await json())
      assertNew(release)
      let id
      db.transaction(() => { id = insertRelease(release) })
      reply({ item: presentRelease(find(id)) })
      return true
    }
    const match = /^\/v1\/admin\/releases\/([0-9a-f-]{36})$/.exec(route)
    if (!match) return false
    const existing = find(match[1])
    if (method === 'PATCH') {
      const input = await json()
      if (!existing) fail(404, '发布记录不存在')
      if (!input || typeof input !== 'object') fail(400, '修改内容无效')
      if (input.withdrawn !== undefined && typeof input.withdrawn !== 'boolean') fail(400, '下架标记无效')
      const current = presentRelease(existing)
      const merged = prepareRelease({ ...current, ...Object.fromEntries(['mandatory', 'minVersion', 'notes', 'url', 'sha256', 'bytes', 'versionCode'].filter(key => key in input).map(key => [key, input[key]])) })
      const withdrawn = input.withdrawn === undefined ? current.withdrawn : input.withdrawn
      db.transaction(() => {
        db.run('UPDATE releases SET mandatory=?,min_version=?,notes=?,url=?,sha256=?,bytes=?,version_code=?,withdrawn=? WHERE id=?',
          [merged.mandatory ? 1 : 0, merged.minVersion, merged.notes, merged.url, merged.sha256, merged.bytes, merged.versionCode, withdrawn ? 1 : 0, existing.id])
        audit('admin', 'release-update', JSON.stringify({ platform: current.platform, version: current.version, channel: current.channel, mandatory: merged.mandatory, withdrawn }))
      })
      reply({ item: presentRelease(find(existing.id)) })
      return true
    }
    if (method === 'DELETE') {
      if (!existing) fail(404, '发布记录不存在')
      db.transaction(() => {
        db.run('DELETE FROM releases WHERE id=?', [existing.id])
        audit('admin', 'release-delete', JSON.stringify({ platform: existing.platform, version: existing.version, channel: existing.channel }))
      })
      reply({ deleted: true })
      return true
    }
    return false
  }

  return { latest, handlePublic, handleAdmin }
}

module.exports = { PLATFORMS, CHANNELS, parseVersion, compareVersions, createRateLimiter, normalizeRelease, createReleases }
