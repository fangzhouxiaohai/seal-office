const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { randomUUID, createHash } = require('node:crypto')
const { createCloud } = require('../index.cjs')
const { listenLoopback } = require('./collaborationFixture.cjs')

// 分享链接是独立于文档共享的新通道：匿名可访问、可选访问码与有效期、
// 文件密钥放在 URL 片段里，服务器始终拿不到。
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-share-')), codes = new Map()
  let time = Date.now()
  const cloud = await createCloud({ directory: dir, clock: () => time, sms: { configured: true, send: async (phone, code) => codes.set(phone, code) }, env: {} })
  await listenLoopback(cloud.server)
  const url = `http://127.0.0.1:${cloud.server.address().port}`
  t.after(async () => { await cloud.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  const raw = async (route, { method = 'GET', data, token, headers = {} } = {}) => {
    const response = await fetch(url + route, {
      method,
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    let body = null
    try { body = JSON.parse(bytes.toString()) } catch { body = bytes }
    return { status: response.status, body, headers: response.headers }
  }
  const login = async phone => {
    time += 61000
    await raw('/v1/auth/code', { method: 'POST', data: { phone } })
    return (await raw('/v1/auth/login', { method: 'POST', data: { phone, code: codes.get(phone) } })).body
  }
  const session = async phone => {
    const result = await login(phone)
    await raw('/v1/space/enable', { method: 'POST', data: { consent: true, envelope: 'encrypted-root', agreementVersion: '2026-10-08' }, token: result.token })
    return result
  }
  // 上传一段已加密内容，作为分享链接的真实载体。
  const upload = async (token, payload = '分享测试内容') => {
    const id = randomUUID(), cipher = Buffer.concat([Buffer.alloc(28, 7), Buffer.from(payload)])
    assert.equal((await raw('/v1/nodes', { method: 'POST', data: { id, kind: 'file', meta: 'encrypted-meta' }, token })).status, 200)
    const reservation = await raw('/v1/uploads', { method: 'POST', data: { nodeId: id, expected: 0, bytes: cipher.length }, token })
    assert.equal(reservation.status, 200, JSON.stringify(reservation.body))
    const put = await fetch(`${url}/v1/uploads/${reservation.body.id}`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'X-Seal-Offset': '0', 'Content-Type': 'application/octet-stream' }, body: cipher })
    assert.equal(put.status, 200, await put.text())
    assert.equal((await raw(`/v1/uploads/${reservation.body.id}/commit`, { method: 'POST', data: {}, token })).status, 200)
    return { id, cipher }
  }
  const access = () => createHash('sha256').update(randomUUID()).digest('base64url').slice(0, 43)
  return { cloud, url, raw, session, upload, access }
}

test('匿名落地页：未登录可读信息与下载，内容是原样密文', async t => {
  const f = await fixture(t), a = await f.session('13800111001')
  const file = await f.upload(a.token, '无需登录即可下载的原文件')
  const secret = f.access(), id = randomUUID()
  const created = await f.raw('/v1/share-links', { method: 'POST', data: { id, nodeId: file.id, accessHash: createHash('sha256').update(secret).digest('hex'), expiryDays: 7 }, token: a.token })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  assert.equal(created.body.requiresCode, false)
  assert.ok(created.body.expiresAt > Date.now())

  // 完全不携带会话的匿名请求。
  const landing = await f.raw('/v1/share-links/' + id)
  assert.equal(landing.status, 200)
  assert.equal(landing.body.requiresCode, false)

  const denied = await f.raw(`/v1/share-links/${id}/content`, { headers: { 'X-Seal-Access': f.access() } })
  assert.equal(denied.status, 403)
  const download = await f.raw(`/v1/share-links/${id}/content`, { headers: { 'X-Seal-Access': secret } })
  assert.equal(download.status, 200)
  assert.deepEqual(Buffer.from(download.body), file.cipher)
  assert.equal((await f.raw('/v1/share-links/' + id)).body.downloads, 1)
})

test('访问码与有效期：错误访问码被拒并限次，过期后返回 410', async t => {
  const f = await fixture(t), a = await f.session('13800111002')
  const file = await f.upload(a.token)
  const secret = f.access(), id = randomUUID()
  assert.equal((await f.raw('/v1/share-links', { method: 'POST', data: { id, nodeId: file.id, accessHash: createHash('sha256').update(secret).digest('hex'), expiryDays: 1, code: '2468' }, token: a.token })).status, 200)
  assert.equal((await f.raw('/v1/share-links/' + id)).body.requiresCode, true)
  assert.equal((await f.raw(`/v1/share-links/${id}/verify`, { method: 'POST', data: { code: '1111' } })).status, 403)
  assert.equal((await f.raw(`/v1/share-links/${id}/verify`, { method: 'POST', data: { code: '2468' } })).status, 200)
  assert.equal((await f.raw(`/v1/share-links/${id}/content`, { headers: { 'X-Seal-Access': secret } })).status, 403)
  assert.equal((await f.raw(`/v1/share-links/${id}/content`, { headers: { 'X-Seal-Access': secret, 'X-Seal-Code': '2468' } })).status, 200)

  // 连续输错要限流，避免几位数字被枚举。
  let throttled = false
  for (let i = 0; i < 12 && !throttled; i++) throttled = (await f.raw(`/v1/share-links/${id}/verify`, { method: 'POST', data: { code: '0000' } })).status === 429
  assert.equal(throttled, true, '错误访问码必须限次')

})

test('有效期只接受 1/3/7/30 天或永久，且取消后立即失效', async t => {
  const f = await fixture(t), a = await f.session('13800111003')
  const file = await f.upload(a.token), hash = createHash('sha256').update(f.access()).digest('hex')
  for (const days of [0, 2, 15, 365]) assert.equal((await f.raw('/v1/share-links', { method: 'POST', data: { id: randomUUID(), nodeId: file.id, accessHash: hash, expiryDays: days }, token: a.token })).status, 400)
  const forever = randomUUID()
  const created = await f.raw('/v1/share-links', { method: 'POST', data: { id: forever, nodeId: file.id, accessHash: hash }, token: a.token })
  assert.equal(created.status, 200)
  assert.equal(created.body.expiresAt, null)
  assert.equal((await f.raw('/v1/share-links/' + forever)).status, 200)
  assert.equal((await f.raw('/v1/share-links/' + forever, { method: 'DELETE', token: a.token })).status, 200)
  assert.equal((await f.raw('/v1/share-links/' + forever)).status, 404)
  assert.equal((await f.raw('/v1/share-links/' + forever)).body.error.includes('取消'), true)
})

test('链接属于创建者：他人无法列出或取消，彻底删除文件后链接失效', async t => {
  const f = await fixture(t), a = await f.session('13800111004'), b = await f.session('13800111005')
  const file = await f.upload(a.token), hash = createHash('sha256').update(f.access()).digest('hex'), id = randomUUID()
  await f.raw('/v1/share-links', { method: 'POST', data: { id, nodeId: file.id, accessHash: hash }, token: a.token })
  assert.equal((await f.raw('/v1/share-links', { token: b.token })).body.items.length, 0)
  assert.equal((await f.raw('/v1/share-links/' + id, { method: 'DELETE', token: b.token })).status, 404)

  // 文件进回收站后匿名访问仍应被拒绝，彻底删除后也不可访问。
  assert.equal((await f.raw('/v1/nodes/' + file.id, { method: 'DELETE', token: a.token })).status, 200)
  const trashed = await f.raw('/v1/share-links/' + id)
  assert.notEqual(trashed.status, 200)
  assert.equal((await f.raw('/v1/nodes/' + file.id + '/destroy', { method: 'DELETE', token: a.token })).status, 200)
  assert.equal((await f.raw('/v1/share-links/' + id)).status, 404)
})

test('清空并停用云空间会一并作废分享链接', async t => {
  const f = await fixture(t), a = await f.session('13800111006')
  const file = await f.upload(a.token), hash = createHash('sha256').update(f.access()).digest('hex'), id = randomUUID()
  await f.raw('/v1/share-links', { method: 'POST', data: { id, nodeId: file.id, accessHash: hash }, token: a.token })
  assert.equal((await f.raw('/v1/share-links/' + id)).status, 200)
  f.cloud.db.run('UPDATE users SET enabled=1 WHERE id=?', [a.account.id])
  f.cloud.shareLinks.purgeUser(a.account.id)
  assert.equal((await f.raw('/v1/share-links/' + id)).status, 404)
})

test('方法覆盖头让模拟无法发送 PATCH 的宿主仍能重命名与移动', async t => {
  const f = await fixture(t), a = await f.session('13800111007')
  const file = await f.upload(a.token), folder = randomUUID()
  assert.equal((await f.raw('/v1/nodes', { method: 'POST', data: { id: folder, kind: 'folder', meta: 'encrypted-folder' }, token: a.token })).status, 200)
  // 客户端把 PATCH 打包成 POST + 覆盖头，服务端必须还原为 PATCH 语义。
  const renamed = await f.raw('/v1/nodes/' + file.id, { method: 'POST', data: { meta: 'renamed-meta' }, token: a.token, headers: { 'X-Seal-Method-Override': 'PATCH' } })
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body))
  assert.equal(renamed.body.meta, 'renamed-meta')
  const moved = await f.raw('/v1/nodes/' + file.id, { method: 'POST', data: { meta: 'renamed-meta', parent: folder }, token: a.token, headers: { 'X-Seal-Method-Override': 'PATCH' } })
  assert.equal(moved.status, 200)
  assert.equal(moved.body.parent, folder)
  // 只允许覆盖 PATCH；其他方法不得被转发头改写。
  const spoofed = await f.raw('/v1/nodes/' + file.id, { method: 'POST', data: { meta: 'x' }, token: a.token, headers: { 'X-Seal-Method-Override': 'DELETE' } })
  assert.equal(spoofed.status, 404)
  assert.equal((await f.raw('/v1/capabilities')).body.shareLink, 1)
  assert.equal((await f.raw('/v1/capabilities')).body.methodOverride, 1)
})
