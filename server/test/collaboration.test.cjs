const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto')
const { createLocalCollaborationFixture } = require('./collaborationFixture.cjs')
const data = text => Buffer.from(text).toString('base64')
const text = file => Buffer.from(file.data, 'base64').toString()

test('账号绑定共享：真实解密、只读/编辑、版本冲突、撤销、到期和密钥不入服务端', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b, c } = f
  const saved = await a.save({ linkId: 'secret', name: '保密客户.txt', data: data('原始机密内容') })
  const read = await a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'read', expiresAt: f.now() + 60000 })
  assert.ok(read.credential.startsWith('seal-share-v1:')); assert.equal((await b.shareList()).items[0].accepted, false)
  await assert.rejects(c.shareAccept({ credential: read.credential }), /账号不匹配/)
  const wrong=read.credential.split(':');wrong[3]=(wrong[3][0]==='A'?'B':'A')+wrong[3].slice(1)
  await assert.rejects(b.shareAccept({ credential: wrong.join(':') }))
  await b.shareAccept({ credential: read.credential }); assert.equal(text(await b.shareDownload({ id: read.id })), '原始机密内容')
  assert.equal(text(await f.reopen(b).shareDownload({ id: read.id })), '原始机密内容')
  await assert.rejects(b.shareSave({ id: read.id, expectedVersion: 1, data: data('不能写') }), /仅允许读取/)
  const rawRead = await f.request(`/v1/shares/${read.id}/content`, { client: b, method: 'PUT', headers: { 'X-Seal-Access': read.credential.split(':')[2], 'X-Seal-Expected': '1' }, data: Buffer.alloc(40) }); assert.equal(rawRead.status, 403)
  const edit = await a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }); await b.shareAccept({ credential: edit.credential })
  await b.shareSave({ id: edit.id, expectedVersion: 1, data: data('接收者编辑的机密内容') }); assert.equal(text(await a.download(saved.id)), '接收者编辑的机密内容')
  await assert.rejects(b.shareSave({ id: edit.id, expectedVersion: 1, data: data('旧版本覆盖') }), error => error.status === 409)
  assert.equal((await f.request(`/v1/shares/${edit.id}/content`, { raw: true })).status, 401)
  await a.shareRevoke({ id: edit.id }); await assert.rejects(b.shareDownload({ id: edit.id }), /撤销|到期/)
  f.advance(60001); await assert.rejects(b.shareDownload({ id: read.id }), /撤销|到期/)
  const database = fs.readFileSync(path.join(f.directory, 'server/seal.sqlite'))
  for (const secret of ['保密客户', '原始机密', '接收者编辑', read.credential.split(':')[3]]) assert.equal(database.includes(Buffer.from(secret)), false)
  for (const name of fs.readdirSync(path.join(f.directory, 'server/objects'))) assert.equal(fs.readFileSync(path.join(f.directory, 'server/objects', name)).includes(Buffer.from('机密内容')), false)
})

test('设备注册、重命名、跨账号隔离、远程撤销和当前会话清除', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b } = f, another = await f.client('13800111001')
  await a.deviceRegister({ name: '办公室电脑' }); await another.deviceRegister({ name: '移动设备' })
  const items = (await a.deviceList()).items; assert.equal(items.length, 2); const remote = items.find(item => !item.current)
  assert.ok(remote.created > 0); assert.ok(remote.lastSeen > 0)
  await a.deviceRename({ id: remote.id, name: '备用手机' }); assert.equal((await another.deviceList()).items.find(item => item.current).name, '备用手机')
  await assert.rejects(b.deviceRevoke({ id: remote.id }), error => error.status === 404)
  await a.deviceRevoke({ id: remote.id }); await assert.rejects(another.deviceList(), error => error.status === 401); assert.equal(another.status().account, null)
  const current = (await a.deviceList()).items[0]; await a.deviceRevoke({ id: current.id }); assert.equal(a.status().account, null); assert.equal(f.reopen(a).status().account, null)
})

