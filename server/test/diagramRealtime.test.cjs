const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto'), Y = require('yjs')
const { createLocalCollaborationFixture } = require('./collaborationFixture.cjs')
const { createRealtime } = require('../realtime.cjs')
const seed = text => { const doc = new Y.Doc(); doc.getMap('test').set('text', text); const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'); doc.destroy(); return state }
const file = type => Buffer.from(JSON.stringify({ format: 'seal-diagram', schema: 1, type: type === 'mindmap' ? '脑图' : '流程图', title: '私密项目', graph: { 节点: [{ id: 'root', 文本: '私密中心', x: 10, y: 20 }], 连线: [] } })).toString('base64')

test('图形个人云与多个共享共用一间加密房间，越权与撤销被拒绝，云回收站恢复保留最新日志', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b, c } = f
  assert.equal((await a.realtimeCapabilities()).diagramRealtime, 1)
  for (const type of ['mindmap', 'flowchart']) {
    const saved = await a.save({ linkId: randomUUID(), name: '私密项目', filename: type === 'mindmap' ? '私密项目.sealmind' : '私密项目.sealflow', data: file(type) })
    await a.update(saved.id, { name: '项目 2.0' }); assert.match((await a.list()).find(item => item.id === saved.id).meta.filename, /^项目 2\.0\.(sealmind|sealflow)$/)
    const binding = await a.realtimeNodeBinding({ id: saved.id }); assert.equal(binding.kind, 'node')
    const first = await a.realtimeOpen({ binding, type, seed: seed('初始机密') }); assert.equal(first.type, type); assert.equal(first.editable, true)
    assert.equal((await f.request(`/v1/realtime/node/${saved.id}/updates?after=0&initial=1`, { client: b })).status, 404)
    const edit = await a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }), read = await a.shareCreate({ id: saved.id, recipientPhone: '13800111003', permission: 'read' })
    await b.shareAccept({ credential: edit.credential }); await c.shareAccept({ credential: read.credential })
    assert.match((await b.shareList()).items.find(item => item.id === edit.id).filename, /\.(sealmind|sealflow)$/)
    const eb = { kind: 'share', id: edit.id }, rb = { kind: 'share', id: read.id }
    assert.equal((await b.realtimeOpen({ binding: eb, type, seed: seed('不能覆盖初始内容') })).seed, first.seed)
    assert.equal((await c.realtimeOpen({ binding: rb, type, seed: first.seed })).editable, false)
    const update = seed('最新加密图形'), operationId = randomUUID()
    await b.realtimeQueue({ binding: eb, operationId, update, state: update }); await b.realtimePush({ binding: eb })
    const latest = await a.realtimePull({ binding, after: 0 }); assert.equal(latest.head, 1); assert.equal(latest.updates[0].update, update)
    const denied = await f.request(`/v1/realtime/share/${read.id}/updates`, { client: c, method: 'POST', data: { operationId: randomUUID(), cipher: Buffer.alloc(40).toString('base64') }, headers: { 'X-Seal-Access': read.credential.split(':')[2] } }); assert.equal(denied.status, 403)
    await a.shareRevoke({ id: edit.id }); await assert.rejects(b.realtimePull({ binding: eb, after: 0 }), error => error.status === 404)
    assert.equal((await a.realtimeSnapshot({ binding })).head, 1)
    const maintenance = createRealtime({ db: f.cloud.db, clock: f.now, authorize: () => {}, usage: () => 0, reservation: () => 0, quota: 1e9, ensureDisk: () => {} })
    await a.remove(saved.id, false); maintenance.cleanup(); assert.ok(f.cloud.db.one('SELECT id FROM realtime_rooms WHERE id=?', ['share:' + saved.id]))
    await assert.rejects(a.realtimeSnapshot({ binding }), error => error.status === 404)
    await a.restore(saved.id); assert.equal((await a.realtimeSnapshot({ binding })).updates[0].update, update)
    await a.remove(saved.id, false); await a.remove(saved.id, true); maintenance.cleanup(); assert.equal(f.cloud.db.one('SELECT id FROM realtime_rooms WHERE id=?', ['share:' + saved.id]), undefined)
  }
})

