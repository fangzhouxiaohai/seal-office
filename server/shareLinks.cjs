// 分享链接：与「文档共享」完全独立的另一条通道。
// 文档共享要求接收人注册并开通云空间；分享链接则面向任何拿到链接的人，
// 浏览器打开即可看到落地页并直接下载，无需登录。
//
// 零知识约束：私有文件的内容密钥始终由客户端保管。链接把文件密钥放在 URL 的
// # 片段里，浏览器不会把片段发给服务器，因此服务器即使持有全部数据库也无法
// 解密文件。设置了访问码时，片段里只放「用访问码派生的密钥包裹后的文件密钥」，
// 访问码本身不落库，只保存 scrypt 摘要用于拦截暴力枚举。
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID, scryptSync, timingSafeEqual } = require('node:crypto')

const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
const digest = value => createHash('sha256').update(value).digest('hex')
const ACCESS = /^[A-Za-z0-9_-]{43}$/
const BASE64 = /^[A-Za-z0-9+/=]+$/
const ATTEMPT_WINDOW = 15 * 60 * 1000
const ATTEMPT_LIMIT = 8

/** 有效期只接受 1、3、7、30 天或永久（null）。 */
const EXPIRY_DAYS = [1, 3, 7, 30]

function createShareLinks({ db, clock, objects, nodeFor, streamObject, audit, usage, quota }) {
  const attempts = new Map()

  const linkView = row => ({
    id: row.id,
    nodeId: row.node_id,
    expiresAt: row.expires ?? null,
    expired: row.expires != null && row.expires <= clock(),
    requiresCode: Boolean(row.code_digest),
    downloads: Number(row.downloads) || 0,
    created: row.created,
  })

  const liveLink = id => {
    if (!uuid(id)) fail(404, '分享链接不存在或已失效')
    const row = db.one('SELECT * FROM share_links WHERE id=?', [id])
    if (!row || row.revoked) fail(404, '分享链接不存在或已被取消')
    if (row.expires != null && row.expires <= clock()) fail(410, '分享链接已过期')
    // 文件被移入回收站或彻底删除后，链接不能继续充当绕过回收站的后门。
    const node = db.one('SELECT deleted,kind FROM nodes WHERE id=? AND user_id=?', [row.node_id, row.user_id])
    if (!node || node.deleted) fail(404, '分享的文件已被删除')
    return row
  }

  // 访问码是短数字口令，必须限次，否则几秒就能枚举完。
  const throttle = (id, ip) => {
    const key = id + '|' + ip
    const now = clock()
    const record = attempts.get(key)
    if (!record || now - record.first > ATTEMPT_WINDOW) return key
    if (record.count >= ATTEMPT_LIMIT) fail(429, '访问码错误次数过多，请稍后再试')
    return key
  }
  const recordFailure = (id, ip) => {
    const key = id + '|' + ip
    const now = clock()
    const record = attempts.get(key)
    if (!record || now - record.first > ATTEMPT_WINDOW) attempts.set(key, { first: now, count: 1 })
    else record.count++
  }

  const verifyCode = (row, code) => {
    if (!row.code_digest) return
    // 没带访问码不是参数错误，而是未通过访问控制；只有格式不对才算参数错误。
    if (code == null || code === '') fail(403, '请输入访问码')
    if (typeof code !== 'string' || !/^\d{4,8}$/.test(code)) fail(400, '请输入 4–8 位数字访问码')
    const digestValue = scryptSync(code, row.code_salt, 32).toString('hex')
    const expected = Buffer.from(row.code_digest, 'hex')
    const actual = Buffer.from(digestValue, 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) fail(403, '访问码不正确')
  }

  async function handle({ route, method, req, res, user, json, reply, body }) {
    if (!/^\/v1\/share-links(?:\/|$)/.test(route)) return false
    const match = /^\/v1\/share-links\/([0-9a-f-]{36})(?:\/(verify|content))?$/.exec(route)

    // 匿名访问的三条只读接口：信息、校验访问码、下载。
    if (match && !match[2] && method === 'GET') {
      const row = liveLink(match[1])
      reply({ id: row.id, requiresCode: Boolean(row.code_digest), expiresAt: row.expires ?? null, downloads: Number(row.downloads) || 0 })
      return true
    }
    if (match?.[2] === 'verify' && method === 'POST') {
      const row = liveLink(match[1]), input = await json()
      const key = throttle(row.id, req.socket.remoteAddress || '')
      try { verifyCode(row, input.code) } catch (error) { recordFailure(row.id, req.socket.remoteAddress || ''); throw error }
      attempts.delete(key)
      reply({ ok: true })
      return true
    }
    if (match?.[2] === 'content' && method === 'GET') {
      const row = liveLink(match[1])
      const access = req.headers['x-seal-access']
      if (typeof access !== 'string' || !ACCESS.test(access) || digest(access) !== row.access_hash) fail(403, '链接凭证不正确')
      if (row.code_digest) {
        const key = throttle(row.id, req.socket.remoteAddress || '')
        const code = req.headers['x-seal-code']
        try { verifyCode(row, typeof code === 'string' ? code : null) } catch (error) { recordFailure(row.id, req.socket.remoteAddress || ''); throw error }
        attempts.delete(key)
      }
      const version = db.one('SELECT blob FROM versions WHERE node_id=? ORDER BY version DESC LIMIT 1', [row.node_id])
      if (!version) fail(404, '分享的文件还没有已保存的版本')
      db.transaction(() => { db.run('UPDATE share_links SET downloads=downloads+1 WHERE id=?', [row.id]); audit(row.user_id, 'share-link-download', row.id) })
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', 'attachment')
      res.setHeader('Cache-Control', 'no-store')
      streamObject(version.blob, res)
      return true
    }

    // 以下需要登录。
    if (route === '/v1/share-links' && method === 'GET') {
      reply({ items: db.query('SELECT * FROM share_links WHERE user_id=? ORDER BY created DESC LIMIT 500', [user.id]).map(linkView) })
      return true
    }
    if (route === '/v1/share-links' && method === 'POST') {
      const input = await json()
      if (!uuid(input.id)) fail(400, '分享链接标识无效')
      if (typeof input.accessHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.accessHash)) fail(400, '链接凭证无效')
      const node = nodeFor(input.nodeId, user.id)
      if (!['file', 'knowledge'].includes(node.kind) || !node.version) fail(400, '请选择已有保存版本的云文件')
      let expires = null
      if (input.expiryDays != null) {
        if (!EXPIRY_DAYS.includes(input.expiryDays)) fail(400, '有效期只能选择 1、3、7、30 天或永久')
        expires = clock() + input.expiryDays * 86400000
      }
      let codeSalt = null, codeDigest = null
      if (input.code != null) {
        if (typeof input.code !== 'string' || !/^\d{4,8}$/.test(input.code)) fail(400, '访问码须为 4–8 位数字')
        codeSalt = createHash('sha256').update(randomUUID()).digest('hex').slice(0, 32)
        codeDigest = scryptSync(input.code, codeSalt, 32).toString('hex')
      }
      if (db.one('SELECT COUNT(*) n FROM share_links WHERE user_id=? AND revoked=0', [user.id]).n >= 200) fail(413, '未取消的分享链接已达上限')
      if (db.one('SELECT id FROM share_links WHERE id=?', [input.id])) fail(409, '分享链接标识已存在')
      if (usage(user.id) + 1024 > quota) fail(413, '云空间不足')
      db.transaction(() => {
        db.run('INSERT INTO share_links(id,user_id,node_id,access_hash,code_salt,code_digest,expires,created) VALUES(?,?,?,?,?,?,?,?)', [input.id, user.id, node.id, input.accessHash, codeSalt, codeDigest, expires, clock()])
        audit(user.id, 'share-link-create', input.id)
      })
      reply(linkView(db.one('SELECT * FROM share_links WHERE id=?', [input.id])))
      return true
    }
    if (match && !match[2] && method === 'DELETE') {
      const row = db.one('SELECT * FROM share_links WHERE id=?', [match[1]])
      if (!row || row.user_id !== user.id) fail(404, '分享链接不存在')
      db.transaction(() => { db.run('UPDATE share_links SET revoked=1 WHERE id=?', [row.id]); audit(user.id, 'share-link-revoke', row.id) })
      reply({ revoked: true })
      return true
    }
    fail(404, '分享链接接口不存在')
  }

  /** 账号注销或清空云空间时，相关链接必须一起失效。 */
  function purgeUser(userId) {
    const rows = db.query('SELECT id FROM share_links WHERE user_id=?', [userId])
    db.run('DELETE FROM share_links WHERE user_id=?', [userId])
    return rows.length
  }
  /** 文件被彻底删除时，指向它的链接不能继续暴露内容。 */
  function purgeNode(nodeId) {
    db.run('UPDATE share_links SET revoked=1 WHERE node_id=?', [nodeId])
  }

  return { handle, purgeUser, purgeNode }
}

module.exports = { createShareLinks, EXPIRY_DAYS }
