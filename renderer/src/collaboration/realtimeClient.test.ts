import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import fs from 'node:fs'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createRealtimeClient, type RealtimeClient } from './realtimeClient'
import { applyModelChanges, createModelDocument, readModel, Y } from './crdtModel'

const require = createRequire(import.meta.url), Module = require('node:module'), load = Module._load
let fixtureFactory: any
try { Module._load = function (id: string, ...args: any[]) { const result = load.call(this, id, ...args); return id === 'node:worker_threads' ? { ...result, isMainThread: true } : result }; fixtureFactory = require('../../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture } finally { Module._load = load }
let fixture: any, clients: RealtimeClient<any>[] = [], originalCrypto: PropertyDescriptor | undefined
beforeEach(async () => { originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); fixture = await fixtureFactory(); fixture.cloud.server.prependListener('request', (_request: unknown, response: any) => response.setHeader('Connection', 'close')) }, 60000)
afterEach(async () => { await Promise.all(clients.map(client => client.close())); clients = []; await fixture?.cleanup(); if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto) })
async function room(type: 'word' | 'table' | 'ppt', model: any) {
  const team = await fixture.a.teamCreate({ name: '真实实时测试' })
  for (const [client, phone] of [[fixture.b, '13800111002'], [fixture.c, '13800111003']]) { const invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: phone, role: 'editor' }); await client.teamAccept({ credential: invite.credential }) }
  const saved = await fixture.a.teamSave({ id: team.id, name: '协作.' + ({ word: 'docx', table: 'xlsx', ppt: 'pptx' }[type]), data: Buffer.from('existing saved file').toString('base64') })
  const binding = { kind: 'team' as const, id: team.id, nodeId: saved.id }
  const wire = async (service: any, options: any = {}) => {
    const client = createRealtimeClient<any>({ binding, type, model, call: (action, input) => Promise.resolve().then(() => service[action](input)), onModel: () => {}, pollInterval: 60000, ...options })
    clients.push(client); await client.ready; return client
  }
  return { binding, wire, team }
}
async function settle(...items: RealtimeClient<any>[]) { for (let round = 0; round < 3; round++) await Promise.all(items.map(client => client.sync())) }

it('真实三账号同段中文和Unicode并发合并，撤销只撤本地文字，导出源模型一致', async () => {
  const model = { html: '<p>共同编辑😀𠀀👩🏽‍💻é</p>', page: { margin: 20 } }, space = await room('word', model)
  const a = await space.wire(fixture.a), b = await space.wire(fixture.b), c = await space.wire(fixture.c)
  await Promise.all([a.publish({ ...model, html: model.html.replace('共同', '共同甲') }), b.publish({ ...model, html: model.html.replace('编辑', '乙编辑') }), c.publish({ ...model, html: model.html.replace('😀', '丙😀') })])
  await settle(a, b, c)
  expect(a.current).toEqual(b.current); expect(b.current).toEqual(c.current)
  expect(a.current.html).toMatch(/甲/); expect(a.current.html).toMatch(/乙/); expect(a.current.html).toMatch(/丙😀𠀀👩🏽‍💻é/); expect(a.current.html).not.toContain('�')
  expect(a.undo()).toBe(true); await settle(a, b, c)
  expect(a.current.html).not.toContain('甲'); expect(a.current.html).toContain('乙'); expect(a.current.html).toContain('丙')
  expect(a.redo()).toBe(true); await settle(a, b, c); expect(a.current).toEqual(c.current); expect(c.current.html).toContain('甲')
  const rows = fixture.cloud.db.query('SELECT cipher FROM realtime_updates')
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((row: any) => !row.cipher.includes('共同') && !row.cipher.includes('<p>'))).toBe(true)
  const files = fs.readdirSync(fixture.locations.get(fixture.a) + '/cloud-realtime')
  const disk = fs.readFileSync(fixture.locations.get(fixture.a) + '/cloud-realtime/' + files[0])
  expect(disk.includes(Buffer.from('共同'))).toBe(false)
}, 60000)

