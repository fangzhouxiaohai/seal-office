const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{scryptSync}=require('node:crypto')
const {createManagedConverter}=require('../converter/managed.cjs'),{createLocalCollaborationFixture,listenLoopback}=require('./collaborationFixture.cjs')
const controlToken='isolated-gateway-control-'.padEnd(48,'z'),payload={inputFormat:'doc',outputFormat:'docx',type:'word',data:Buffer.from('私有转换正文').toString('base64'),consent:true}
async function fixture(t,options={}){
  const worker=await createManagedConverter({controlToken,probe:async()=>'isolated-test-engine',convert:async bytes=>Buffer.from(bytes),...options.worker})
  await listenLoopback(worker.server);const workerUrl=`http://127.0.0.1:${worker.server.address().port}`
  const f=await createLocalCollaborationFixture(t,{conversionTimeout:options.timeout,env:{SEAL_CONVERTER_CONTROL_TOKEN:controlToken,SEAL_CONVERTER_INTERNAL_URL:workerUrl,SEAL_ADMIN_PASSWORD_HASH:scryptSync('test-admin','seal-admin-v1',32).toString('hex')}})
  t.after(async()=>{worker.server.closeAllConnections?.();await new Promise(resolve=>worker.server.close(resolve))})
  const admin=(await f.request('/v1/admin/login',{method:'POST',data:{username:'admin',password:'test-admin'}})).body.token
  const serviceToken=(await f.request('/v1/admin/converter/token',{token:admin,method:'POST',data:{}})).body.token
  if(options.enabled!==false)assert.equal((await f.request('/v1/admin/converter',{token:admin,method:'PATCH',data:{enabled:true,concurrency:options.concurrency||2}})).status,200)
  return {...f,worker,workerUrl,admin,serviceToken}
}
const convert=(f,client,input=payload)=>f.request('/v1/conversion/convert',{client,method:'POST',data:input})

