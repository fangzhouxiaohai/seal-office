const { randomUUID, randomBytes, createHash } = require('crypto')
const { seal, unseal } = require('./crypto')
const digest = value => createHash('sha256').update(value).digest('hex')
const idPath = value => { if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new Error('协作标识无效'); return value }
const nameFor = value => { if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error('请输入 1–120 字名称'); return value.trim() }
const decodeData = data => { if (typeof data !== 'string') throw new Error('文件数据无效'); const raw = Buffer.from(data, 'base64'); if (raw.toString('base64') !== data || raw.length > 100 * 1024 * 1024 - 28) throw new Error('文件数据无效或超过 100 MiB'); return raw }
const pack = (key, value, context) => seal(key, Buffer.from(JSON.stringify(value)), context).toString('base64')
const unpack = (key, value, context) => JSON.parse(unseal(key, Buffer.from(value, 'base64'), context).toString())
const url64 = value => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function credential(kind, id) { const access = url64(randomBytes(32)), key = randomBytes(32); return { access, key, text: `seal-${kind}-v1:${id}:${access}:${url64(key)}` } }
function parseCredential(kind, value) { const match = new RegExp(`^seal-${kind}-v1:([0-9a-f-]{36}):([A-Za-z0-9_-]{43}):([A-Za-z0-9_-]{43})$`).exec(typeof value === 'string' ? value.trim() : ''); if (!match) throw new Error('邀请凭证格式无效'); return { id: match[1], access: match[2], key: Buffer.from(match[3].replace(/-/g, '+').replace(/_/g, '/'), 'base64') } }