it('不同工作表单元格和不同演示对象字段同时编辑，不丢另一客户端更新', async () => {
  const model = [{ id: 'sheet1', name: '表1', 单元格: { A1: { 原始值: '1', 格式: {} }, B1: { 原始值: '2', 格式: {} } }, 合并区域: [] }], space = await room('table', model)
  const a = await space.wire(fixture.a), b = await space.wire(fixture.b)
  await Promise.all([a.publish([{ ...model[0], 单元格: { ...model[0].单元格, A1: { 原始值: '=SUM(B1,3)', 格式: { 加粗: true } } } }]), b.publish([{ ...model[0], 单元格: { ...model[0].单元格, B1: { 原始值: '41', 格式: {} } } }])])
  await settle(a, b)
  expect(a.current).toEqual(b.current); expect(a.current[0].单元格.A1.原始值).toBe('=SUM(B1,3)'); expect(a.current[0].单元格.B1.原始值).toBe('41')
  const deck = { 幻灯片列表: [{ id: 'slide1', 文本框列表: [{ id: 'box1', 文字: '标题', x: 10 }, { id: 'box2', 文字: '正文', x: 20 }] }] }, ppt = await room('ppt', deck)
  const pa = await ppt.wire(fixture.a), pb = await ppt.wire(fixture.b)
  await Promise.all([pa.publish({ 幻灯片列表: [{ ...deck.幻灯片列表[0], 文本框列表: [{ ...deck.幻灯片列表[0].文本框列表[0], x: 60 }, deck.幻灯片列表[0].文本框列表[1]] }] }), pb.publish({ 幻灯片列表: [{ ...deck.幻灯片列表[0], 文本框列表: [deck.幻灯片列表[0].文本框列表[0], { ...deck.幻灯片列表[0].文本框列表[1], 文字: '协作正文' }] }] })])
  await settle(pa, pb); expect(pa.current).toEqual(pb.current); expect(pa.current.幻灯片列表[0].文本框列表[0].x).toBe(60); expect(pa.current.幻灯片列表[0].文本框列表[1].文字).toBe('协作正文')
}, 60000)

it('离线安全落盘后重启客户端，恢复未发送操作并与在线修改合并且不重复', async () => {
  const model = { html: '<p>起点终点</p>' }, space = await room('word', model)
  const a = await space.wire(fixture.a); let offline = false
  const b = await space.wire(fixture.b, { call: (action: string, input: any) => offline && !['realtimeRestore', 'realtimeQueue', 'realtimeState'].includes(action) ? Promise.reject(new Error('模拟真实断网')) : Promise.resolve().then(() => fixture.b[action](input)) })
  offline = true; await b.publish({ html: '<p>起点离线终点</p>' }); await expect(b.sync()).rejects.toThrow('模拟真实断网'); await b.close()
  await a.publish({ html: '<p>起点在线终点</p>' }); await a.flush()
  const restarted = fixture.reopen(fixture.b), recovered = await space.wire(restarted)
  await settle(a, recovered)
  expect(a.current).toEqual(recovered.current); expect(a.current.html).toContain('离线'); expect(a.current.html).toContain('在线'); expect(a.current.html.match(/离线/g)).toHaveLength(1)
}, 60000)

it('降级或撤权后服务端拒绝新写入及重连，保留本机状态与未发送操作', async () => {
  const model = { html: '<p>原文</p>' }, space = await room('word', model), a = await space.wire(fixture.a), b = await space.wire(fixture.b)
  await b.publish({ html: '<p>原文待发</p>' })
  await fixture.a.teamUpdateMember({ id: space.team.id, userId: fixture.b.status().account.id, role: 'viewer' })
  await expect(fixture.b.realtimePush({ binding: space.binding })).rejects.toMatchObject({ status: 403 })
  await b.sync(); expect(b.status.readOnly).toBe(true); expect(b.current.html).toContain('待发')
  await fixture.a.teamRemoveMember({ id: space.team.id, userId: fixture.b.status().account.id })
  await expect(b.sync()).rejects.toMatchObject({ status: 404 }); expect(b.status.status).toBe('revoked')
  expect(fixture.b.realtimeRestore({ binding: space.binding }).pending).toBeGreaterThan(0); expect(a.current.html).not.toContain('待发')
}, 60000)