test('办公文档到 PDF 明确白名单、真实 PDF 页树验证，禁止 PDF 反向导入与伪装输出',async t=>{
  const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create();pdf.addPage([595,842]);const bytes=Buffer.from(await pdf.save())
  const f=await fixture(t,{worker:{convert:async(_bytes,_in,_out,type)=>type==='ppt'?Buffer.from('%PDF-1.7\n伪装\n%%EOF'):bytes}})
  assert.ok((await f.a.conversionCapabilities()).outputs.includes('pdf'))
  for(const [inputFormat,type]of [['docx','word'],['xlsx','table']]){
    const result=await f.a.convertDocument({...payload,inputFormat,type,outputFormat:'pdf'})
    assert.equal((await PDFDocument.load(Buffer.from(result.data,'base64'))).getPageCount(),1)
  }
  assert.equal((await convert(f,f.b,{...payload,inputFormat:'pptx',type:'ppt',outputFormat:'pdf'})).status,400)
  assert.equal((await convert(f,f.b,{...payload,inputFormat:'pdf',outputFormat:'docx'})).status,400)
  assert.equal((await convert(f,f.b,{...payload,inputFormat:'docx',outputFormat:'xlsx'})).status,400)
  assert.equal((await convert(f,f.b,{...payload,outputFormat:'pdf',consent:false})).status,400)
})
test('账号gateway真实会话鉴权、上传授权、格式白名单与控制/服务token隔离',async t=>{
  const f=await fixture(t)
  assert.equal((await f.request('/v1/conversion/capabilities')).status,401)
  assert.equal((await f.request('/v1/conversion/capabilities',{token:f.serviceToken})).status,401)
  assert.equal((await f.request('/v1/admin/converter',{client:f.a})).status,401)
  const caps=await f.a.conversionCapabilities();assert.equal(caps.protocol,'seal-office-converter/1');assert.ok(caps.inputs.includes('doc'));assert.ok(!caps.inputs.includes('wps'))
  const result=await f.a.convertDocument(payload);assert.equal(Buffer.from(result.data,'base64').toString(),'私有转换正文');assert.equal(result.outputFormat,'docx')
  assert.equal((await convert(f,f.b,{...payload,consent:false})).status,400)
  assert.equal((await convert(f,f.b,{...payload,inputFormat:'../doc'})).status,400)
  assert.equal((await convert(f,f.b,{...payload,outputFormat:'docm'})).status,400)
  assert.equal((await convert(f,f.b,{...payload,type:'ppt'})).status,400)
  assert.equal((await convert(f,f.c,{...payload,data:Buffer.alloc(20*1024*1024+1).toString('base64')})).status,413)
  const wrong=await fetch(f.workerUrl+'/internal/capabilities',{headers:{Authorization:'Bearer '+f.serviceToken}});assert.equal(wrong.status,401)
  const plain=await fetch(f.workerUrl+'/v1/capabilities',{headers:{Authorization:'Bearer '+f.serviceToken}});assert.equal(plain.status,200)
  const state=(await f.request('/v1/admin/converter',{token:f.admin})).body,serialized=JSON.stringify({caps,result,state})
  assert.ok(!serialized.includes(f.serviceToken));assert.ok(!serialized.includes(controlToken));assert.ok(!JSON.stringify(state.statistics).includes(payload.data));assert.ok(!JSON.stringify(state.statistics).includes('私有转换正文'))
  const stored=fs.readFileSync(path.join(f.directory,'server/converter-settings.json'),'utf8');assert.ok(!stored.includes(f.serviceToken));assert.ok(!stored.includes(controlToken))
  const current=(await f.a.deviceList()).items.find(item=>item.current);await f.a.deviceRevoke({id:current.id});assert.equal((await f.request('/v1/conversion/capabilities',{token:f.localState(f.a).token||'revoked'})).status,401)
})
test('账号级每分钟6次限流并按账号隔离，网关与自定义token共用worker并发槽位',async t=>{
  let release,hold=false,started
  const active=new Promise(resolve=>{started=resolve})
  const f=await fixture(t,{concurrency:1,worker:{convert:async bytes=>{if(hold){started();await new Promise(resolve=>{release=resolve})}return bytes}}})
  for(let i=0;i<6;i++)assert.equal((await convert(f,f.a)).status,200)
  assert.equal((await convert(f,f.a)).status,429);assert.equal((await convert(f,f.b)).status,200)
  f.advance(60001);hold=true;const running=convert(f,f.a);await active
  assert.equal((await convert(f,f.a)).status,429)
  const legacy=await fetch(f.workerUrl+'/v1/convert',{method:'POST',headers:{Authorization:'Bearer '+f.serviceToken,'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(legacy.status,429)
  hold=false;release();assert.equal((await running).status,200)
  assert.equal(f.worker.converter.snapshot().active,0)
})
test('网关超时与客户端取消传递到相同worker，释放实际转换槽位',async t=>{
  const aborted=[]
  const f=await fixture(t,{timeout:100,worker:{convert:async(_bytes,_in,_out,_type,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted.push(true);reject(new Error('已取消'))},{once:true}))}})
  const timed=await convert(f,f.a);assert.equal(timed.status,504)
  for(let i=0;i<40&&f.worker.converter.snapshot().active;i++)await new Promise(resolve=>setTimeout(resolve,10))
  assert.equal(f.worker.converter.snapshot().active,0);assert.equal(aborted.length,1)
  const controller=new AbortController(),client=fetch(f.url+'/v1/conversion/convert',{method:'POST',headers:{Authorization:'Bearer '+f.localState(f.b).token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal})
  for(let i=0;i<40&&!f.worker.converter.snapshot().active;i++)await new Promise(resolve=>setTimeout(resolve,2))
  controller.abort();await assert.rejects(client)
  for(let i=0;i<40&&f.worker.converter.snapshot().active;i++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(f.worker.converter.snapshot().active,0);assert.equal(aborted.length,2)
})
test('转换运行中撤销session停止任务；暂停或老worker不会伪造成功或注销正确云账号',async t=>{
  let started,aborted=false
  const entered=new Promise(resolve=>{started=resolve})
  const f=await fixture(t,{worker:{convert:async(_bytes,_in,_out,_type,{signal})=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('已取消'))},{once:true}))}}})
  const other=await f.client('13800111001'),current=(await f.a.deviceList()).items.find(item=>item.current),running=convert(f,f.a);await entered
  await other.deviceRevoke({id:current.id});assert.equal((await running).status,401)
  for(let i=0;i<40&&!aborted;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(aborted,true)
  await f.request('/v1/admin/converter',{token:f.admin,method:'PATCH',data:{enabled:false,concurrency:1}})
  await assert.rejects(f.b.conversionCapabilities(),error=>error.status===503);assert.ok(f.b.status().account)
})
test('新主服务连旧工作进程明确提示升级；原会话及旧token转换路径保持独立',async t=>{
  const f=await fixture(t)
  const listener=f.worker.server.listeners('request')[0];f.worker.server.removeAllListeners('request');f.worker.server.on('request',(req,res)=>{if(req.url==='/internal/capabilities'||req.url==='/internal/convert'){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'管理接口不存在'}));return}listener(req,res)})
  await assert.rejects(f.a.conversionCapabilities(),error=>error.status===503&&/升级/.test(error.message));assert.ok(f.a.status().account)
  const old=await fetch(f.workerUrl+'/v1/capabilities',{headers:{Authorization:'Bearer '+f.serviceToken}});assert.equal(old.status,200)
})