function createCollaboration({ request, requireSpace, root, getState, persist, list, keyFor, invalidateSession }) {
  const state = () => { const value = getState(); value.shareKeys ||= {}; return value }
  const shareSecret = id => { const secret = state().shareKeys[idPath(id)]; if (!secret) throw new Error('请先输入此共享的邀请凭证'); return { access: secret.access, key: Buffer.from(secret.key, 'base64') } }
  const shareInfo = async id => {
    requireSpace(); idPath(id)
    if (!state().shareKeys[id]) {
      // The owner can recover its file key with its own root on a new device;
      // recipient invitation secrets are never required to read an owned file.
      const info = await request(`/v1/shares/${id}`), node = (await list()).find(item => item.id === info.nodeId && !item.deleted)
      if (info.direction !== 'sent' || !node) throw new Error('请先输入此共享的邀请凭证')
      return { info, secret: { access: '' }, details: { nodeId: node.id, name: node.meta.name, filename: node.meta.filename || node.meta.name, fileKey: keyFor(node).toString('base64') } }
    }
    const secret = shareSecret(id), info = await request(`/v1/shares/${id}`, { headers: { 'X-Seal-Access': secret.access } }), details = unpack(secret.key, info.envelope, `seal-share:${id}`)
    return { info, secret, details }
  }
  const teamInfo = async id => { requireSpace(); idPath(id); const item = (await request('/v1/teams')).items.find(team => team.id === id); if (!item) throw Object.assign(new Error('团队不存在或成员权限已撤销'), { status: 404 }); const key = unseal(root(), Buffer.from(item.envelope, 'base64'), `seal-team-key:${id}:${state().account.id}`); return { item, key, meta: unpack(key, item.meta, `seal-team-meta:${id}`) } }
  const teamView = ({ item, meta }) => ({ id: item.id, name: meta.name, ownerId: item.ownerId, role: item.role, created: item.created })
  const teamNodeView = (key, teamId, node) => ({ ...node, teamId, meta: unpack(key, node.meta, `seal-team-node:${teamId}:${node.id}`) })
  const teamNodesWithKey = async id => { const team = await teamInfo(id); return { ...team, nodes: (await request(`/v1/teams/${id}/nodes`)).items.map(node => teamNodeView(team.key, id, node)) } }
  const tagView = item => ({ id: item.id, ...unpack(root(), item.meta, `seal-tag:${item.id}`), count: item.count ?? 0 })
  const tagMeta = (name, color) => { const meta = { name: nameFor(name), color: color || '#2463EB' }; if (!/^#[0-9a-f]{6}$/i.test(meta.color)) throw new Error('标签颜色无效'); return meta }
  const api = {
    async resolveRealtime({ kind, id, nodeId }) {
      if (kind === 'node') { requireSpace(); idPath(id); const node = (await list()).find(item => item.id === id && !item.deleted); if (!node || !node.version || !['file', 'knowledge'].includes(node.kind)) throw Object.assign(new Error('云端协作文件不存在'), { status: 404 }); return { roomId: `share:${node.id}`, key: keyFor(node), editable: true } }
      if (kind === 'share') { const { info, secret, details } = await shareInfo(id); return { roomId: `share:${info.nodeId}`, key: Buffer.from(details.fileKey, 'base64'), access: secret.access, editable: info.direction === 'sent' || info.permission === 'edit' } }
      if (kind !== 'team') throw new Error('实时协作来源无效')
      const team = await teamNodesWithKey(id), node = team.nodes.find(node => node.id === nodeId)
      if (!node || node.kind !== 'file') throw Object.assign(new Error('团队协作文件不存在'), { status: 404 })
      return { roomId: `team:${id}:${nodeId}`, key: Buffer.from(node.meta.key, 'base64'), editable: ['owner', 'admin', 'editor'].includes(team.item.role) }
    },
    async shareList() {
      requireSpace(); const own = await list(), items = (await request('/v1/shares')).items
      return { items: items.map(item => { const secret = state().shareKeys[item.id]; const node = own.find(node => node.id === item.nodeId); let name = node?.meta.name || '待接受的加密共享', filename = node?.meta.filename; if (secret) { const details = unpack(Buffer.from(secret.key, 'base64'), item.envelope, `seal-share:${item.id}`); name = details.name; filename = details.filename }; const { envelope, ...visible } = item; return { ...visible, name, ...(filename ? { filename } : {}), accepted: Boolean(secret || node) } }) }
    },
    async shareCreate({ id, recipientPhone, permission = 'read', expiresAt }) {
      requireSpace(); idPath(id); const node = (await list()).find(node => node.id === id && !node.deleted); if (!node || !node.version) throw new Error('请选择已同步保存的云文件')
      const shareId = randomUUID(), secret = credential('share', shareId), details = { nodeId: id, name: node.meta.name, filename: node.meta.filename || node.meta.name, fileKey: keyFor(node).toString('base64') }
      const info = await request('/v1/shares', { method: 'POST', data: { id: shareId, nodeId: id, recipientPhone, permission, expiresAt, accessHash: digest(secret.access), envelope: pack(secret.key, details, `seal-share:${shareId}`) } })
      state().shareKeys[shareId] = { access: secret.access, key: secret.key.toString('base64') }; persist(); const { envelope, ...visible } = info; return { ...visible, name: details.name, credential: secret.text }
    },
    async shareAccept({ credential: value }) { requireSpace(); const secret = parseCredential('share', value); const info = await request(`/v1/shares/${secret.id}`, { headers: { 'X-Seal-Access': secret.access } }); const details = unpack(secret.key, info.envelope, `seal-share:${secret.id}`); state().shareKeys[secret.id] = { access: secret.access, key: secret.key.toString('base64') }; persist(); const { envelope, ...visible } = info; return { ...visible, name: details.name, accepted: true } },
    async shareRevoke({ id }) { requireSpace(); return request(`/v1/shares/${idPath(id)}`, { method: 'DELETE' }) },
    async shareDownload({ id }) { const { info, secret, details } = await shareInfo(id); const raw = await request(`/v1/shares/${id}/content`, { binary: true, headers: { 'X-Seal-Access': secret.access, 'X-Seal-Version': String(info.version) } }); return { name: details.filename, data: unseal(Buffer.from(details.fileKey, 'base64'), raw, `seal-data:${info.nodeId}`).toString('base64'), version: info.version, nodeId: info.nodeId } },
    async shareSave({ id, data, expectedVersion }) { const raw = decodeData(data); if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('请提供下载时的共享文件版本'); const { info, secret, details } = await shareInfo(id); if (info.direction !== 'sent' && info.permission !== 'edit') throw new Error('此共享仅允许读取'); const encrypted = seal(Buffer.from(details.fileKey, 'base64'), raw, `seal-data:${info.nodeId}`); return request(`/v1/shares/${id}/content`, { method: 'PUT', data: encrypted, headers: { 'X-Seal-Access': secret.access, 'X-Seal-Expected': String(expectedVersion) } }) },
    async deviceRegister({ name } = {}) { if (!state().account) throw new Error('请先登录'); state().deviceId ||= randomUUID(); const result = await request('/v1/devices', { method: 'POST', data: { id: state().deviceId, name: nameFor(name || '当前设备') } }); persist(); return result },
    async deviceList() { if (!state().account) throw new Error('请先登录'); return request('/v1/devices') },
    async deviceRename({ id, name }) { return request(`/v1/devices/${idPath(id)}`, { method: 'PATCH', data: { name: nameFor(name) } }) },
    async deviceRevoke({ id }) { const result = await request(`/v1/devices/${idPath(id)}`, { method: 'DELETE' }); if (result.current) invalidateSession(); return result },
    async tagList() { requireSpace(); return { items: (await request('/v1/tags')).items.map(tagView) } },
    async tagCreate({ name, color }) { requireSpace(); const meta = tagMeta(name, color); if ((await this.tagList()).items.some(tag => tag.name === meta.name)) throw new Error('同名标签已存在'); const id = randomUUID(); const item = await request('/v1/tags', { method: 'POST', data: { id, meta: pack(root(), meta, `seal-tag:${id}`) } }); return tagView(item) },
    async tagUpdate({ id, name, color }) { requireSpace(); idPath(id); const tags = (await this.tagList()).items, old = tags.find(tag => tag.id === id); if (!old) throw new Error('标签不存在'); const meta = tagMeta(name ?? old.name, color ?? old.color); if (tags.some(tag => tag.id !== id && tag.name === meta.name)) throw new Error('同名标签已存在'); await request(`/v1/tags/${id}`, { method: 'PATCH', data: { meta: pack(root(), meta, `seal-tag:${id}`) } }); return { ...old, ...meta } },
    async tagDelete({ id }) { requireSpace(); return request(`/v1/tags/${idPath(id)}`, { method: 'DELETE' }) },
    async tagAssign({ id, tagIds }) { requireSpace(); return request(`/v1/tags/nodes/${idPath(id)}`, { method: 'PUT', data: { tagIds } }) },
    async tagFilter({ id }) { requireSpace(); await request(`/v1/tags/${idPath(id)}/nodes`); return (await list()).filter(node => node.tagIds?.includes(id) && !node.deleted) },
    async teamList() { requireSpace(); const items = (await request('/v1/teams')).items; return { items: items.map(item => { const key = unseal(root(), Buffer.from(item.envelope, 'base64'), `seal-team-key:${item.id}:${state().account.id}`); return teamView({ item, meta: unpack(key, item.meta, `seal-team-meta:${item.id}`) }) }) } },
    async teamCreate({ name }) { requireSpace(); const id = randomUUID(), key = randomBytes(32), meta = { name: nameFor(name) }; const item = await request('/v1/teams', { method: 'POST', data: { id, meta: pack(key, meta, `seal-team-meta:${id}`), envelope: seal(root(), key, `seal-team-key:${id}:${state().account.id}`).toString('base64') } }); return teamView({ item, meta }) },
    async teamUpdate({id,name}){const team=await teamInfo(id),meta={...team.meta,name:nameFor(name)};const item=await request(`/v1/teams/${id}`,{method:'PATCH',data:{meta:pack(team.key,meta,`seal-team-meta:${id}`)}});return teamView({item,meta})},
    async teamMembers({ id }) { requireSpace(); return request(`/v1/teams/${idPath(id)}/members`) },
    async teamInvite({ id, recipientPhone, role = 'viewer', expiresAt }) { const team = await teamInfo(id); const inviteId = randomUUID(), secret = credential('team', inviteId); const result = await request(`/v1/teams/${id}/invites`, { method: 'POST', data: { id: inviteId, recipientPhone, role, expiresAt, accessHash: digest(secret.access), envelope: pack(secret.key, { teamId: id, key: team.key.toString('base64') }, `seal-team-invite:${inviteId}`) } }); return { ...result, credential: secret.text } },
    async teamAccept({ credential: value }) { requireSpace(); const secret = parseCredential('team', value), info = await request(`/v1/teams/invites/${secret.id}`, { headers: { 'X-Seal-Access': secret.access } }), details = unpack(secret.key, info.envelope, `seal-team-invite:${secret.id}`); if (details.teamId !== info.teamId) throw new Error('团队邀请信息不匹配'); const envelope = seal(root(), Buffer.from(details.key, 'base64'), `seal-team-key:${info.teamId}:${state().account.id}`).toString('base64'); const item = await request(`/v1/teams/invites/${secret.id}/accept`, { method: 'POST', headers: { 'X-Seal-Access': secret.access }, data: { envelope } }); return teamView({ item, meta: unpack(Buffer.from(details.key, 'base64'), item.meta, `seal-team-meta:${item.id}`) }) },
    async teamRevokeInvite({ id, inviteId }) { requireSpace(); return request(`/v1/teams/${idPath(id)}/invites/${idPath(inviteId)}`, { method: 'DELETE' }) },
    async teamUpdateMember({ id, userId, role }) { requireSpace(); return request(`/v1/teams/${idPath(id)}/members/${idPath(userId)}`, { method: 'PATCH', data: { role } }) },
    async teamRemoveMember({ id, userId }) { requireSpace(); return request(`/v1/teams/${idPath(id)}/members/${idPath(userId)}`, { method: 'DELETE' }) },
    async teamNodes({ id }) { const team = await teamNodesWithKey(id); return { items: team.nodes } },
    async teamFolder({ id, name, parent }) { const team = await teamInfo(id), nodeId = randomUUID(), meta = { name: nameFor(name) }; const node = await request(`/v1/teams/${id}/nodes`, { method: 'POST', data: { id: nodeId, kind: 'folder', parent, meta: pack(team.key, meta, `seal-team-node:${id}:${nodeId}`) } }); return teamNodeView(team.key, id, node) },
    async teamSave({ id, nodeId, name, filename, data, expectedVersion, parent }) {
      const raw = decodeData(data), team = await teamNodesWithKey(id)
      let node = nodeId ? team.nodes.find(node => node.id === nodeId) : null
      if (nodeId && !node) throw new Error('团队文件不存在')
      if (!node) { nodeId = randomUUID(); const meta = { name: nameFor(name), filename: filename || name, key: randomBytes(32).toString('base64') }; node = teamNodeView(team.key, id, await request(`/v1/teams/${id}/nodes`, { method: 'POST', data: { id: nodeId, kind: 'file', parent, meta: pack(team.key, meta, `seal-team-node:${id}:${nodeId}`) } })); expectedVersion = 0 }
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('请提供下载时的团队文件版本')
      const encrypted = seal(Buffer.from(node.meta.key, 'base64'), raw, `seal-team-data:${id}:${node.id}`)
      return request(`/v1/teams/${id}/nodes/${node.id}/content`, { method: 'PUT', data: encrypted, headers: { 'X-Seal-Expected': String(expectedVersion) } })
    },
    async teamDownload({ id, nodeId }) { const team = await teamNodesWithKey(id), node = team.nodes.find(node => node.id === nodeId); if (!node || node.kind !== 'file' || !node.version) throw new Error('请选择有已保存版本的团队文件'); const raw = await request(`/v1/teams/${id}/nodes/${idPath(nodeId)}/content`, { binary: true, headers: { 'X-Seal-Version': String(node.version) } }); return { name: node.meta.filename || node.meta.name, data: unseal(Buffer.from(node.meta.key, 'base64'), raw, `seal-team-data:${id}:${nodeId}`).toString('base64'), version: node.version, nodeId } },
    async teamUpdateNode({ id, nodeId, name, parent }) { const team = await teamNodesWithKey(id), node = team.nodes.find(node => node.id === nodeId); if (!node) throw new Error('团队文件不存在'); const meta = { ...node.meta, name: name === undefined ? node.meta.name : nameFor(name) }; if (name !== undefined && node.kind === 'file') { const ext = /\.[^.\\/]+$/.exec(node.meta.filename || node.meta.name)?.[0] || ''; meta.filename = /^\.(?:sealmind|sealflow)$/i.test(ext) ? name.replace(/\.(?:sealmind|sealflow)$/i, '') + ext : /\.[^.\\/]+$/.test(name) ? name : name + ext } const result = await request(`/v1/teams/${id}/nodes/${idPath(nodeId)}`, { method: 'PATCH', data: { parent: parent === undefined ? node.parent : parent, meta: pack(team.key, meta, `seal-team-node:${id}:${nodeId}`) } }); return teamNodeView(team.key, id, result) },
    async teamRemoveNode({ id, nodeId }) { requireSpace(); return request(`/v1/teams/${idPath(id)}/nodes/${idPath(nodeId)}`, { method: 'DELETE' }) },
    async teamDelete({ id }) { requireSpace(); return request(`/v1/teams/${idPath(id)}`, { method: 'DELETE' }) },
  }
  let supportedUrl
  return Object.fromEntries(Object.entries(api).map(([action,operation])=>[action,async(...args)=>{
    if(supportedUrl!==state().url){const capabilities=await request('/v1/capabilities',{headers:{Authorization:''}});if(capabilities.collaboration!==1)throw new Error('当前云服务器尚未开通协作接口，请联系维护人员升级服务');supportedUrl=state().url}
    return operation.apply(api,args)
  }]))
}
module.exports = { createCollaboration, parseCredential }