it('CRDT乱序重放幂等，未提交草稿只删除已见字符，保留期间插入的远端内容', () => {
  const original = createModelDocument({ html: '<p>abcd😀</p>' }), state = Y.encodeStateAsUpdate(original), a = createModelDocument(), b = createModelDocument(), base = createModelDocument()
  for (const doc of [a, b, base]) Y.applyUpdate(doc, state)
  applyModelChanges(b, { html: '<p>abcd😀</p>' }, { html: '<p>ab远端cd😀</p>' }, base)
  const updateB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(original)); Y.applyUpdate(a, updateB)
  applyModelChanges(a, { html: '<p>abcd😀</p>' }, { html: '<p>a本地d😀</p>' }, base)
  const updateA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(original)); Y.applyUpdate(b, updateA); Y.applyUpdate(b, updateA)
  expect(readModel(a)).toEqual(readModel(b)); expect(readModel<any>(a).html).toContain('远端'); expect(readModel<any>(a).html).toContain('本地'); expect(readModel<any>(a).html).not.toContain('�')
  for (const doc of [original, a, b, base]) doc.destroy()
})

it('首次连接从未成功时输入仍加密落盘，关闭重开后与原基线上的在线更新合并', async () => {
  const model = { html: '<p>首次连接基线</p>' }, space = await room('word', model), a = await space.wire(fixture.a)
  const first = createRealtimeClient<any>({ binding: space.binding, type: 'word', model, onModel: () => {}, pollInterval: 60000,
    call: (action, input) => ['realtimeRestore', 'realtimeStage'].includes(action) ? Promise.resolve().then(() => fixture.b[action](input)) : Promise.reject(new Error('首次连接断网')) })
  clients.push(first); await first.ready
  await first.publish({ html: '<p>首次离线😀连接基线</p>' }, model)
  const staged = fixture.b.realtimeRestore({ binding: space.binding }); expect(staged.state).toBeUndefined(); expect(staged.draft.next.html).toContain('离线😀')
  await first.close()
  await a.publish({ html: '<p>首次连接在线基线</p>' }); await a.flush()
  const restarted = await space.wire(fixture.reopen(fixture.b)); await settle(a, restarted)
  expect(restarted.current).toEqual(a.current); expect(a.current.html).toContain('离线😀'); expect(a.current.html).toContain('在线')
  expect(fixture.reopen(fixture.b).realtimeRestore({ binding: space.binding }).draft).toBeNull()
}, 60000)

it('同段加粗、斜体及插入修订并发不会交错标签，保留两种格式和修订标识', async () => {
  const model = { html: '<p>共同正文</p>', source: '<span hidden data-seal-docx-package="unchanged-package"></span>' }, space = await room('word', model)
  const a = await space.wire(fixture.a), b = await space.wire(fixture.b), c = await space.wire(fixture.c)
  await Promise.all([a.publish({ ...model, html: '<p><strong>共同正文</strong></p>' }), b.publish({ ...model, html: '<p><em>共同正文</em></p>' }), c.publish({ ...model, html: '<p>共同<ins data-seal-revision-id="revision-c" data-seal-revision-author="协作者">新增</ins>正文</p>' })])
  await settle(a, b, c); expect(a.current).toEqual(b.current); expect(a.current).toEqual(c.current)
  const parsed = new DOMParser().parseFromString(a.current.html, 'text/html')
  expect(parsed.body.textContent).toBe('共同新增正文'); expect(parsed.querySelector('strong')?.textContent).toContain('共同'); expect(parsed.querySelector('em')?.textContent).toContain('共同'); expect(parsed.querySelector('[data-seal-revision-id="revision-c"]')?.textContent).toBe('新增'); expect(a.current.source).toBe(model.source)
  expect(new DOMParser().parseFromString(`<root>${a.current.html}</root>`, 'application/xml').querySelector('parsererror')).toBeNull()
}, 60000)

