const fs = require('fs'), path = require('path')
const { createHash } = require('crypto')
const { seal, unseal } = require('./crypto')
const MAX_STATE = 24 * 1024 * 1024, MAX_UPDATE = 8 * 1024 * 1024
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
function decode(value, max) { if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4) throw new Error('协作数据超出限制'); const raw = Buffer.from(value, 'base64'); if (raw.toString('base64') !== value || raw.length > max) throw new Error('协作数据无效'); return raw }
function createRealtime({ directory, request, root, getState, requireSpace, resolve, persist, mergeUpdates, list }) {
  // Web injects the renderer's existing Yjs instance. Node loads it lazily;
  // a second bundled copy would break shared-type identity checks in WebView.
  const merge = mergeUpdates || module.require('yjs').mergeUpdates
  const mergeState = (previous, incoming) => { const raw = decode(incoming, MAX_STATE), merged = previous ? Buffer.from(merge([Buffer.from(previous, 'base64'), raw])) : raw; if (merged.length > MAX_STATE) throw new Error('协作安全快照已达24 MiB上限，请先另存本机副本'); return merged.toString('base64') }
  const folder = path.join(directory, 'cloud-realtime'); fs.mkdirSync(folder, { recursive: true })
  const inflight = new Map()
  const identity = input => {
    requireSpace(); const b = input.binding || input
    if (!['share', 'team', 'node'].includes(b.kind) || !uuid(b.id) || b.kind === 'team' && !uuid(b.nodeId)) throw new Error('实时协作来源标识无效')
    const account = getState().account.id, name = createHash('sha256').update(`${account}:${b.kind}:${b.id}:${b.nodeId || ''}`).digest('hex')
    return { account, binding: { kind: b.kind, id: b.id, ...(b.kind === 'team' ? { nodeId: b.nodeId } : {}) }, filename: path.join(folder, name + '.bin'), context: `seal-realtime-cache:${account}:${name}` }
  }
  const read = meta => fs.existsSync(meta.filename) ? JSON.parse(unseal(root(), fs.readFileSync(meta.filename), meta.context).toString()) : null
  const write = (meta, value) => {
    if (getState().account?.id !== meta.account) throw new Error('云账号已变化，本机协作记录已隔离保留')
    const temporary = meta.filename + '.tmp', fd = fs.openSync(temporary, 'w', 0o600)
    try { fs.writeFileSync(fd, seal(root(), Buffer.from(JSON.stringify(value)), meta.context)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(temporary, meta.filename)
  }
  const record = meta => { const value = read(meta); if (!value?.roomId || !value.key) throw new Error('请先连接并初始化此协作文档'); return value }
  const route = meta => `/v1/realtime/${meta.binding.kind}/${meta.binding.id}${meta.binding.kind === 'team' ? '/' + meta.binding.nodeId : ''}`
  const headers = value => value.access ? { 'X-Seal-Access': value.access } : {}
  const crypt = (value, raw, context) => seal(Buffer.from(value.key, 'base64'), raw, context).toString('base64')
  const plain = (value, raw, context) => unseal(Buffer.from(value.key, 'base64'), Buffer.from(raw, 'base64'), context).toString('base64')
  const response = (value, result) => ({ ...result,
    seed: result.seed ? plain(value, result.seed, `seal-rt-seed:${value.roomId}`) : null,
    checkpoint: result.checkpoint ? plain(value, result.checkpoint, `seal-rt-checkpoint:${value.roomId}:${result.checkpointSeq}`) : null,
    updates: (result.updates || []).map(item => ({ seq: item.seq, operationId: item.operationId, update: plain(value, item.cipher, `seal-rt-update:${value.roomId}:${item.operationId}`) })),
    peers: (result.peers || []).flatMap(item => { try { const peer = JSON.parse(Buffer.from(plain(value, item.cipher, `seal-rt-presence:${value.roomId}:${item.clientId}`), 'base64').toString()); return [{ ...peer, clientId: item.clientId, updated: item.updated }] } catch { return [] } })
  })
  async function capability(type) { const c = await request('/v1/capabilities', { headers: { Authorization: '' } }); if (c.realtime !== 1 || ['mindmap', 'flowchart'].includes(type) && c.diagramRealtime !== 1) throw Object.assign(new Error('当前云服务器尚未支持此类实时共同编辑；本机内容已保留，请维护人员升级服务'), { status: 501 }) }
  return {
    async realtimeCapabilities() { const caps = await request('/v1/capabilities', { headers: { Authorization: '' } }); return { realtime: caps.realtime || 0, diagramRealtime: caps.diagramRealtime || 0 } },
    realtimeSource(input) { const meta = identity(input), value = read(meta) || { pending: [], after: 0 }; if (!['脑图', '流程图'].includes(input.model?.type) || JSON.stringify(input.model).length > 2 * 1024 * 1024) throw new Error('图形源缓存无效或过大'); value.sourceModel = input.model; write(meta, value); return { ok: true } },
    realtimeRecovery(input) { const meta = identity(input), value = read(meta) || { pending: [], after: 0 }; if (input.model !== undefined) { if (!['脑图', '流程图'].includes(input.model?.type) || JSON.stringify(input.model).length > 2 * 1024 * 1024) throw new Error('图形恢复草稿无效或过大'); value.recovery = { model: input.model, reason: String(input.reason || '未合并的本机输入').slice(0, 500), at: Date.now() }; write(meta, value) }; if (input.clear === true) { delete value.recovery; write(meta, value) }; return value.recovery || null },
    realtimeCatalog(input = {}) {
      requireSpace()
      if (!['mindmap', 'flowchart'].includes(input.scope)) throw new Error('图形目录类型无效')
      const account = getState().account.id, name = createHash('sha256').update(account).digest('hex')
      const meta = { account, filename: path.join(folder, 'catalog-' + name + '.bin'), context: 'seal-diagram-catalog:' + account }
      const value = read(meta) || { scopes: {} }
      if (input.items !== undefined) {
        if (!Array.isArray(input.items) || input.items.length > 1000 || JSON.stringify(input.items).length > 1024 * 1024) throw new Error('图形目录超过本机缓存限制')
        const items = input.items.map(item => {
          identity(item.binding)
          if (item.binding.accountId !== account || item.type !== input.scope || typeof item.title !== 'string' || item.title.length > 160 || typeof item.name !== 'string' || item.name.length > 300) throw new Error('图形目录身份无效')
          return { type: item.type, title: item.title, name: item.name, binding: { ...item.binding }, ...(typeof item.teamName === 'string' ? { teamName: item.teamName.slice(0, 120) } : {}) }
        })
        value.scopes[input.scope] = items; write(meta, value)
      }
      return { items: value.scopes[input.scope] || [] }
    },
    async realtimeNodeBinding({ id }) {
      requireSpace(); if (!uuid(id)) throw new Error('云文件标识无效')
      const capabilities = await request('/v1/capabilities', { headers: { Authorization: '' } }); if (capabilities.collaboration !== 1) return null
      const share = (await request('/v1/shares')).items.find(item => item.nodeId === id && item.direction === 'sent')
      // Explicit owner binding works before the first invitation and survives its revocation.
      if (capabilities.diagramRealtime === 1 && list) { const node = (await list()).find(item => item.id === id && !item.deleted); if (node?.version && /\.(sealmind|sealflow)$/i.test(node.meta?.filename || node.meta?.name || '')) return { kind: 'node', id, version: node.version, editable: true, accountId: getState().account.id } }
      return share ? { kind: 'share', id: share.id, version: share.version, editable: true, accountId: getState().account.id } : null
    },
    async realtimeSnapshot(input) {
      const meta = identity(input); await capability(); const secret = await resolve(meta.binding)
      const value = { ...read(meta), roomId: secret.roomId, key: secret.key.toString('base64'), access: secret.access, pending: read(meta)?.pending || [], after: read(meta)?.after || 0 }
      const result = await request(route(meta) + '/updates?after=0&initial=1', { headers: headers(value) })
      if (result.initialized) write(meta, { ...value, ...read(meta), roomId: value.roomId, key: value.key, access: value.access, type: result.type })
      return response(value, result)
    },
    realtimeStage(input) {
      const meta = identity(input), value = read(meta) || { type: input.type, pending: [], after: 0 }, serialized = JSON.stringify({ base: input.base, next: input.next })
      if (!['word', 'table', 'ppt', 'mindmap', 'flowchart'].includes(input.type) || serialized.length > MAX_STATE) throw new Error('首次连接草稿过大或类型无效，请先另存本机文件')
      value.draft = { base: value.draft?.base ?? input.base, next: input.next, version: (value.draft?.version || 0) + 1 }
      write(meta, value); return { version: value.draft.version }
    },
    realtimeBindFile({ path: filename, binding }) { requireSpace(); if (typeof filename !== 'string' || !filename || filename.length > 4096 || !binding || binding.accountId !== getState().account.id) throw new Error('协作本机文件身份无效'); identity(binding); getState().realtimeBindings ||= {}; getState().realtimeBindings[filename] = { ...binding }; persist(); return { ok: true } },
    async realtimeFileBinding({ path: filename }) { requireSpace(); const binding = getState().realtimeBindings?.[filename]; if (binding?.accountId === getState().account.id) return binding; const linked = getState().links?.[filename]; if (!linked?.id) return null; const result = await this.realtimeNodeBinding({ id: linked.id }); if (result) { getState().realtimeBindings ||= {}; getState().realtimeBindings[filename] = { ...result, name: linked.meta?.filename || linked.meta?.name || '实时文档' }; persist() } return result ? getState().realtimeBindings[filename] : null },
    realtimeRestore(input) { const meta = identity(input), value = read(meta); return value ? { state: value.state, after: value.after || 0, pending: value.pending?.length || 0, type: value.type, draft: value.draft || null, sourceModel: value.sourceModel || null } : null },
    async realtimeOpen(input) {
      const meta = identity(input); await capability(input.type); const secret = await resolve(meta.binding), existing = read(meta)
      if (existing?.roomId && existing.roomId !== secret.roomId) throw new Error('协作文件身份已变化；原本机修改保留在安全记录中')
      let value = { ...existing, roomId: secret.roomId, key: secret.key.toString('base64'), access: secret.access, pending: existing?.pending || [], after: existing?.after || 0, type: input.type, editable: secret.editable }
      const seed = crypt(value, decode(input.seed, MAX_STATE), `seal-rt-seed:${value.roomId}`)
      const result = await request(route(meta) + '/open', { method: 'POST', headers: headers(value), data: { type: input.type, seed, after: 0 } })
      value = { ...value, ...read(meta), roomId: secret.roomId, key: secret.key.toString('base64'), access: secret.access }; write(meta, value)
      return { ...response(value, result), cached: { state: value.state || null, after: value.after, pending: value.pending.length } }
    },
    realtimeQueue(input) {
      const meta = identity(input), value = record(meta)
      if (!uuid(input.operationId)) throw new Error('协作操作标识无效')
      const raw = decode(input.update, MAX_UPDATE), state = decode(input.state, MAX_STATE)
      if (!value.pending.some(item => item.operationId === input.operationId)) {
        if (value.pending.length >= 2048 || value.pending.reduce((sum, item) => sum + item.cipher.length, 0) + raw.length > 32 * 1024 * 1024) throw new Error('离线协作队列已达上限，请先连接同步；当前文档仍保留在本机')
        value.pending.push({ operationId: input.operationId, cipher: crypt(value, raw, `seal-rt-update:${value.roomId}:${input.operationId}`) })
      }
      value.state = mergeState(value.state, state.toString('base64')); if (input.stageVersion && value.draft?.version <= input.stageVersion) delete value.draft; write(meta, value); return { pending: value.pending.length }
    },
    realtimeState(input) {
      const meta = identity(input), value = record(meta); value.state = mergeState(value.state, input.state)
      if (input.after !== undefined) { if (!Number.isSafeInteger(input.after) || input.after < 0) throw new Error('协作序列无效'); value.after = Math.max(value.after || 0, input.after) }
      if (input.stageVersion && value.draft?.version <= input.stageVersion) delete value.draft
      write(meta, value); return { pending: value.pending.length, after: value.after }
    },
    async realtimePush(input) {
      const meta = identity(input)
      if (inflight.has(meta.filename)) return inflight.get(meta.filename)
      const operation = (async () => {
        while (true) {
          const value = record(meta), next = value.pending[0]
          if (!next) return { pending: 0 }
          await request(route(meta) + '/updates', { method: 'POST', headers: headers(value), data: next })
          const latest = record(meta); latest.pending = latest.pending.filter(item => item.operationId !== next.operationId); write(meta, latest)
        }
      })()
      inflight.set(meta.filename, operation)
      try { return await operation } finally { if (inflight.get(meta.filename) === operation) inflight.delete(meta.filename) }
    },
    async realtimePull(input) { const meta = identity(input), value = record(meta), after = input.after ?? 0; if (!Number.isSafeInteger(after) || after < 0) throw new Error('协作序列无效'); return response(value, await request(route(meta) + `/updates?after=${after}&wait=${input.wait ? 10000 : 0}`, { headers: headers(value), timeout: 15000 })) },
    async realtimeCheckpoint(input) { const meta = identity(input), value = record(meta), raw = decode(input.state, MAX_STATE); if (!Number.isSafeInteger(input.after) || input.after < 0) throw new Error('协作序列无效'); return request(route(meta) + '/checkpoint', { method: 'PUT', headers: headers(value), data: { after: input.after, cipher: crypt(value, raw, `seal-rt-checkpoint:${value.roomId}:${input.after}`) } }) },
    async realtimePresence(input) {
      const meta = identity(input), value = record(meta); if (!uuid(input.clientId)) throw new Error('客户端身份无效')
      const presence = { name: getState().account.phone, color: input.color, cursor: input.cursor || null }, raw = Buffer.from(JSON.stringify(presence))
      if (raw.length > 3000) throw new Error('在线状态信息过大')
      return request(route(meta) + '/presence', { method: 'PUT', headers: headers(value), data: { clientId: input.clientId, cipher: crypt(value, raw, `seal-rt-presence:${value.roomId}:${input.clientId}`) } })
    },
    async realtimeLeave(input) { const meta = identity(input), value = record(meta); return request(route(meta) + '/presence', { method: 'DELETE', headers: headers(value), data: { clientId: input.clientId } }) }
  }
}
module.exports = { createRealtime }
