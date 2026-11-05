const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const kinds = { link: { table: 'share_links', owner: 'user_id' }, account: { table: 'shares', owner: 'owner_id' } }

function createMyShares({ db, clock, audit }) {
  const statusOf = row => {
    const node = db.one('SELECT deleted FROM nodes WHERE id=? AND user_id=?', [row.node_id, row.owner_id])
    if (!node || node.deleted) return 'sourceRemoved'
    if (row.revoked) return 'revoked'
    if (row.expires != null && row.expires <= clock()) return 'expired'
    return 'active'
  }
  const recordsSql = `WITH records AS (
    SELECT l.id,'link' kind,l.node_id,l.user_id owner_id,NULL recipient_phone,NULL permission,l.expires,l.revoked,l.created,l.downloads,
      CASE WHEN n.id IS NULL OR n.deleted!=0 THEN 'sourceRemoved' WHEN l.revoked!=0 THEN 'revoked' WHEN l.expires IS NOT NULL AND l.expires<=? THEN 'expired' ELSE 'active' END status
    FROM share_links l LEFT JOIN nodes n ON n.id=l.node_id AND n.user_id=l.user_id WHERE l.user_id=?
    UNION ALL
    SELECT s.id,'account' kind,s.node_id,s.owner_id,u.phone recipient_phone,s.permission,s.expires,s.revoked,s.created,NULL downloads,
      CASE WHEN n.id IS NULL OR n.deleted!=0 THEN 'sourceRemoved' WHEN s.revoked!=0 THEN 'revoked' WHEN s.expires<=? THEN 'expired' ELSE 'active' END status
    FROM shares s LEFT JOIN nodes n ON n.id=s.node_id AND n.user_id=s.owner_id LEFT JOIN users u ON u.id=s.recipient_id WHERE s.owner_id=?
  )`
  const params = userId => [clock(), userId, clock(), userId]
  const view = row => ({ id: row.id, kind: row.kind, nodeId: row.node_id, recipientPhone: row.recipient_phone?.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') || null, permission: row.permission, expiresAt: row.expires, downloads: row.kind === 'link' ? Number(row.downloads) || 0 : null, revoked: Boolean(row.revoked), status: row.status, created: row.created })
  const entry = value => {
    if (!value || !kinds[value.kind] || !uuid(value.id)) fail(400, '分享记录标识无效')
    return { kind: value.kind, id: value.id }
  }
  const decodeCursor = value => {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) fail(400, '清理游标无效')
    let decoded
    try { decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) } catch { fail(400, '清理游标无效') }
    if (!Array.isArray(decoded) || decoded.length !== 3 || !Number.isSafeInteger(decoded[0]) || decoded[0] < 0 || !uuid(decoded[1]) || !kinds[decoded[2]]) fail(400, '清理游标无效')
    return decoded
  }
  const encodeCursor = row => Buffer.from(JSON.stringify([row.created, row.id, row.kind])).toString('base64url')
  const operate = (userId, item, action) => {
    const { table, owner } = kinds[item.kind]
    return db.transaction(() => {
      const row = db.one(`SELECT *,${owner} owner_id FROM ${table} WHERE id=? AND ${owner}=?`, [item.id, userId])
      if (!row) return { ...item, ok: false, error: '分享记录不存在或无权操作' }
      const status = statusOf(row)
      if (action === 'cleanInvalid' && status === 'active') return { ...item, ok: false, error: '分享仍然有效，未清理' }
      if (action === 'revoke') {
        if (!row.revoked) { db.run(`UPDATE ${table} SET revoked=1 WHERE id=? AND ${owner}=?`, [item.id, userId]); audit(userId, 'my-share-revoke', `${item.kind}:${item.id}`) }
        return { ...item, ok: true }
      }
      if (!row.revoked) db.run(`UPDATE ${table} SET revoked=1 WHERE id=? AND ${owner}=?`, [item.id, userId])
      db.run(`DELETE FROM ${table} WHERE id=? AND ${owner}=?`, [item.id, userId])
      audit(userId, 'my-share-delete', `${item.kind}:${item.id}`)
      return { ...item, ok: true }
    })
  }
  const readList = (userId, input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, '分享筛选参数无效')
    const pageText = String(input.page ?? '1'), limitText = String(input.limit ?? '50')
    if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) fail(400, '分页参数无效')
    const page = Number(pageText), limit = Number(limitText)
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, '分页参数无效')
    const status = input.status || 'all', kind = input.kind || 'all'
    if (!['all', 'active', 'expired', 'revoked', 'sourceRemoved'].includes(status)) fail(400, '分享状态无效')
    if (!['all', 'link', 'account'].includes(kind)) fail(400, '分享类型无效')
    if (input.nodeIds !== undefined && (!Array.isArray(input.nodeIds) || input.nodeIds.length > 20000 || input.nodeIds.some(id => !uuid(id)))) fail(400, '来源文件筛选无效')
    const filters = [], values = params(userId)
    if (status !== 'all') { filters.push('status=?'); values.push(status) }
    if (kind !== 'all') { filters.push('kind=?'); values.push(kind) }
    if (input.nodeIds !== undefined) { filters.push('node_id IN (SELECT value FROM json_each(?))'); values.push(JSON.stringify(input.nodeIds)) }
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : ''
    const total = db.one(`${recordsSql} SELECT COUNT(*) n FROM records${where}`, values).n
    const rows = db.query(`${recordsSql} SELECT * FROM records${where} ORDER BY created DESC,id DESC LIMIT ? OFFSET ?`, [...values, limit, (page - 1) * limit])
    return { items: rows.map(view), page, limit, total }
  }
  async function handle({ route, method, url, user, json, reply }) {
    if (!['/v1/my-shares', '/v1/my-shares/query', '/v1/my-shares/cleanup-preview', '/v1/my-shares/batch'].includes(route)) return false
    if (route === '/v1/my-shares' && method === 'GET') {
      reply(readList(user.id, { page: url.searchParams.get('page'), limit: url.searchParams.get('limit'), status: url.searchParams.get('status'), kind: url.searchParams.get('kind') }))
      return true
    }
    if (route === '/v1/my-shares/query' && method === 'POST') {
      reply(readList(user.id, await json()))
      return true
    }
    if (route === '/v1/my-shares/cleanup-preview' && method === 'GET') {
      const count = db.one(`${recordsSql} SELECT COUNT(*) n FROM records WHERE status!='active'`, params(user.id)).n
      reply({ count })
      return true
    }
    if (route === '/v1/my-shares/batch' && method === 'POST') {
      const input = await json()
      if (!['revoke', 'delete', 'cleanInvalid'].includes(input?.action)) fail(400, '分享操作无效')
      let entries, hasMore = false, nextCursor = null
      if (input.action === 'cleanInvalid') {
        const limit = input.limit === undefined ? 100 : input.limit
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, '批量数量无效')
        const cursor = decodeCursor(input.cursor)
        const after = cursor ? ' AND (created<? OR (created=? AND id<?) OR (created=? AND id=? AND kind<?))' : ''
        const values = cursor ? [cursor[0], cursor[0], cursor[1], cursor[0], cursor[1], cursor[2]] : []
        const rows = db.query(`${recordsSql} SELECT kind,id,created FROM records WHERE status!='active'${after} ORDER BY created DESC,id DESC,kind DESC LIMIT ?`, [...params(user.id), ...values, limit + 1])
        hasMore = rows.length > limit
        const batch = rows.slice(0, limit)
        nextCursor = hasMore ? encodeCursor(batch[batch.length - 1]) : null
        entries = batch.map(entry)
      } else {
        if (!Array.isArray(input.entries) || input.entries.length < 1 || input.entries.length > 100) fail(400, '请选择 1 至 100 条分享记录')
        entries = input.entries.map(entry)
      }
      const results = entries.map(item => {
        try { return operate(user.id, item, input.action) }
        catch (error) {
          console.error('分享记录逐项处理失败', item.kind, item.id, error instanceof Error ? error.message : String(error))
          return { ...item, ok: false, error: error.status ? error.message : '分享记录处理失败，请稍后重试' }
        }
      })
      reply({ results, hasMore, nextCursor })
      return true
    }
    fail(404, '分享记录接口不存在')
  }
  return { handle }
}

module.exports = { createMyShares }
