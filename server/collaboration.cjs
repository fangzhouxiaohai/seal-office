const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, createHash } = require('node:crypto')
const digest = value => createHash('sha256').update(value).digest('hex')
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
const opaque = value => typeof value === 'string' && value.length >= 40 && value.length <= 65536 && /^[A-Za-z0-9+/=]+$/.test(value)
const mask = phone => phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')

function createCollaboration({ db, clock, objects, teamObjects, usage, reservation, quota, ensureDisk, nodeFor, streamObject, audit }) {
  const freshUser = id => { const user = db.one('SELECT * FROM users WHERE id=?', [id]); if (!user?.enabled) fail(403, '云空间已停用'); return user }
  const recipient = phone => { if (!/^1[3-9]\d{9}$/.test(phone || '')) fail(400, '请输入接收人的完整手机号'); const user = db.one('SELECT id,enabled FROM users WHERE phone=?', [phone]); if (!user?.enabled) fail(404, '接收人须先注册并开通云空间'); return user.id }
  const expiry = value => { const expires = value ?? clock() + 7 * 86400000; if (!Number.isSafeInteger(expires) || expires <= clock() || expires > clock() + 30 * 86400000) fail(400, '有效期须在未来 30 天内'); return expires }
  const budget=(owner,added)=>{if(usage(owner)+reservation(owner)+added>quota)fail(413,'云空间不足')}
  const envelope = input => { if (!opaque(input.envelope) || !uuid(input.id) || !/^[a-f0-9]{64}$/.test(input.accessHash || '')) fail(400, '加密邀请信息无效') }
  const teamFor = (id, userId, level = 'read') => {
    const team = db.one('SELECT t.*,m.role,m.envelope FROM teams t JOIN team_members m ON m.team_id=t.id WHERE t.id=? AND m.user_id=?', [id, userId])
    if (!team) fail(404, '团队不存在或成员权限已撤销')
    freshUser(team.owner_id)
    if (level === 'write' && !['owner', 'admin', 'editor'].includes(team.role) || level === 'manage' && !['owner', 'admin'].includes(team.role) || level === 'owner' && team.role !== 'owner') fail(403, '团队角色没有此操作权限')
    return team
  }
  const teamNode = (teamId, id) => { const node = db.one('SELECT * FROM team_nodes WHERE id=? AND team_id=?', [id, teamId]); if (!node) fail(404, '团队文件不存在'); return node }
  const parentFor = (teamId, parent) => { if (parent && teamNode(teamId, parent).kind !== 'folder') fail(400, '目标不是团队目录') }
  const inviteFor = (id, userId, access) => {
    const invite = db.one('SELECT * FROM team_invites WHERE id=? AND recipient_id=?', [id, userId])
    if (!invite || invite.revoked || invite.expires <= clock() || !access || digest(access) !== invite.access_hash) fail(404, '邀请不存在、已撤销或已到期')
    const inviter = teamFor(invite.team_id, invite.inviter_id, 'manage')
    if (inviter.role === 'admin' && invite.role === 'admin') fail(403, '邀请人的管理权限已变更')
    return invite
  }
  const shareFor = (id, userId, access, editing = false, trustedPresence = false, allowInactiveOwner = false) => {
    const share = db.one('SELECT * FROM shares WHERE id=?', [id])
    if (!share || (share.revoked || share.expires <= clock()) && !(allowInactiveOwner && share.owner_id === userId)) fail(404, '共享不存在、已撤销或已到期')
    if (share.owner_id !== userId && (share.recipient_id !== userId || !trustedPresence && (!access || digest(access) !== share.access_hash))) fail(403, '共享凭证或接收账号不匹配')
    freshUser(share.owner_id)
    nodeFor(share.node_id, share.owner_id)
    if (editing && share.owner_id !== userId && share.permission !== 'edit') fail(403, '此共享仅允许读取')
    return share
  }
  const shareView = (share, userId) => ({ id: share.id, nodeId: share.node_id, ownerId: share.owner_id, recipientPhone: mask(db.one('SELECT phone FROM users WHERE id=?', [share.recipient_id]).phone), permission: share.permission, expiresAt: share.expires, expired: share.expires<=clock(), created: share.created, revoked: Boolean(share.revoked), direction: share.owner_id === userId ? 'sent' : 'received', envelope: share.envelope, version: db.one('SELECT version FROM nodes WHERE id=?', [share.node_id])?.version ?? 0 })
  const teamView = team => ({ id: team.id, ownerId: team.owner_id, meta: team.meta, envelope: team.envelope, role: team.role, created: team.created })
  function checkBytes(owner, length, extra = 0) { if (length < 28 || length > 100 * 1024 * 1024) fail(413, '加密文件须在 100 MiB 内'); ensureDisk(length); if (usage(owner) + reservation(owner) + length + extra > quota) fail(413, '云空间不足') }
  function storeVersion(node, raw, actor, teamId) {
    const id = randomUUID(), filename = path.join(teamId?teamObjects:objects, id)
    fs.writeFileSync(filename, raw, { mode: 0o600, flag: 'wx' })
    try {
      db.transaction(() => {
        if (teamId) {
          db.run('INSERT INTO team_versions(id,team_id,node_id,version,blob,bytes,created,actor_id) VALUES(?,?,?,?,?,?,?,?)', [id, teamId, node.id, node.version + 1, id, raw.length, clock(), actor])
          db.run('UPDATE team_nodes SET version=?,updated=? WHERE id=?', [node.version + 1, clock(), node.id])
        } else {
          db.run('INSERT INTO versions(id,node_id,user_id,version,blob,bytes,created) VALUES(?,?,?,?,?,?,?)', [id, node.id, node.user_id, node.version + 1, id, raw.length, clock()])
          db.run('UPDATE nodes SET version=?,updated=? WHERE id=?', [node.version + 1, clock(), node.id])
        }
        audit(actor, teamId ? 'team-save' : 'share-save', node.id)
      })
    } catch (error) { fs.unlinkSync(filename); throw error }
    return { id: node.id, version: node.version + 1 }
  }
  function purgeUser(userId) {
    const blobs = db.query('SELECT v.blob FROM team_versions v JOIN teams t ON t.id=v.team_id WHERE t.owner_id=?', [userId])
    for (const team of db.query('SELECT id FROM teams WHERE owner_id=?', [userId])) for (const table of ['team_versions', 'team_nodes', 'team_invites', 'team_members']) db.run(`DELETE FROM ${table} WHERE team_id=?`, [team.id])
    db.run('DELETE FROM teams WHERE owner_id=?', [userId]); db.run('DELETE FROM team_members WHERE user_id=?', [userId]); db.run('DELETE FROM team_invites WHERE recipient_id=? OR inviter_id=?', [userId, userId]); db.run('DELETE FROM shares WHERE owner_id=? OR recipient_id=?', [userId, userId]); db.run('DELETE FROM node_tags WHERE user_id=?', [userId]); db.run('DELETE FROM tags WHERE user_id=?', [userId])
    return blobs.map(item=>({...item,team:true}))
  }
  async function handle({ route, method, req, res, user, session, json, body, reply }) {
    if (!/^\/v1\/(devices|shares|tags|teams)(?:\/|$)/.test(route)) return false
    if (route.startsWith('/v1/devices')) {
      if (route === '/v1/devices' && method === 'GET') {
        const rows = db.query('SELECT d.device_id id,d.device_name name,MIN(d.created) created,MAX(d.last_seen) lastSeen,MAX(s.expires) expires FROM sessions s JOIN session_devices d ON d.session_hash=s.hash WHERE s.user_id=? AND s.expires>? GROUP BY d.device_id', [user.id, clock()])
        reply({ items: rows.map(item => ({ ...item, current: item.id === session.device_id })) }); return true
      }
      if (route === '/v1/devices' && method === 'POST') {
        const input = await json(); if (!uuid(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) fail(400, '设备标识或名称无效')
        db.transaction(() => db.run('UPDATE session_devices SET device_id=?,device_name=?,last_seen=? WHERE session_hash=? AND user_id=?', [input.id, input.name.trim(), clock(), session.hash, user.id])); reply({ id: input.id, name: input.name.trim(), current: true }); return true
      }
      const match = /^\/v1\/devices\/([0-9a-f-]{36})$/.exec(route)
      if (match) {
        if (!db.one('SELECT s.hash FROM sessions s JOIN session_devices d ON d.session_hash=s.hash WHERE s.user_id=? AND d.device_id=? AND s.expires>?', [user.id, match[1], clock()])) fail(404, '设备会话不存在')
        if (method === 'PATCH') { const input = await json(); if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) fail(400, '设备名称无效'); db.transaction(() => db.run('UPDATE session_devices SET device_name=? WHERE user_id=? AND device_id=?', [input.name.trim(), user.id, match[1]])); reply({ id: match[1], name: input.name.trim() }); return true }
        if (method === 'DELETE') { db.transaction(() => { db.run('DELETE FROM sessions WHERE user_id=? AND hash IN (SELECT session_hash FROM session_devices WHERE user_id=? AND device_id=?)', [user.id,user.id,match[1]]);db.run('DELETE FROM session_devices WHERE user_id=? AND device_id=?',[user.id,match[1]]); audit(user.id, 'device-revoke', match[1]) }); reply({ revoked: true, current: match[1] === session.device_id }); return true }
      }
      fail(404, '设备接口不存在')
    }
    freshUser(user.id)
    if (route === '/v1/shares') {
      if (method === 'GET') { reply({ items: db.query('SELECT * FROM shares WHERE owner_id=? OR recipient_id=? ORDER BY created DESC', [user.id, user.id]).map(item => shareView(item, user.id)) }); return true }
      if (method === 'POST') {
        const input = await json(); envelope(input); const node = nodeFor(input.nodeId, user.id), target = recipient(input.recipientPhone), expires = expiry(input.expiresAt)
        if (target === user.id || !['read', 'edit'].includes(input.permission) || !['file', 'knowledge'].includes(node.kind) || !node.version) fail(400, '请选择有已保存版本的文件和其他接收账号')
        if (db.one('SELECT id FROM shares WHERE id=?', [input.id])) fail(409, '共享标识已存在')
        if (db.one('SELECT COUNT(*) n FROM shares WHERE owner_id=?', [user.id]).n >= 1000) fail(413, '共享数量已达上限')
        if(usage(user.id)+reservation(user.id)+Buffer.byteLength(input.envelope)>quota)fail(413,'云空间不足')
        db.transaction(() => { db.run('INSERT INTO shares(id,node_id,owner_id,recipient_id,permission,access_hash,envelope,expires,created) VALUES(?,?,?,?,?,?,?,?,?)', [input.id, node.id, user.id, target, input.permission, input.accessHash, input.envelope, expires, clock()]); audit(user.id, 'share-create', input.id) }); reply(shareView(db.one('SELECT * FROM shares WHERE id=?', [input.id]), user.id)); return true
      }
    }
    const share = /^\/v1\/shares\/([0-9a-f-]{36})(?:\/(content))?$/.exec(route)
    if (share) {
      if (method === 'DELETE' && !share[2]) { const item = db.one('SELECT owner_id FROM shares WHERE id=?', [share[1]]); if (!item || item.owner_id !== user.id) fail(404, '共享不存在'); db.transaction(() => db.run('UPDATE shares SET revoked=1 WHERE id=?', [share[1]])); reply({ revoked: true }); return true }
      let item = shareFor(share[1], user.id, req.headers['x-seal-access'], method === 'PUT', false, method === 'GET' && !share[2])
      if (method === 'GET' && !share[2]) { reply(shareView(item, user.id)); return true }
      if (share[2] && method === 'GET') { const requested=req.headers['x-seal-version'];const version = requested===undefined?db.one('SELECT blob,version FROM versions WHERE node_id=? ORDER BY version DESC LIMIT 1', [item.node_id]):db.one('SELECT blob,version FROM versions WHERE node_id=? AND version=?',[item.node_id,Number(requested)]); if (!version) fail(404, '共享尚无此版本'); res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('X-Seal-Version', version.version); streamObject(version.blob, res); return true }
      if (share[2] && method === 'PUT') {
        const raw = await body(req, 100 * 1024 * 1024); if(!db.one('SELECT hash FROM sessions WHERE hash=? AND expires>?',[session.hash,clock()]))fail(401,'设备会话已撤销');item = shareFor(share[1], user.id, req.headers['x-seal-access'], true); const node = nodeFor(item.node_id, item.owner_id)
        if (db.one('SELECT id FROM realtime_rooms WHERE node_id=? AND kind=\'share\'', [node.id])) fail(409, '文件已启用实时共同编辑，请同步实时修改；旧版整文件发布已停止，以免覆盖协作内容')
        if (Number(req.headers['x-seal-expected']) !== node.version) fail(409, '共享文件已有新版本，请重新下载并保留本机修改')
        checkBytes(item.owner_id, raw.length); reply(storeVersion(node, raw, user.id)); return true
      }
    }
    if (route === '/v1/tags') {
      if (method === 'GET') { reply({ items: db.query('SELECT t.id,t.meta,t.created,(SELECT COUNT(*) FROM node_tags nt JOIN nodes n ON n.id=nt.node_id WHERE nt.tag_id=t.id AND n.deleted=0) count FROM tags t WHERE user_id=?', [user.id]) }); return true }
      if (method === 'POST') { const input = await json(); if (!uuid(input.id) || !opaque(input.meta)) fail(400, '加密标签无效'); if (db.one('SELECT COUNT(*) n FROM tags WHERE user_id=?', [user.id]).n >= 200) fail(413, '标签数量已达上限'); if (db.one('SELECT id FROM tags WHERE id=?', [input.id])) fail(409, '标签已存在');budget(user.id,Buffer.byteLength(input.meta)); db.transaction(() => db.run('INSERT INTO tags VALUES(?,?,?,?)', [input.id, user.id, input.meta, clock()])); reply({ id: input.id, meta: input.meta, count: 0 }); return true }
    }
    const tag = /^\/v1\/tags\/([0-9a-f-]{36})(?:\/(nodes))?$/.exec(route)
    if (tag) {
      if (!db.one('SELECT id FROM tags WHERE id=? AND user_id=?', [tag[1], user.id])) fail(404, '标签不存在')
      if (tag[2] && method === 'GET') { reply({ items: db.query('SELECT n.* FROM nodes n JOIN node_tags nt ON nt.node_id=n.id WHERE n.user_id=? AND nt.tag_id=? AND n.deleted=0', [user.id, tag[1]]) }); return true }
      if (method === 'PATCH' && !tag[2]) { const input = await json(); if (!opaque(input.meta)) fail(400, '加密标签无效');budget(user.id,Buffer.byteLength(input.meta)-Buffer.byteLength(db.one('SELECT meta FROM tags WHERE id=? AND user_id=?',[tag[1],user.id]).meta)); db.transaction(() => db.run('UPDATE tags SET meta=? WHERE id=? AND user_id=?', [input.meta, tag[1], user.id])); reply({ updated: true }); return true }
      if (method === 'DELETE' && !tag[2]) { db.transaction(() => { db.run('DELETE FROM node_tags WHERE tag_id=? AND user_id=?', [tag[1], user.id]); db.run('DELETE FROM tags WHERE id=? AND user_id=?', [tag[1], user.id]) }); reply({ deleted: true }); return true }
    }
    const assignment = /^\/v1\/tags\/nodes\/([0-9a-f-]{36})$/.exec(route)
    if (assignment && method === 'PUT') { const input = await json(); nodeFor(assignment[1], user.id); if (!Array.isArray(input.tagIds) || input.tagIds.length > 50 || new Set(input.tagIds).size !== input.tagIds.length) fail(400, '标签集合无效'); for (const id of input.tagIds) if (!db.one('SELECT id FROM tags WHERE id=? AND user_id=?', [id, user.id])) fail(404, '标签不存在'); db.transaction(() => { db.run('DELETE FROM node_tags WHERE node_id=? AND user_id=?', [assignment[1], user.id]); for (const id of input.tagIds) db.run('INSERT INTO node_tags VALUES(?,?,?)', [user.id, assignment[1], id]) }); reply({ id: assignment[1], tagIds: input.tagIds }); return true }
    if (route === '/v1/teams') {
      if (method === 'GET') { reply({ items: db.query('SELECT t.*,m.role,m.envelope FROM teams t JOIN team_members m ON t.id=m.team_id JOIN users u ON u.id=t.owner_id WHERE m.user_id=? AND u.enabled=1', [user.id]).map(teamView) }); return true }
      if (method === 'POST') { const input = await json(); if (!uuid(input.id) || !opaque(input.meta) || !opaque(input.envelope)) fail(400, '加密团队信息无效'); if (db.one('SELECT COUNT(*) n FROM teams WHERE owner_id=?', [user.id]).n >= 20) fail(413, '团队数量已达上限'); if (db.one('SELECT id FROM teams WHERE id=?', [input.id])) fail(409, '团队已存在');budget(user.id,Buffer.byteLength(input.meta)+Buffer.byteLength(input.envelope)); db.transaction(() => { db.run('INSERT INTO teams VALUES(?,?,?,?)', [input.id, user.id, input.meta, clock()]); db.run('INSERT INTO team_members VALUES(?,?,?,?,?)', [input.id, user.id, 'owner', input.envelope, clock()]) }); reply(teamView(teamFor(input.id, user.id))); return true }
    }
    const invite = /^\/v1\/teams\/invites\/([0-9a-f-]{36})(?:\/(accept))?$/.exec(route)
    if (invite) {
      const item = inviteFor(invite[1], user.id, req.headers['x-seal-access'])
      if (method === 'GET' && !invite[2]) { reply({ id: item.id, teamId: item.team_id, envelope: item.envelope, role: item.role, expiresAt: item.expires }); return true }
      if (method === 'POST' && invite[2]) { const input = await json(); const current = inviteFor(invite[1], user.id, req.headers['x-seal-access']); if (current.accepted) fail(409, '邀请已使用'); if (!opaque(input.envelope)) fail(400, '成员加密密钥无效'); if (db.one('SELECT user_id FROM team_members WHERE team_id=? AND user_id=?', [item.team_id, user.id])) fail(409, '账号已是团队成员');const teamOwner=db.one('SELECT owner_id FROM teams WHERE id=?',[item.team_id]).owner_id;budget(teamOwner,Buffer.byteLength(input.envelope));if(db.one('SELECT COUNT(*) n FROM team_members WHERE team_id=?',[item.team_id]).n>=100)fail(413,'团队成员数量已达上限'); db.transaction(() => { db.run('INSERT INTO team_members VALUES(?,?,?,?,?)', [item.team_id, user.id, item.role, input.envelope, clock()]); db.run('UPDATE team_invites SET accepted=1 WHERE id=?', [item.id]) }); reply(teamView(teamFor(item.team_id, user.id))); return true }
    }
    const team = /^\/v1\/teams\/([0-9a-f-]{36})(?:\/(members|invites|nodes))?(?:\/([0-9a-f-]{36}))?(?:\/(content))?$/.exec(route)
    if (team) {
      const id = team[1], area = team[2], child = team[3], content = team[4]
      let current = teamFor(id, user.id)
      if(!area&&method==='PATCH'){const input=await json();current=teamFor(id,user.id,'owner');if(!opaque(input.meta))fail(400,'加密团队信息无效');if(usage(current.owner_id)-Buffer.byteLength(current.meta)+Buffer.byteLength(input.meta)+reservation(current.owner_id)>quota)fail(413,'团队所有者云空间不足');db.transaction(()=>db.run('UPDATE teams SET meta=? WHERE id=?',[input.meta,id]));reply(teamView(teamFor(id,user.id)));return true}
      if (!area && method === 'DELETE') { teamFor(id, user.id, 'owner'); const blobs = db.query('SELECT blob FROM team_versions WHERE team_id=?', [id]); db.transaction(() => { for (const table of ['team_versions', 'team_nodes', 'team_invites', 'team_members']) db.run(`DELETE FROM ${table} WHERE team_id=?`, [id]); db.run('DELETE FROM teams WHERE id=?', [id]) }); for (const item of blobs) fs.unlinkSync(path.join(teamObjects, item.blob)); reply({ deleted: true }); return true }
      if (area === 'members') {
        if (method === 'GET' && !child) { const items = db.query('SELECT m.user_id userId,m.role,m.joined,u.phone FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.team_id=?', [id]).map(item => ({ ...item, phone: mask(item.phone) })); const invites = ['owner', 'admin'].includes(current.role) ? db.query('SELECT i.id,i.role,i.expires expiresAt,i.accepted,i.revoked,u.phone recipientPhone FROM team_invites i JOIN users u ON u.id=i.recipient_id WHERE i.team_id=?', [id]).map(item => ({ ...item, recipientPhone: mask(item.recipientPhone) })) : []; reply({ items, invites }); return true }
        const input = method === 'PATCH' ? await json() : {}; current = teamFor(id, user.id, 'manage'); const target = db.one('SELECT role FROM team_members WHERE team_id=? AND user_id=?', [id, child]); if (!target) fail(404, '成员不存在'); if (target.role === 'owner' || child === user.id || current.role === 'admin' && target.role === 'admin') fail(403, '不能修改此成员的管理权限')
        if (method === 'PATCH') { if (!['admin', 'editor', 'viewer'].includes(input.role) || current.role === 'admin' && input.role === 'admin') fail(403, '不能授予此角色'); db.transaction(() => db.run('UPDATE team_members SET role=? WHERE team_id=? AND user_id=?', [input.role, id, child])); reply({ updated: true }); return true }
        if (method === 'DELETE') { db.transaction(() => { db.run('DELETE FROM team_members WHERE team_id=? AND user_id=?', [id, child]); db.run('UPDATE team_invites SET revoked=1 WHERE team_id=? AND (recipient_id=? OR inviter_id=?)', [id, child, child]) }); reply({ removed: true }); return true }
      }
      if (area === 'invites') {
        current = teamFor(id, user.id, 'manage')
        if (method === 'DELETE' && child) { if (!db.one('SELECT id FROM team_invites WHERE id=? AND team_id=?', [child, id])) fail(404, '邀请不存在'); db.transaction(() => db.run('UPDATE team_invites SET revoked=1 WHERE id=?', [child])); reply({ revoked: true }); return true }
        if (method === 'POST' && !child) { const input = await json(); envelope(input); current = teamFor(id, user.id, 'manage'); if (!['admin', 'editor', 'viewer'].includes(input.role) || current.role === 'admin' && input.role === 'admin') fail(403, '不能邀请此角色'); const target = recipient(input.recipientPhone), expires = expiry(input.expiresAt); if (db.one('SELECT user_id FROM team_members WHERE team_id=? AND user_id=?', [id, target])) fail(409, '接收人已是成员'); if (db.one('SELECT id FROM team_invites WHERE id=?', [input.id])) fail(409, '邀请已存在');budget(current.owner_id,Buffer.byteLength(input.envelope));if(db.one('SELECT COUNT(*) n FROM team_invites WHERE team_id=?',[id]).n>=500)fail(413,'团队邀请数量已达上限'); db.transaction(() => db.run('INSERT INTO team_invites(id,team_id,inviter_id,recipient_id,role,access_hash,envelope,expires,created) VALUES(?,?,?,?,?,?,?,?,?)', [input.id, id, user.id, target, input.role, input.accessHash, input.envelope, expires, clock()])); reply({ id: input.id, expiresAt: expires, role: input.role }); return true }
      }
      if (area === 'nodes') {
        if (!child && method === 'GET') { reply({ items: db.query('SELECT * FROM team_nodes WHERE team_id=? ORDER BY updated DESC', [id]) }); return true }
        if (!child && method === 'POST') { const input = await json(); current = teamFor(id, user.id, 'write'); if (!uuid(input.id) || !['file', 'folder'].includes(input.kind) || !opaque(input.meta)) fail(400, '团队文件信息无效'); parentFor(id, input.parent); if (db.one('SELECT id FROM team_nodes WHERE id=?', [input.id])) fail(409, '团队文件标识已存在'); if (usage(current.owner_id) + reservation(current.owner_id) + Buffer.byteLength(input.meta) > quota) fail(413, '团队所有者云空间不足'); db.transaction(() => db.run('INSERT INTO team_nodes(id,team_id,parent,kind,meta,updated) VALUES(?,?,?,?,?,?)', [input.id, id, input.parent || null, input.kind, input.meta, clock()])); reply(teamNode(id, input.id)); return true }
        let node = teamNode(id, child)
        if (content && method === 'GET') { const requested=req.headers['x-seal-version'];const version = requested===undefined?db.one('SELECT blob FROM team_versions WHERE team_id=? AND node_id=? ORDER BY version DESC LIMIT 1', [id, child]):db.one('SELECT blob FROM team_versions WHERE team_id=? AND node_id=? AND version=?',[id,child,Number(requested)]); if (!version) fail(404, '团队文件尚无此版本');const filename=path.join(teamObjects,version.blob);if(!fs.existsSync(filename))fail(503,'团队文件暂时不可用'); res.setHeader('Content-Type', 'application/octet-stream');const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());stream.pipe(res);return true }
        if (content && method === 'PUT') { teamFor(id, user.id, 'write'); const raw = await body(req, 100 * 1024 * 1024);if(!db.one('SELECT hash FROM sessions WHERE hash=? AND expires>?',[session.hash,clock()]))fail(401,'设备会话已撤销'); current = teamFor(id, user.id, 'write'); node = teamNode(id, child); if (node.kind !== 'file') fail(400, '目录不能上传文件内容'); if (db.one("SELECT id FROM realtime_rooms WHERE kind='team' AND scope_id=? AND node_id=?", [id, child])) fail(409, '文件已启用实时共同编辑，请同步实时修改；旧版整文件发布已停止'); if (Number(req.headers['x-seal-expected']) !== node.version) fail(409, '团队文件已有新版本，请保留本机修改并重新下载'); checkBytes(current.owner_id, raw.length); reply(storeVersion(node, raw, user.id, id)); return true }
        if (!content && method === 'PATCH') { const input = await json(); current = teamFor(id, user.id, 'write'); node = teamNode(id, child); if (!opaque(input.meta)) fail(400, '加密文件信息无效'); parentFor(id, input.parent); let parent = input.parent; while (parent) { if (parent === child) fail(400, '目录不能移入自身或子目录'); parent = teamNode(id, parent).parent } if (usage(current.owner_id) - Buffer.byteLength(node.meta) + Buffer.byteLength(input.meta) + reservation(current.owner_id) > quota) fail(413, '团队所有者云空间不足'); db.transaction(() => db.run('UPDATE team_nodes SET parent=?,meta=?,updated=? WHERE id=?', [input.parent || null, input.meta, clock(), child])); reply(teamNode(id, child)); return true }
        if (!content && method === 'DELETE') { teamFor(id, user.id, 'write'); const tree = db.query('WITH RECURSIVE tree(id) AS (SELECT id FROM team_nodes WHERE id=? AND team_id=? UNION ALL SELECT n.id FROM team_nodes n JOIN tree t ON n.parent=t.id WHERE n.team_id=?) SELECT id FROM tree', [child, id, id]); const blobs = []; db.transaction(() => { for (const item of tree) { blobs.push(...db.query('SELECT blob FROM team_versions WHERE node_id=? AND team_id=?', [item.id, id])); db.run('DELETE FROM team_versions WHERE node_id=? AND team_id=?', [item.id, id]); db.run('DELETE FROM team_nodes WHERE id=? AND team_id=?', [item.id, id]) } }); for (const item of blobs) fs.unlinkSync(path.join(teamObjects, item.blob)); reply({ deleted: true }); return true }
      }
    }
    fail(404, '协作接口不存在')
  }
  const authorizeRealtime = ({ kind, id, nodeId, userId, access, write = false, trustedPresence = false }) => {
    freshUser(userId)
    if (kind === 'node') {
      const node = nodeFor(id, userId)
      if (!['file', 'knowledge'].includes(node.kind) || !node.version) fail(400, '请选择已保存的云文件')
      // The owner and all authorized shares use the same room and file key.
      return { roomId: `share:${node.id}`, ownerId: userId, nodeId: node.id, scopeId: userId, version: node.version, editable: true }
    }
    if (kind === 'share') {
      const share = shareFor(id, userId, access, write, trustedPresence, true), node = nodeFor(share.node_id, share.owner_id)
      if (!['file', 'knowledge'].includes(node.kind) || !node.version) fail(400, '请选择已保存的共享文件')
      return { roomId: `share:${node.id}`, ownerId: share.owner_id, nodeId: node.id, scopeId: share.owner_id, version: node.version, editable: share.owner_id === userId || share.permission === 'edit' }
    }
    const team = teamFor(id, userId, write ? 'write' : 'read'), node = teamNode(id, nodeId)
    if (node.kind !== 'file' || !node.version) fail(400, '请选择已保存的团队文件')
    return { roomId: `team:${id}:${node.id}`, ownerId: team.owner_id, nodeId: node.id, scopeId: id, version: node.version, editable: ['owner', 'admin', 'editor'].includes(team.role) }
  }
  return { handle, purgeUser, authorizeRealtime }
}
module.exports = { createCollaboration }