test('标签名称加密，关联、筛选、重命名、删除与越权检查', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b } = f
  const first = await a.save({ linkId: 'a', name: '合同.txt', data: data('甲') }), second = await a.save({ linkId: 'b', name: '报价.txt', data: data('乙') })
  const tag = await a.tagCreate({ name: '未公开商业合同', color: '#FF8800' }), other = await a.tagCreate({ name: '本周' })
  await a.tagAssign({ id: first.id, tagIds: [tag.id, other.id] }); await a.tagAssign({ id: second.id, tagIds: [other.id] })
  assert.equal((await a.tagList()).items.find(item => item.id === tag.id).count, 1); assert.deepEqual((await a.tagFilter({ id: tag.id })).map(item => item.id), [first.id]); assert.equal((await a.list()).find(item => item.id === first.id).tagIds.length, 2)
  await a.tagUpdate({ id: tag.id, name: '已签合同' }); assert.equal((await a.tagList()).items.find(item => item.id === tag.id).name, '已签合同')
  await assert.rejects(b.tagAssign({ id: first.id, tagIds: [tag.id] }), error => error.status === 404)
  await assert.rejects(b.tagDelete({ id: tag.id }), error => error.status === 404)
  await assert.rejects(a.tagAssign({ id: first.id, tagIds: [randomUUID()] }), error => error.status === 404); assert.equal((await a.tagFilter({ id: tag.id })).length, 1)
  assert.equal(fs.readFileSync(path.join(f.directory, 'server/seal.sqlite')).includes(Buffer.from('已签合同')), false)
  await a.tagDelete({ id: tag.id }); assert.deepEqual((await a.list()).find(item => item.id === first.id).tagIds, [other.id])
})

test('团队加密空间：邀请消费、viewer/editor/admin权限、目录文件、冲突和成员撤销', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b, c } = f
  const team = await a.teamCreate({ name: '加密研发团队' }); await a.teamUpdate({ id: team.id, name: '研发协作空间' })
  const invite = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'viewer', expiresAt: f.now() + 120000 })
  await assert.rejects(c.teamAccept({ credential: invite.credential }), /邀请不存在/)
  await b.teamAccept({ credential: invite.credential }); await assert.rejects(b.teamAccept({ credential: invite.credential }), error => error.status === 409)
  assert.equal((await b.teamList()).items[0].name, '研发协作空间'); await assert.rejects(b.teamFolder({ id: team.id, name: '越权目录' }), /权限/)
  const folder = await a.teamFolder({ id: team.id, name: '内部合同' }), file = await a.teamSave({ id: team.id, parent: folder.id, name: '协作合同.txt', data: data('团队机密初稿') })
  assert.equal(text(await b.teamDownload({ id: team.id, nodeId: file.id })), '团队机密初稿')
  const foreign = await c.teamCreate({ name: '其他团队' }), foreignNode = await c.teamFolder({ id: foreign.id, name: '其他目录' })
  await assert.rejects(a.teamUpdateNode({ id: team.id, nodeId: folder.id, parent: foreignNode.id }), error => error.status === 404)
  await assert.rejects(a.teamUpdateNode({ id: team.id, nodeId: folder.id, parent: folder.id }), /自身/)
  await a.teamUpdateMember({ id: team.id, userId: b.status().account.id, role: 'editor' })
  await b.teamSave({ id: team.id, nodeId: file.id, expectedVersion: 1, data: data('团队成员修订') }); assert.equal(text(await a.teamDownload({ id: team.id, nodeId: file.id })), '团队成员修订')
  await assert.rejects(a.teamSave({ id: team.id, nodeId: file.id, expectedVersion: 1, data: data('冲突覆盖') }), error => error.status === 409)
  await b.teamUpdateNode({ id: team.id, nodeId: file.id, name: '已修订合同' }); assert.equal((await a.teamNodes({ id: team.id })).items.find(item => item.id === file.id).meta.filename, '已修订合同.txt')
  await assert.rejects(b.teamInvite({ id: team.id, recipientPhone: '13800111003', role: 'editor' }), /权限/)
  await a.teamUpdateMember({ id: team.id, userId: b.status().account.id, role: 'admin' })
  await assert.rejects(b.teamInvite({ id: team.id, recipientPhone: '13800111003', role: 'admin' }), /角色/)
  const editorInvite = await b.teamInvite({ id: team.id, recipientPhone: '13800111003', role: 'editor' }); await c.teamAccept({ credential: editorInvite.credential })
  await assert.rejects(b.teamUpdateMember({ id: team.id, userId: a.status().account.id, role: 'viewer' }), /权限/)
  const database = fs.readFileSync(path.join(f.directory, 'server/seal.sqlite')); for (const secret of ['研发协作空间', '内部合同', '已修订合同', '团队成员修订', editorInvite.credential.split(':')[3]]) assert.equal(database.includes(Buffer.from(secret)), false)
  await a.teamRemoveMember({ id: team.id, userId: b.status().account.id }); await assert.rejects(b.teamDownload({ id: team.id, nodeId: file.id }), /权限已撤销/)
  await a.teamRemoveNode({ id: team.id, nodeId: folder.id }); assert.equal((await c.teamNodes({ id: team.id })).items.length, 0)
  await a.teamDelete({ id: team.id }); assert.equal((await c.teamList()).items.some(item => item.id === team.id), false)
})