test('团队脑图和流程图继承真实成员角色，降权只读、移除和跨团队访问均由服务端重验', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b, c } = f, team = await a.teamCreate({ name: '图形团队' })
  const invite = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'editor' }); await b.teamAccept({ credential: invite.credential })
  for (const type of ['mindmap', 'flowchart']) {
    const saved = await a.teamSave({ id: team.id, name: '团队图形', filename: type === 'mindmap' ? '团队图形.sealmind' : '团队图形.sealflow', data: file(type) }), binding = { kind: 'team', id: team.id, nodeId: saved.id }
    await a.teamUpdateNode({ id: team.id, nodeId: saved.id, name: '流程 2.0' }); assert.match((await a.teamNodes({ id: team.id })).items.find(node => node.id === saved.id).meta.filename, /^流程 2\.0\.(sealmind|sealflow)$/)
    const source = await a.realtimeOpen({ binding, type, seed: seed('团队私密内容') }); assert.equal((await b.realtimeOpen({ binding, type, seed: source.seed })).editable, true)
    await assert.rejects(c.realtimeSnapshot({ binding }), error => error.status === 404)
    await a.teamUpdateMember({ id: team.id, userId: b.status().account.id, role: 'viewer' }); assert.equal((await b.realtimePull({ binding, after: 0 })).editable, false)
    const state = seed('撤权后不可提交'); await b.realtimeQueue({ binding, operationId: randomUUID(), update: state, state }); await assert.rejects(b.realtimePush({ binding }), error => error.status === 403)
    assert.equal((await b.realtimeRestore({ binding })).pending, 1)
    await a.teamUpdateMember({ id: team.id, userId: b.status().account.id, role: 'editor' }); await b.realtimePush({ binding }); assert.equal((await a.realtimePull({ binding, after: 0 })).head, 1)
  }
  await a.teamRemoveMember({ id: team.id, userId: b.status().account.id })
  const node = (await a.teamNodes({ id: team.id })).items[0]
  await assert.rejects(b.realtimeSnapshot({ binding: { kind: 'team', id: team.id, nodeId: node.id } }), error => error.status === 404)
})

test('云图形目录、初始只读源与恢复输入加密落盘，重启恢复且不同账号隔离', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b } = f, accountId = a.status().account.id, id = randomUUID(), binding = { kind: 'node', id, accountId, name: '私密项目.sealmind', version: 1, editable: true }
  const model = JSON.parse(Buffer.from(file('mindmap'), 'base64').toString()), entry = { type: 'mindmap', title: '私密项目', name: '私密项目.sealmind', binding }
  a.realtimeCatalog({ scope: 'mindmap', items: [entry] }); a.realtimeSource({ binding, model }); a.realtimeRecovery({ binding, model, reason: '节点被其他成员删除后保留的中文输入' })
  const reopened = f.reopen(a)
  assert.equal(reopened.realtimeCatalog({ scope: 'mindmap' }).items[0].title, '私密项目')
  assert.deepEqual(reopened.realtimeRestore({ binding }).sourceModel, model)
  assert.deepEqual(reopened.realtimeRecovery({ binding }).model, model)
  assert.equal(b.realtimeRestore({ binding }), null); assert.deepEqual(b.realtimeCatalog({ scope: 'mindmap' }).items, [])
  assert.throws(() => b.realtimeCatalog({ scope: 'mindmap', items: [entry] }), /身份/)
  assert.throws(() => a.realtimeCatalog({ scope: '__proto__', items: [] }), /类型/)
  for (const name of fs.readdirSync(path.join(f.locations.get(a), 'cloud-realtime'))) { const raw = fs.readFileSync(path.join(f.locations.get(a), 'cloud-realtime', name)); assert.equal(raw.includes(Buffer.from('私密项目')), false); assert.equal(raw.includes(Buffer.from('中文输入')), false) }
  reopened.realtimeRecovery({ binding, clear: true }); assert.equal(reopened.realtimeRecovery({ binding }), null)
  assert.deepEqual(reopened.realtimeRestore({ binding }).sourceModel, model)
})
