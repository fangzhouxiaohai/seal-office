import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { scryptSync } from 'node:crypto'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from '../node_modules/esbuild/lib/main.js'
const require = createRequire(import.meta.url)
const { createLocalCollaborationFixture } = require('../../server/test/collaborationFixture.cjs')
const { createManagedConverter } = require('../../server/converter/managed.cjs')
const { Modal } = require('../../node_modules/antd')

test('Web 默认当前云账号联网转换：真实 HTTP 网关、每次授权/取消、未登录与手工token配置优先', async t => {
  const controlToken = 'mobile-gateway-test-control-'.padEnd(48, 'k'), converted = []
  // This deterministic engine verifies the bridge/gateway protocol; it makes no
  // claim to verify LibreOffice's binary format conversion in this unit test.
  const worker = await createManagedConverter({ controlToken, probe: async () => 'protocol-test-engine', convert: async bytes => { converted.push(Buffer.from(bytes)); return Buffer.from(bytes) } })
  await new Promise(resolve => worker.server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { worker.server.closeAllConnections?.(); await new Promise(resolve => worker.server.close(resolve)) })
  const f = await createLocalCollaborationFixture(t, { env: { SEAL_CONVERTER_CONTROL_TOKEN: controlToken, SEAL_CONVERTER_INTERNAL_URL: 'http://127.0.0.1:' + worker.server.address().port, SEAL_ADMIN_PASSWORD_HASH: scryptSync('test-admin', 'seal-admin-v1', 32).toString('hex') } })
  const admin = (await f.request('/v1/admin/login', { method: 'POST', data: { username: 'admin', password: 'test-admin' } })).body.token
  const serviceToken = (await f.request('/v1/admin/converter/token', { token: admin, method: 'POST', data: {} })).body.token
  await f.request('/v1/admin/converter', { token: admin, method: 'PATCH', data: { enabled: true, concurrency: 1 } })
  const filename = fileURLToPath(new URL('../../.upgrade-private/test-account-conversion.cjs', import.meta.url))
  await build({ entryPoints: [fileURLToPath(new URL('../web/conversionService.ts', import.meta.url))], outfile: filename, bundle: true, format: 'cjs', platform: 'node', external: ['antd'], logLevel: 'silent' })
  const previousWindow = globalThis.window, originalConfirm = Modal.confirm, confirmations = [], records = new Map()
  let approve = false, adapter
  globalThis.window = { fetch: globalThis.fetch }
  Modal.confirm = options => { confirmations.push(options); queueMicrotask(() => approve ? options.onOk() : options.onCancel()); return { destroy() {} } }
  t.after(async () => { Modal.confirm = originalConfirm; globalThis.window = previousWindow; await fs.unlink(filename) })
  const { installConversionService } = require(filename)
  const core = { storage: { existsSync: name => records.has(name), readFileSync: name => records.get(name), writeFileSync: (name, value) => records.set(name, value), rmSync: name => records.delete(name), flushStorage: async () => {} }, vault: { safeStorage: f.safeStorage }, conversion: { configureConversion: value => { adapter = value } } }
  installConversionService(core, f.a)
  assert.equal(adapter.canUseRemote(), true)
  const source = Buffer.from('联网转换正文😀𠀀 &<>'), unchanged = Buffer.from(source)
  await assert.rejects(adapter.remote(source, 'doc', 'docx', 'word'), /已取消/)
  assert.equal(converted.length, 0); assert.deepEqual(source, unchanged)
  approve = true
  assert.deepEqual(await adapter.remote(source, 'doc', 'docx', 'word'), source)
  assert.equal(converted.length, 1); assert.match(confirmations[1].content, /当前账号/)
  assert.equal(JSON.stringify(confirmations).includes(serviceToken), false); assert.equal(JSON.stringify(confirmations).includes(controlToken), false)
  await window.sealDocumentConversion.save({ url: 'http://127.0.0.1:' + worker.server.address().port, token: serviceToken })
  const secureRecord = [...records.values()][0]; assert.equal(secureRecord.includes(Buffer.from(serviceToken)), false)
  await f.a.logout()
  assert.deepEqual(await adapter.remote(source, 'doc', 'docx', 'word'), source)
  assert.match(confirmations[2].content, /127\.0\.0\.1/)
  await window.sealDocumentConversion.clear()
  assert.equal(adapter.canUseRemote(), false)
  await assert.rejects(adapter.remote(source, 'doc', 'docx', 'word'), /登录并开通/)
  assert.equal(confirmations.length, 3); assert.deepEqual(source, unchanged)
})

test('移动适配器接受有效 PDF，拒绝伪装结果并在取消时不调用转换',async t=>{
  const filename=fileURLToPath(new URL('../../.upgrade-private/test-pdf-conversion.cjs',import.meta.url))
  await build({entryPoints:[fileURLToPath(new URL('../web/conversionService.ts',import.meta.url))],outfile:filename,bundle:true,format:'cjs',platform:'node',external:['antd'],logLevel:'silent'})
  const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save())
  const previousWindow=globalThis.window,originalConfirm=Modal.confirm
  let approve=true,valid=true,calls=0,adapter
  globalThis.window={fetch:globalThis.fetch};Modal.confirm=options=>{queueMicrotask(()=>approve?options.onOk():options.onCancel());return{destroy(){}}}
  t.after(async()=>{Modal.confirm=originalConfirm;globalThis.window=previousWindow;await fs.unlink(filename)})
  require(filename).installConversionService({storage:{existsSync:()=>false},vault:{},conversion:{configureConversion:value=>{adapter=value}}},{status:()=>({account:{enabled:true}}),conversionCapabilities:async()=>({inputs:['docx'],outputs:['pdf']}),convertDocument:async()=>{calls++;return{outputFormat:'pdf',data:(valid?bytes:Buffer.from('%PDF-1.7\ninvalid\n%%EOF')).toString('base64')}}})
  assert.equal((await PDFDocument.load(await adapter.remote(Buffer.from('fixture'),'docx','pdf','word'))).getPageCount(),1)
  valid=false;await assert.rejects(adapter.remote(Buffer.from('fixture'),'docx','pdf','word'))
  approve=false;await assert.rejects(adapter.remote(Buffer.from('fixture'),'docx','pdf','word'),/已取消/);assert.equal(calls,2)
})
