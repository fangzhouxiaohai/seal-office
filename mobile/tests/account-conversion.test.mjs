import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from '../node_modules/esbuild/lib/main.js'
const require = createRequire(import.meta.url)
const { Modal } = require('../../node_modules/antd')

// 依赖旧 Node 云服务进程内夹具的“当前云账号联网转换”端到端用例已随旧后端删除。

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