test('团队邀请过期和撤销立即生效，成员降权阻止后续写入', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b, c } = f, team = await a.teamCreate({ name: '权限变更测试' })
  const expired = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'viewer', expiresAt: f.now() + 1000 }); f.advance(1001); await assert.rejects(b.teamAccept({ credential: expired.credential }))
  const revoked = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'editor' }); await a.teamRevokeInvite({ id: team.id, inviteId: revoked.id }); await assert.rejects(b.teamAccept({ credential: revoked.credential }))
  const active = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'admin' }); await b.teamAccept({ credential: active.credential })
  const delegated = await b.teamInvite({ id: team.id, recipientPhone: '13800111003', role: 'editor' }); await a.teamUpdateMember({ id: team.id, userId: b.status().account.id, role: 'viewer' }); await assert.rejects(c.teamAccept({ credential: delegated.credential }), /权限/)
  await assert.rejects(b.teamFolder({ id: team.id, name: '降权后写入' }), /权限/)
})

async function heldPut(f, route, client, headers = {}) {
  const http = require('node:http'), raw = Buffer.alloc(40, 7)
  let received
  const started = new Promise(resolve => { received = resolve })
  const watch = req => { if (req.url === route && req.method === 'PUT') req.once('data', received) }
  f.cloud.server.on('request', watch)
  let request
  const response = new Promise((resolve, reject) => {
    request = http.request(f.url + route, { method: 'PUT', headers: { Authorization: 'Bearer ' + f.localState(client).token, 'Content-Length': raw.length, ...headers } }, reply => { reply.resume(); reply.on('end', () => resolve(reply.statusCode)) }); request.on('error', reject); request.write(raw.subarray(0, 10))
  })
  await started; f.cloud.server.off('request', watch)
  return async () => { request.end(raw.subarray(10)); return response }
}

test('上传接收正文期间撤销共享、移除成员或设备会话，提交仍重新鉴权且不产生新版本', async t => {
  const f = await createLocalCollaborationFixture(t), { a, b } = f
  const saved = await a.save({ linkId: 'held', name: '资料.txt', data: data('保持原始版本') }), shared = await a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }); await b.shareAccept({ credential: shared.credential })
  const finishShare = await heldPut(f, `/v1/shares/${shared.id}/content`, b, { 'X-Seal-Access': shared.credential.split(':')[2], 'X-Seal-Expected': '1' }); await a.shareRevoke({ id: shared.id }); assert.equal(await finishShare(), 404); assert.equal((await a.versions(saved.id)).items.length, 1)
  const team = await a.teamCreate({ name: '并发撤权' }), invite = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'editor' }); await b.teamAccept({ credential: invite.credential }); const file = await a.teamSave({ id: team.id, name: '计划.txt', data: data('原始团队内容') })
  const finishTeam = await heldPut(f, `/v1/teams/${team.id}/nodes/${file.id}/content`, b, { 'X-Seal-Expected': '1' }); await a.teamRemoveMember({ id: team.id, userId: b.status().account.id }); assert.equal(await finishTeam(), 404); assert.equal(text(await a.teamDownload({ id: team.id, nodeId: file.id })), '原始团队内容')
  const own = await b.save({ linkId: 'own', name: '本人的.txt', data: data('本人内容') }), upload = await b.request('/v1/uploads', { method: 'POST', data: { nodeId: own.id, bytes: 40, expected: 1 } }), current = (await b.deviceList()).items.find(item => item.current), other = await f.client('13800111002')
  const finishDevice = await heldPut(f, `/v1/uploads/${upload.id}`, b, { 'X-Seal-Offset': '0' }); await other.deviceRevoke({ id: current.id }); assert.equal(await finishDevice(), 401); assert.equal(f.cloud.db.one('SELECT received FROM uploads WHERE id=?', [upload.id]).received, 0)
})

test('团队版本及加密元数据计入所有者配额，超额不伪造成功', async t => {
  const f = await createLocalCollaborationFixture(t, { quota: 900 }), { a } = f, team = await a.teamCreate({ name: '限额团队' })
  await assert.rejects(a.teamSave({ id: team.id, name: '过大的.txt', data: Buffer.alloc(1000).toString('base64') }), error => error.status === 413)
  assert.equal(f.cloud.db.one('SELECT COUNT(*) n FROM team_versions').n, 0); assert.ok(f.cloud.usage(a.status().account.id) > 0)
})
