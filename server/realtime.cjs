// The service never receives a document key or a plaintext CRDT update.
// Sequence numbers provide durable delivery, not conflict resolution: clients merge Yjs updates.
const { createHash } = require('node:crypto')
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
const digest = value => createHash('sha256').update(value).digest('hex')
const MAX_UPDATE = 8 * 1024 * 1024, MAX_STATE = 24 * 1024 * 1024, MAX_LOG = 48 * 1024 * 1024
function cipher(value, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail(400, '实时协作加密数据无效')
  const raw = Buffer.from(value, 'base64')
  if (raw.length < 28 || raw.length > max || raw.toString('base64') !== value) fail(413, '实时协作数据超出限制')
  return raw.length
}
function createRealtime({ db, clock, authorize, usage, reservation, quota, ensureDisk }) {
  const waiting = new Map(); let waitCount = 0
  const currentSession = session => { if (!db.one('SELECT hash FROM sessions WHERE hash=? AND expires>?', [session.hash, clock()])) fail(401, '设备会话已撤销或过期') }
  const cleanup = () => {
    db.run('DELETE FROM realtime_presence WHERE updated<? OR session_hash NOT IN (SELECT hash FROM sessions WHERE expires>?)', [clock() - 45000, clock()])
    const dead = db.query("SELECT r.id FROM realtime_rooms r WHERE (r.kind='share' AND NOT EXISTS(SELECT 1 FROM nodes n WHERE n.id=r.node_id)) OR (r.kind='team' AND NOT EXISTS(SELECT 1 FROM team_nodes n WHERE n.id=r.node_id AND n.team_id=r.scope_id))")
    for (const room of dead) removeRoom(room.id)
  }
  function removeRoom(id) { for (const table of ['realtime_updates', 'realtime_receipts', 'realtime_presence']) db.run(`DELETE FROM ${table} WHERE room_id=?`, [id]); db.run('DELETE FROM realtime_rooms WHERE id=?', [id]) }
  const purgeUser = userId => { for (const room of db.query('SELECT id FROM realtime_rooms WHERE owner_id=?', [userId])) removeRoom(room.id); db.run('DELETE FROM realtime_presence WHERE session_hash IN (SELECT hash FROM sessions WHERE user_id=?)', [userId]) }
  const budget = (owner, added) => { ensureDisk(Math.max(0, added)); if (usage(owner) + reservation(owner) + added > quota) fail(413, '实时协作云空间不足；本机修改已保留') }
  async function handle({ route, method, req, res, user, session, json, reply }) {
    if (!route.startsWith('/v1/realtime/')) return false
    const match = /^\/v1\/realtime\/(share|team|node)\/([0-9a-f-]{36})(?:\/([0-9a-f-]{36}))?(?:\/(open|updates|checkpoint|presence))$/.exec(route)
    if (!match || match[1] === 'team' && !match[3] || match[1] !== 'team' && match[3]) fail(404, '实时协作接口不存在')
    const [, kind, id, nodeId, action] = match, reference = JSON.stringify({ kind, id, nodeId })
    const permit = write => { currentSession(session); return authorize({ kind, id, nodeId, userId: user.id, access: req.headers['x-seal-access'], write }) }
    let allowed = permit(false), room = () => db.one('SELECT * FROM realtime_rooms WHERE id=?', [allowed.roomId])
    const snapshot = (after = 0, includeSeed = false) => {
      allowed = permit(false)
      const item = room()
      if (!item) return { initialized: false, editable: allowed.editable, head: 0, updates: [], peers: [] }
      if (!Number.isSafeInteger(after) || after < 0 || after > item.head) fail(400, '协作序列位置无效')
      const peers = db.query('SELECT client_id clientId,cipher,updated,reference,session_hash FROM realtime_presence WHERE room_id=? AND updated>?', [item.id, clock() - 45000]).filter(peer => {
        const valid = db.one('SELECT user_id FROM sessions WHERE hash=? AND expires>?', [peer.session_hash, clock()])
        if (!valid) return false
        try { authorize({ ...JSON.parse(peer.reference), userId: valid.user_id, trustedPresence: true }); return true } catch { return false }
      }).map(({ clientId, cipher, updated }) => ({ clientId, cipher, updated }))
      return { initialized: true, type: item.type, ...(includeSeed ? { seed: item.seed } : {}), checkpoint: after < item.checkpoint_seq ? item.checkpoint : null, checkpointSeq: item.checkpoint_seq, head: item.head, editable: allowed.editable, updates: db.query('SELECT seq,operation_id operationId,cipher FROM realtime_updates WHERE room_id=? AND seq>? ORDER BY seq LIMIT 256', [item.id, Math.max(after, item.checkpoint_seq)]), peers }
    }
    if (action === 'open' && method === 'POST') {
      const input = await json(34 * 1024 * 1024); allowed = permit(false)
      if (!room() && allowed.editable) {
        if (!['word', 'table', 'ppt', 'mindmap', 'flowchart'].includes(input.type)) fail(400, '实时协作文档类型不受支持')
        const length = cipher(input.seed, MAX_STATE); allowed = permit(true); budget(allowed.ownerId, Buffer.byteLength(input.seed))
        db.transaction(() => { if (!room()) db.run('INSERT INTO realtime_rooms(id,owner_id,kind,scope_id,node_id,type,seed,version,created) VALUES(?,?,?,?,?,?,?,?,?)', [allowed.roomId, allowed.ownerId, kind === 'node' ? 'share' : kind, allowed.scopeId, allowed.nodeId, input.type, input.seed, allowed.version, clock()]) })
        void length
      }
      if (room() && room().type !== input.type) fail(409, '实时协作文档类型不匹配')
      reply(snapshot(input.after ?? 0, true)); return true
    }
    if (action === 'updates' && method === 'GET') {
      const url = new URL(req.url, 'http://localhost'), after = Number(url.searchParams.get('after') || 0), wait = Math.min(10000, Math.max(0, Number(url.searchParams.get('wait') || 0)))
      if (!Number.isFinite(wait)) fail(400, '协作等待时间无效')
      const includeSeed = url.searchParams.get('initial') === '1'
      let result = snapshot(after, includeSeed)
      const deadline = Date.now() + wait
      if (wait && result.head <= after) {
        if (waitCount >= 256 || (waiting.get(user.id) || 0) >= 4) fail(429, '实时等待连接已达上限，请稍后重试')
        waiting.set(user.id, (waiting.get(user.id) || 0) + 1); waitCount++
        try {
          while (!res.destroyed && !req.aborted && result.head <= after && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())))
            result = snapshot(after, includeSeed)
          }
        } finally { waitCount--; const remaining = (waiting.get(user.id) || 1) - 1; if (remaining) waiting.set(user.id, remaining); else waiting.delete(user.id) }
      }
      if (!res.destroyed) reply(result); return true
    }
    if (action === 'updates' && method === 'POST') {
      const input = await json(12 * 1024 * 1024); allowed = permit(true)
      const item = room(); if (!item) fail(409, '请先初始化实时协作')
      if (!uuid(input.operationId)) fail(400, '协作操作标识无效')
      const length = cipher(input.cipher, MAX_UPDATE), hash = digest(input.cipher), old = db.one('SELECT * FROM realtime_receipts WHERE room_id=? AND operation_id=?', [item.id, input.operationId])
      if (old) { if (old.digest !== hash) fail(409, '协作操作标识已被其他内容使用'); reply({ seq: old.seq, duplicate: true }); return true }
      const log = db.one('SELECT COUNT(*) count,COALESCE(SUM(bytes),0) bytes FROM realtime_updates WHERE room_id=?', [item.id])
      if (log.count >= 4096 || log.bytes + length > MAX_LOG) fail(409, '实时日志需要压缩后重试；本机修改已保留')
      budget(allowed.ownerId, Buffer.byteLength(input.cipher) + 160); const seq = item.head + 1
      db.transaction(() => {
        db.run('INSERT INTO realtime_updates VALUES(?,?,?,?,?,?,?)', [item.id, seq, input.operationId, input.cipher, length, user.id, clock()])
        db.run('INSERT INTO realtime_receipts VALUES(?,?,?,?,?)', [item.id, input.operationId, seq, hash, clock()])
        db.run('UPDATE realtime_rooms SET head=? WHERE id=?', [seq, item.id])
        if (kind === 'team') db.run('UPDATE team_nodes SET updated=? WHERE team_id=? AND id=?', [clock(), id, nodeId])
        else db.run('UPDATE nodes SET updated=? WHERE id=?', [clock(), item.node_id])
        db.run('DELETE FROM realtime_receipts WHERE room_id=? AND seq<?', [item.id, Math.max(0, seq - 8192)])
      })
      reply({ seq }); return true
    }
    if (action === 'checkpoint' && method === 'PUT') {
      const input = await json(34 * 1024 * 1024); allowed = permit(true); const item = room()
      if (!item || !Number.isSafeInteger(input.after) || input.after !== item.head) fail(409, '协作日志已更新，请先合并再压缩')
      cipher(input.cipher, MAX_STATE)
      const reclaimed = Buffer.byteLength(item.checkpoint || '') + Number(db.one('SELECT COALESCE(SUM(LENGTH(cipher)),0) n FROM realtime_updates WHERE room_id=? AND seq<=?', [item.id, input.after]).n)
      budget(allowed.ownerId, Buffer.byteLength(input.cipher) - reclaimed)
      db.transaction(() => { db.run('UPDATE realtime_rooms SET checkpoint=?,checkpoint_seq=? WHERE id=?', [input.cipher, input.after, item.id]); db.run('DELETE FROM realtime_updates WHERE room_id=? AND seq<=?', [item.id, input.after]) })
      reply({ checkpointSeq: input.after }); return true
    }
    if (action === 'presence' && ['PUT', 'DELETE'].includes(method)) {
      const input = await json(12000); allowed = permit(false)
      if (!uuid(input.clientId)) fail(400, '协作客户端标识无效')
      const item = room(); if (!item) { reply({ waiting: true }); return true }
      const existing = db.one('SELECT session_hash FROM realtime_presence WHERE room_id=? AND client_id=?', [item.id, input.clientId])
      if (existing && existing.session_hash !== session.hash) fail(403, '在线客户端属于其他设备会话')
      if (method === 'DELETE') db.transaction(() => db.run('DELETE FROM realtime_presence WHERE room_id=? AND client_id=? AND session_hash=?', [item.id, input.clientId, session.hash]))
      else {
        cipher(input.cipher, 4096)
        if (!existing && db.one('SELECT COUNT(*) n FROM realtime_presence WHERE room_id=? AND updated>?', [item.id, clock() - 45000]).n >= 100) fail(429, '同一文档在线设备已达上限')
        db.transaction(() => db.run('INSERT OR REPLACE INTO realtime_presence VALUES(?,?,?,?,?,?)', [item.id, input.clientId, session.hash, reference, input.cipher, clock()]))
      }
      reply({ ok: true }); return true
    }
    fail(405, '实时协作请求方式不受支持')
  }
  return { handle, cleanup, purgeUser }
}
module.exports = { createRealtime, MAX_UPDATE, MAX_STATE, MAX_LOG }
