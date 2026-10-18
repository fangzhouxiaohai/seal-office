const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { scryptSync, createHash } = require('node:crypto')
const { createManagedConverter } = require('../converter/managed.cjs')
const { createCloud } = require('../index.cjs')
const {listenLoopback}=require('./collaborationFixture.cjs')
const controlToken = 'private-control-token-'.padEnd(48, 'a')

async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-converter-admin-'))
  const worker = await createManagedConverter({ controlToken, probe: async () => 'LibreOffice isolated-test-engine', convert: async bytes => Buffer.from(bytes), ...options })
  await listenLoopback(worker.server)
  const workerUrl = `http://127.0.0.1:${worker.server.address().port}`
  const env = { SEAL_CONVERTER_CONTROL_TOKEN: controlToken, SEAL_CONVERTER_INTERNAL_URL: workerUrl, SEAL_ADMIN_PASSWORD_HASH: scryptSync('admin-test-password', 'seal-admin-v1', 32).toString('hex') }
  const cloud = await createCloud({ directory, env, sms: { configured: false } })
  await listenLoopback(cloud.server)
  const cloudUrl = `http://127.0.0.1:${cloud.server.address().port}`
  const request = async (base, route, token, method = 'GET', body) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json() }
  }
  const login = await request(cloudUrl, '/v1/admin/login', null, 'POST', { username: 'admin', password: 'admin-test-password' })
  const adminToken = login.body.token
  t.after(async () => { await cloud.close(); await new Promise(resolve => worker.server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }) })
  return { cloud, worker, directory, env, adminToken, request, workerUrl, cloudUrl, admin: (route, method, body) => request(cloudUrl, '/v1/admin/converter' + route, adminToken, method, body) }
}
test('后台与手机令牌隔离，轮换只显示一次，磁盘只保存哈希，重启恢复配置', async t => {
  const f = await fixture(t)
  assert.equal((await f.request(f.cloudUrl, '/v1/admin/converter')).status, 401)
  assert.equal((await f.admin('')).body.config.tokenConfigured, false)
  const first = (await f.admin('/token', 'POST', {})).body.token
  assert.match(first, /^[a-zA-Z0-9_-]{43}$/)
  assert.equal((await f.request(f.workerUrl, '/internal/status', first)).status, 401)
  assert.equal((await f.request(f.cloudUrl, '/v1/admin/converter', first)).status, 401)
  assert.equal((await f.request(f.workerUrl, '/v1/capabilities', first)).status, 503)
  assert.equal((await f.admin('', 'PATCH', { enabled: true, concurrency: 2 })).status, 200)
  assert.equal((await f.request(f.workerUrl, '/v1/capabilities', first)).status, 200)
  const status = (await f.admin('')).body
  assert.equal(status.config.enabled, true); assert.equal(status.config.concurrency, 2)
  assert.ok(!JSON.stringify(status).includes(first))
  const saved = fs.readFileSync(path.join(f.directory, 'converter-settings.json'), 'utf8')
  assert.ok(!saved.includes(first)); assert.ok(saved.includes(createHash('sha256').update(first).digest('hex')))
  const second = (await f.admin('/token', 'POST', {})).body.token
  assert.notEqual(first, second)
  assert.equal((await f.request(f.workerUrl, '/v1/capabilities', first)).status, 401)
  assert.equal((await f.request(f.workerUrl, '/v1/capabilities', second)).status, 200)
  const audit = f.cloud.db.query("SELECT action,detail FROM audit WHERE action LIKE 'converter-%'")
  assert.equal(audit.length, 3); assert.ok(!JSON.stringify(audit).includes(second))
  const { createConverterAdmin } = require('../converterAdmin.cjs')
  const recovered = createConverterAdmin({ directory: f.directory, env: f.env })
  try { assert.equal((await recovered.status()).config.tokenConfigured, true); assert.equal((await recovered.status()).config.enabled, true) } finally { recovered.close() }
})
test('暂停不打断当前文档，拒绝新任务，并发限制与只含元数据的任务记录', async t => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const f = await fixture(t, { convert: async () => { await pending; return Buffer.from('output') } })
  const token = (await f.admin('/token', 'POST', {})).body.token
  await f.admin('', 'PATCH', { enabled: true, concurrency: 1 })
  const payload = { inputFormat: 'doc', outputFormat: 'docx', type: 'word', data: Buffer.from('private-document-body').toString('base64') }
  const first = f.request(f.workerUrl, '/v1/convert', token, 'POST', payload)
  while (!f.worker.converter.snapshot().active) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal((await f.request(f.workerUrl, '/v1/convert', token, 'POST', payload)).status, 429)
  await f.admin('', 'PATCH', { enabled: false, concurrency: 1 })
  assert.equal((await f.request(f.workerUrl, '/v1/convert', token, 'POST', payload)).status, 503)
  assert.equal((await f.admin('/test', 'POST', {})).status, 409)
  finish(); assert.equal((await first).status, 200)
  const state = (await f.admin('')).body
  assert.equal(state.statistics.succeeded, 1); assert.equal(state.statistics.active, 0)
  assert.equal(state.statistics.recent[0].inputFormat, 'doc')
  assert.ok(!JSON.stringify(state).includes('private-document-body')); assert.ok(!JSON.stringify(state).includes(payload.data))
})
test('不可用引擎阻止启用、错误配置保留原值，外部地址不能成为管理通道', async t => {
  const f = await fixture(t, { probe: async () => { throw new Error('not installed') } })
  assert.equal((await f.admin('/token', 'POST', {})).status, 200)
  assert.equal((await f.admin('', 'PATCH', { enabled: true, concurrency: 1 })).status, 400)
  assert.equal((await f.admin('', 'PATCH', { enabled: false, concurrency: 100 })).status, 400)
  assert.equal((await f.admin('')).body.config.enabled, false)
  assert.equal((await f.admin('/test', 'POST', {})).status, 503)
  const { createConverterAdmin } = require('../converterAdmin.cjs')
  assert.throws(() => createConverterAdmin({ directory: f.directory, env: { SEAL_CONVERTER_INTERNAL_URL: 'https://example.com' } }), /回环/)
})

test('管理自检覆盖 DOC/DOCX/PDF 链路，伪装 PDF 不能通过引擎检查',async t=>{
  const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save()),JSZip=require('jszip'),zip=new JSZip();zip.file('word/document.xml','<w:document><w:body><w:p><w:r><w:t>海豹办公转换测试 0012</w:t></w:r></w:p></w:body></w:document>');const docx=await zip.generateAsync({type:'nodebuffer'})
  let valid=true;const formats=[]
  const f=await fixture(t,{convert:async(_bytes,_in,out)=>{formats.push(out);return out==='doc'?Buffer.from('d0cf11e0a1b11ae1','hex'):out==='docx'?docx:valid?bytes:Buffer.from('%PDF-1.7\nfake\n%%EOF')}})
  const result=await f.admin('/test','POST',{});assert.equal(result.status,200);assert.equal(result.body.passed,true);assert.equal(result.body.checks.length,4);assert.deepEqual(formats,['doc','docx','pdf'])
  valid=false;const invalid=await f.admin('/test','POST',{});assert.equal(invalid.status,400);assert.equal(typeof invalid.body.error,'string')
  const state=await f.admin('');assert.equal(state.body.lastTest.passed,false)
})