it('跨段删除保留另一账号同时在被删除段落插入的内容，不恢复被删除原文', async () => {
  const model = { html: '<p>第一段</p><p>第二段</p>' }, space = await room('word', model), a = await space.wire(fixture.a), b = await space.wire(fixture.b)
  await Promise.all([a.publish({ html: '<p>第段</p>' }), b.publish({ html: '<p>第一段</p><p>第二远端新增段</p>' })])
  await settle(a, b); expect(a.current).toEqual(b.current)
  const parsed = new DOMParser().parseFromString(a.current.html, 'text/html'); expect(parsed.body.textContent).toContain('远端新增'); expect(parsed.body.textContent).not.toContain('第二段')
  expect(new DOMParser().parseFromString(`<root>${a.current.html}</root>`, 'application/xml').querySelector('parsererror')).toBeNull()
}, 60000)

it('不同共享凭证指向同一文件时共同编辑同一密文房间，只读接收者可见在线成员且不能写入', async () => {
  const model = { html: '<p>共享正文</p>' }, file = await fixture.a.save({ linkId: 'shared-rt', name: '共享.docx', data: Buffer.from('saved').toString('base64') })
  const editable = await fixture.a.shareCreate({ id: file.id, recipientPhone: '13800111002', permission: 'edit' }), readonly = await fixture.a.shareCreate({ id: file.id, recipientPhone: '13800111003', permission: 'read' })
  await fixture.b.shareAccept({ credential: editable.credential }); await fixture.c.shareAccept({ credential: readonly.credential })
  const wire = async (service: any, id: string) => { const client = createRealtimeClient<any>({ binding: { kind: 'share', id }, type: 'word', model, call: (action, input) => Promise.resolve().then(() => service[action](input)), onModel: () => {}, pollInterval: 60000 }); clients.push(client); await client.ready; return client }
  const a = await wire(fixture.a, editable.id), b = await wire(fixture.b, editable.id), c = await wire(fixture.c, readonly.id)
  await b.publish({ html: '<p>共享正文并发</p>' }); await settle(a, b, c)
  expect(c.current).toEqual(a.current); expect(c.current.html).toContain('并发'); expect(c.status.readOnly).toBe(true); expect(a.status.peers).toHaveLength(2)
  await expect(c.publish({ html: '<p>禁止写入</p>' })).rejects.toThrow('权限')
  expect(fixture.cloud.db.query('SELECT id FROM realtime_rooms')).toHaveLength(1)
  await fixture.a.shareRevoke({ id: editable.id }); await expect(b.sync()).rejects.toMatchObject({ status: 404 }); await c.sync(); expect(c.status.connected).toBe(true)
}, 60000)

it('有界日志checkpoint后离线客户端仍合并待发修改，重试operation保持幂等且拒绝伪造同ID', async () => {
  const model = { html: '<p>原文</p>' }, space = await room('word', model), a = await space.wire(fixture.a); let offline = false
  const b = await space.wire(fixture.b, { call: (action: string, input: any) => offline && !['realtimeQueue', 'realtimeState', 'realtimeRestore'].includes(action) ? Promise.reject(new Error('离线检查点测试')) : Promise.resolve().then(() => fixture.b[action](input)) })
  offline = true
  await b.publish({ html: '<p>离线原文</p>' })
  for (let index = 0; index < 130; index++) await a.publish({ html: `<p>原文${index}</p>` })
  await a.flush()
  const receipt = fixture.cloud.db.one('SELECT * FROM realtime_updates ORDER BY seq DESC LIMIT 1')
  await a.sync()
  expect(fixture.cloud.db.one('SELECT checkpoint_seq FROM realtime_rooms').checkpoint_seq).toBeGreaterThanOrEqual(128)
  expect(fixture.cloud.db.query('SELECT * FROM realtime_updates')).toHaveLength(0)
  const duplicate = await fixture.request(`/v1/realtime/team/${space.binding.id}/${space.binding.nodeId}/updates`, { client: fixture.a, method: 'POST', data: { operationId: receipt.operation_id, cipher: receipt.cipher } })
  expect(duplicate.status).toBe(200); expect(duplicate.body.duplicate).toBe(true)
  const wrong = await fixture.request(`/v1/realtime/team/${space.binding.id}/${space.binding.nodeId}/updates`, { client: fixture.a, method: 'POST', data: { operationId: receipt.operation_id, cipher: Buffer.alloc(40, 5).toString('base64') } })
  expect(wrong.status).toBe(409)
  offline = false; await settle(a, b); expect(a.current).toEqual(b.current); expect(a.current.html).toContain('离线'); expect(a.current.html).toContain('129')
}, 60000)

it('长轮询中设备会话被撤销后立即停止读取，配额拒绝保留安全队列', async () => {
  const model = { html: '<p>会话测试</p>' }, space = await room('word', model), a = await space.wire(fixture.a)
  await space.wire(fixture.b)
  const waiting = fixture.b.realtimePull({ binding: space.binding, after: fixture.cloud.db.one('SELECT head FROM realtime_rooms').head, wait: true })
  const rejected = expect(waiting).rejects.toMatchObject({ status: 401 })
  await new Promise(resolve => setTimeout(resolve, 100))
  const device = (await fixture.b.deviceList()).items.find((item: any) => item.current)
  expect((await fixture.request('/v1/devices/' + device.id, { client: fixture.b, method: 'DELETE' })).status).toBe(200)
  await rejected; expect(fixture.b.status().account).toBeNull(); expect(a.status.connected).toBe(true)
  await Promise.all(clients.map(client => client.close())); clients = []; await fixture.cleanup(); fixture = await fixtureFactory(undefined, { quota: 20000 })
  const small = await room('word', model), limited = await small.wire(fixture.a)
  await limited.publish({ html: '<p>' + '超'.repeat(30000) + '</p>' })
  await expect(limited.sync()).rejects.toMatchObject({ status: 413 }); expect(fixture.a.realtimeRestore({ binding: small.binding }).pending).toBeGreaterThan(0); expect(limited.current.html.length).toBeGreaterThan(30000)
}, 60000)

it('压缩检查点仅含已确认的服务端操作，不会借checkpoint上传尚未允许发送的本机队列', async () => {
  const model = { html: '<p>公开基线</p>' }, space = await room('word', model), a = await space.wire(fixture.a); let hold = false
  const b = await space.wire(fixture.b, { call: (action: string, input: any) => hold && action === 'realtimePush' ? Promise.reject(new Error('暂不提交本机队列')) : Promise.resolve().then(() => fixture.b[action](input)) })
  hold = true; await b.publish({ html: '<p>私有待发公开基线</p>' })
  for (let index = 0; index < 130; index++) await a.publish({ html: `<p>公开基线${index}</p>` })
  await a.flush(); await expect(b.sync()).rejects.toThrow('暂不提交')
  const snapshot = await fixture.c.realtimeSnapshot({ binding: space.binding }), doc = createModelDocument()
  Y.applyUpdate(doc, Buffer.from(snapshot.seed, 'base64')); Y.applyUpdate(doc, Buffer.from(snapshot.checkpoint, 'base64'))
  expect(readModel<any>(doc).html).toContain('129'); expect(readModel<any>(doc).html).not.toContain('私有待发'); doc.destroy()
  expect(fixture.b.realtimeRestore({ binding: space.binding }).pending).toBeGreaterThan(0)
  hold = false; await settle(a, b); expect(a.current.html).toContain('私有待发'); expect(a.current).toEqual(b.current)
}, 60000)

it('原生来源包作为独立原子版本顺序更新，并发替换明确冲突而不交错base64或静默覆盖', async () => {
  const source = (id: string) => `<span hidden="" contenteditable="false" data-seal-docx-package="${id}"></span>`, model = { html: '<p>正文</p>', source: source('base') }, space = await room('word', model), a = await space.wire(fixture.a), b = await space.wire(fixture.b)
  await a.publish({ ...model, source: source('sequential') }); await settle(a, b); expect(b.current.source).toBe(source('sequential'))
  const before = a.current
  await Promise.all([a.publish({ ...before, source: source('native-a') }), b.publish({ ...before, source: source('native-b') })])
  const results = await Promise.allSettled([a.sync(), b.sync()]); expect(results.some(result => result.status === 'rejected')).toBe(true)
  expect(a.status.readOnly || b.status.readOnly).toBe(true); expect(a.status.error || b.status.error).toContain('来源包')
  expect(a.current.source).toBe(source('native-a')); expect(b.current.source).toBe(source('native-b'))
}, 60000)
