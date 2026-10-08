const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID,scryptSync}=require('node:crypto')
const {createCloud}=require('../index.cjs')
const {createService}=require('../../main/cloud/service')
const {seal,unseal}=require('../../main/cloud/crypto')
async function fixture(t,quota){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-cloud-')),codes=new Map();let time=Date.now()
  const cloud=await createCloud({directory:dir,quota,clock:()=>time,sms:{configured:true,send:async(phone,code)=>codes.set(phone,code)},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('admin-secret','seal-admin-v1',32).toString('hex')}})
  await new Promise(r=>cloud.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${cloud.server.address().port}`
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  const request=async(route,data,token,method=data?'POST':'GET')=>{const r=await fetch(url+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()}}
  const login=async(phone)=>{assert.equal((await request('/v1/auth/code',{phone})).status,200);return (await request('/v1/auth/login',{phone,code:codes.get(phone)})).body}
  return {dir,cloud,codes,url,request,login,tick:()=>time+=61000}
}
test('验证码隔离用途、限流、一次使用和最多五次错误',async t=>{
  const f=await fixture(t),phone='13800000000'
  assert.equal((await f.request('/v1/auth/code',{phone})).status,200)
  assert.equal((await f.request('/v1/auth/code',{phone})).status,429)
  const code=f.codes.get(phone)
  for(let i=0;i<5;i++)assert.equal((await f.request('/v1/auth/login',{phone,code:'000000'})).status,400)
  assert.equal((await f.request('/v1/auth/login',{phone,code})).status,400)
  f.tick();const l=await f.login(phone);assert.ok(l.token)
  assert.equal((await f.request('/v1/auth/login',{phone,code:f.codes.get(phone)})).status,400)
  assert.equal((await f.request('/v1/auth/code',{phone,purpose:'purge'})).status,400)
})
test('默认关闭、协议必需、账号隔离、实际占用硬限制及管理员权限',async t=>{
  const f=await fixture(t,2048),a=await f.login('13800000001'),b=await f.login('13800000002')
  assert.equal(a.account.enabled,false);assert.equal((await f.request('/v1/nodes',null,a.token)).status,403)
  assert.equal((await f.request('/v1/space/enable',{consent:false,envelope:'x',agreementVersion:'2026-10-08'},a.token)).status,400)
  assert.equal((await f.request('/v1/space/enable',{consent:true,envelope:'encrypted-root',agreementVersion:'2026-10-08'},a.token)).status,200)
  const id=randomUUID();assert.equal((await f.request('/v1/nodes',{id,kind:'file',meta:'encrypted-name'},a.token)).status,200)
  assert.equal((await f.request('/v1/nodes/'+id,null,b.token,'DELETE')).status,403)
  assert.equal((await f.request('/v1/uploads',{nodeId:id,expected:0,bytes:2048},a.token)).status,413)
  assert.equal((await f.request('/v1/admin/overview',null,a.token)).status,401)
  const admin=await f.request('/v1/admin/login',{username:'admin',password:'admin-secret'});assert.equal(admin.status,200)
  assert.equal((await f.request('/v1/admin/overview',null,admin.body.token)).body.users.length,2)
})
test('真实客户端加密、恢复密钥、下载解密、重命名、公开撤回与清空停用',async t=>{
  const f=await fixture(t),safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>seal(Buffer.alloc(32,1),Buffer.from(s),'test-safe'),decryptString:b=>unseal(Buffer.alloc(32,1),b,'test-safe').toString()}
  const local=fs.mkdtempSync(path.join(os.tmpdir(),'seal-client-'));t.after(()=>fs.rmSync(local,{recursive:true,force:true}))
  const client=createService({directory:local,safeStorage});await client.setServer(f.url);await client.sendCode('13800000003');await client.login('13800000003',f.codes.get('13800000003'))
  const enabled=await client.enable(true);assert.equal(enabled.account.autosave,false);assert.equal(enabled.recovery.length,64)
  await client.setAutosave(true)
  const folder=await client.folder('机密目录');const saved=await client.save({linkId:'doc',name:'机密资料.txt',data:Buffer.from('机密内容-客户数据').toString('base64'),parent:folder.id})
  assert.equal(saved.statuses[saved.id],'云端已保存');assert.equal(fs.readFileSync(path.join(f.dir,'seal.sqlite')).includes(Buffer.from('机密')),false)
  for(const name of fs.readdirSync(path.join(f.dir,'objects')))assert.equal(fs.readFileSync(path.join(f.dir,'objects',name)).includes(Buffer.from('机密内容')),false)
  assert.equal(Buffer.from((await client.download(saved.id)).data,'base64').toString(),'机密内容-客户数据')
  await client.update(saved.id,{name:'新名称.txt'});assert.equal((await client.list()).find(n=>n.id===saved.id).meta.name,'新名称.txt')
  const publicItem=await client.publish(saved.id,'knowledge',true);assert.equal(publicItem.status,'pending')
  const admin=(await f.request('/v1/admin/login',{username:'admin',password:'admin-secret'})).body.token
  await f.request('/v1/admin/publications/'+publicItem.id,{status:'approved'},admin,'PATCH')
  assert.equal((await f.request('/v1/public/'+publicItem.id)).status,200)
  assert.equal((await f.request('/v1/public/?q='+encodeURIComponent('机密内容'))).body.items.length,0)
  assert.equal((await f.request('/v1/public/'+publicItem.id+'/report',{reason:'请检查公开资料'},client.status().account?JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(local,'cloud.secure')))).token:null)).status,200)
  await client.request('/v1/publications/'+publicItem.id,{method:'DELETE'});assert.equal((await f.request('/v1/public/'+publicItem.id)).status,404)
  assert.equal(f.cloud.db.one('SELECT text,bytes FROM publications WHERE id=?',[publicItem.id]).bytes,0)
  assert.equal(fs.existsSync(path.join(f.dir,'objects',publicItem.id)),false)
  assert.equal((await f.request('/v1/admin/publications/'+publicItem.id,{status:'approved'},admin,'PATCH')).status,400)
  const rootEnvelope=client.status().account.envelope;await assert.rejects(client.logout());client.ackRecovery();await client.logout();f.tick();await client.sendCode('13800000003');await client.login('13800000003',f.codes.get('13800000003'));assert.equal(client.status().unlocked,false)
  await assert.rejects(client.unlock('0'.repeat(64)));await client.unlock(enabled.recovery);assert.equal(client.status().account.envelope,rootEnvelope)
  f.tick();await client.sendCode(null,'purge');await client.purge(f.codes.get('13800000003'));assert.equal(client.status().account.enabled,false);assert.equal(client.status().account.autosave,false);assert.equal(f.cloud.usage(enabled.account.id),0)
  await assert.rejects(client.setAutosave(true));const reopened=await client.enable(true);assert.equal(reopened.account.autosave,false);assert.equal((await client.list()).length,0)
})
test('分块上传位置、版本冲突与目录递归回收站',async t=>{
  const f=await fixture(t),a=await f.login('13800000004');await f.request('/v1/space/enable',{consent:true,envelope:'x',agreementVersion:'2026-10-08'},a.token)
  const folder=randomUUID(),id=randomUUID();await f.request('/v1/nodes',{id:folder,kind:'folder',meta:'encrypted'},a.token);await f.request('/v1/nodes',{id,kind:'file',parent:folder,meta:'encrypted'},a.token)
  const u=(await f.request('/v1/uploads',{nodeId:id,expected:0,bytes:28},a.token)).body
  let r=await fetch(f.url+'/v1/uploads/'+u.id,{method:'PUT',headers:{Authorization:'Bearer '+a.token,'X-Seal-Offset':'2'},body:Buffer.alloc(28)});assert.equal(r.status,409)
  r=await fetch(f.url+'/v1/uploads/'+u.id,{method:'PUT',headers:{Authorization:'Bearer '+a.token,'X-Seal-Offset':'0'},body:Buffer.alloc(28)});assert.equal(r.status,200)
  assert.equal((await f.request('/v1/uploads/'+u.id+'/commit',{},a.token)).body.version,1)
  assert.equal((await f.request('/v1/uploads',{nodeId:id,expected:0,bytes:28},a.token)).status,409)
  await f.request('/v1/nodes/'+folder,null,a.token,'DELETE');const nodes=(await f.request('/v1/nodes',null,a.token)).body.items;assert.ok(nodes.every(n=>n.deleted===1))
  await f.request('/v1/nodes/'+folder+'/restore',{},a.token);assert.ok((await f.request('/v1/nodes',null,a.token)).body.items.every(n=>n.deleted===0))
})

test('离线待同步跨重启恢复，提交响应丢失不重复版本，关闭自动保存阻止旧队列',async t=>{
  const f=await fixture(t),local=fs.mkdtempSync(path.join(os.tmpdir(),'seal-offline-'))
  t.after(()=>fs.rmSync(local,{recursive:true,force:true}))
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>seal(Buffer.alloc(32,3),Buffer.from(s),'device'),decryptString:b=>unseal(Buffer.alloc(32,3),b,'device').toString()}
  let offline=false,loseCommit=false
  const transport=async(url,options)=>{
    if(offline)throw new Error('network offline')
    const r=await fetch(url,{method:options.method,headers:options.headers,...(options.body?{body:options.body}:{})})
    const raw=Buffer.from(await r.arrayBuffer());let result;try{result=JSON.parse(raw.toString())}catch{}
    if(!r.ok)throw Object.assign(new Error(result?.error||'network error'),{status:r.status})
    if(loseCommit&&url.endsWith('/commit')){loseCommit=false;throw new Error('response lost')}
    return options.binary?raw:result
  }
  let client=createService({directory:local,safeStorage,transport});await client.setServer(f.url);await client.sendCode('13800000005');await client.login('13800000005',f.codes.get('13800000005'));await client.enable(true);await client.setAutosave(true)
  offline=true;const first=await client.save({linkId:'local.txt',name:'秘密文件.txt',data:Buffer.from('秘密修改').toString('base64'),automatic:true})
  assert.equal(first.pending,1)
  for(const filename of fs.readdirSync(path.join(local,'cloud-outbox')))assert.equal(fs.readFileSync(path.join(local,'cloud-outbox',filename)).includes(Buffer.from('秘密')),false)
  client=createService({directory:local,safeStorage,transport});offline=false;loseCommit=true;await client.flush();assert.equal(client.status().pending,1)
  client=createService({directory:local,safeStorage,transport});const done=await client.flush();assert.equal(done.pending,0);assert.equal((await client.versions(first.id)).items.length,1)
  offline=true;await client.save({linkId:'local.txt',name:'秘密文件.txt',data:Buffer.from('关闭前修改').toString('base64'),automatic:true});offline=false
  await client.setAutosave(false);await client.flush();assert.equal((await client.versions(first.id)).items.length,1);assert.equal(client.status().pending,1)
  await assert.rejects(client.save({linkId:'local.txt',name:'秘密文件.txt',data:'eA==',automatic:true}))
  await client.setAutosave(true);await client.flush();assert.equal(client.status().pending,0);assert.equal((await client.versions(first.id)).items.length,2)
  await Promise.all(['第一次','第二次'].map(text=>client.save({linkId:'local.txt',name:'秘密文件.txt',data:Buffer.from(text).toString('base64')})))
  assert.equal((await client.list()).filter(n=>n.kind==='file').length,1)
  assert.equal(Buffer.from((await client.download(first.id)).data,'base64').toString(),'第二次')
  const versions=(await client.versions(first.id)).items;await assert.rejects(client.removeVersion(versions[0].id));await client.removeVersion(versions[versions.length-1].id);assert.equal((await client.versions(first.id)).items.length,3)
})

test('两设备修改产生冲突，保留副本后原文件和待同步修改都可读取',async t=>{
  const f=await fixture(t),local=fs.mkdtempSync(path.join(os.tmpdir(),'seal-conflict-')),other=fs.mkdtempSync(path.join(os.tmpdir(),'seal-device-'))
  t.after(()=>{fs.rmSync(local,{recursive:true,force:true});fs.rmSync(other,{recursive:true,force:true})})
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>seal(Buffer.alloc(32,5),Buffer.from(s),'device'),decryptString:b=>unseal(Buffer.alloc(32,5),b,'device').toString()}
  const first=createService({directory:local,safeStorage});await first.setServer(f.url);await first.sendCode('13800000006');await first.login('13800000006',f.codes.get('13800000006'));await first.enable(true)
  const saved=await first.save({linkId:'local.txt',name:'资料.txt',data:Buffer.from('初始内容').toString('base64')})
  fs.copyFileSync(path.join(local,'cloud.secure'),path.join(other,'cloud.secure'))
  const second=createService({directory:other,safeStorage});await second.save({linkId:'local.txt',name:'资料.txt',data:Buffer.from('另一个设备的修改').toString('base64')})
  const conflict=await first.save({linkId:'local.txt',name:'资料.txt',data:Buffer.from('本机待同步修改').toString('base64')})
  assert.equal(conflict.statuses[saved.id],'版本冲突');assert.equal(first.pending().length,1)
  await assert.rejects(first.logout());await assert.rejects(first.setServer(f.url))
  assert.equal(Buffer.from(first.pendingFile(saved.id).data,'base64').toString(),'本机待同步修改')
  const copy=await first.keepConflict(saved.id);assert.notEqual(copy.id,saved.id);assert.equal(first.status().pending,0)
  assert.equal(Buffer.from((await first.download(saved.id)).data,'base64').toString(),'另一个设备的修改')
  assert.equal(Buffer.from((await first.download(copy.id)).data,'base64').toString(),'本机待同步修改')
  assert.match((await first.download(copy.id)).name,/冲突副本\.txt$/)
  const normalCopy=await first.copy(saved.id);assert.match((await first.download(normalCopy.id)).name,/副本\.txt$/)
  const counts=await first.request('/v1/space/counts');assert.equal(counts.files,3);assert.equal(counts.versions,4)
})

test('上传未完成时退出快照立即落入加密队列，最新字节经重启可恢复并正常提交',async t=>{
  const f=await fixture(t),local=fs.mkdtempSync(path.join(os.tmpdir(),'seal-last-edit-'))
  t.after(()=>fs.rmSync(local,{recursive:true,force:true}))
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>seal(Buffer.alloc(32,7),Buffer.from(s),'safe'),decryptString:b=>unseal(Buffer.alloc(32,7),b,'safe').toString()}
  let resume,started,hold=false;const paused=new Promise(r=>started=r),release=new Promise(r=>resume=r)
  const transport=async(url,options)=>{
    const r=await fetch(url,{method:options.method,headers:options.headers,...(options.body?{body:options.body}:{})})
    const raw=Buffer.from(await r.arrayBuffer());if(!r.ok)throw Object.assign(new Error(JSON.parse(raw).error),{status:r.status})
    if(hold&&url.endsWith('/v1/nodes')&&options.method==='POST'){hold=false;started();await release}
    return options.binary?raw:JSON.parse(raw)
  }
  const client=createService({directory:local,safeStorage,transport});await client.setServer(f.url);await client.sendCode('13800000007');await client.login('13800000007',f.codes.get('13800000007'));await client.enable(true);await client.setAutosave(true)
  const first=await client.save({linkId:'editing',name:'资料.txt',data:Buffer.from('较早的修改').toString('base64'),automatic:true,queueOnly:true})
  hold=true;const uploading=client.flush();await paused
  await client.save({linkId:'editing',name:'资料.txt',data:Buffer.from('退出前最后修改').toString('base64'),automatic:true,queueOnly:true})
  const restartDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'seal-restarted-'));t.after(()=>fs.rmSync(restartDirectory,{recursive:true,force:true}));fs.cpSync(local,restartDirectory,{recursive:true})
  const restarted=createService({directory:restartDirectory,safeStorage});assert.equal(Buffer.from(restarted.pendingFile(first.id).data,'base64').toString(),'退出前最后修改')
  assert.equal(fs.readFileSync(path.join(local,'cloud.secure')).includes(Buffer.from('退出前')),false)
  resume();await uploading;assert.equal(client.status().pending,1);assert.equal(client.status().statuses[first.id],'离线待同步')
  await client.flush();assert.equal(client.status().pending,0);assert.equal(Buffer.from((await client.download(first.id)).data,'base64').toString(),'退出前最后修改')
  assert.equal((await client.list()).filter(n=>n.kind==='file').length,1);assert.equal((await client.versions(first.id)).items.length,2)
})

test('10 MiB 知识文件的较大索引可上传并计入实际配额',async t=>{
  const f=await fixture(t),local=fs.mkdtempSync(path.join(os.tmpdir(),'seal-large-index-'));t.after(()=>fs.rmSync(local,{recursive:true,force:true}))
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>seal(Buffer.alloc(32,8),Buffer.from(s),'safe'),decryptString:b=>unseal(Buffer.alloc(32,8),b,'safe').toString()}
  const client=createService({directory:local,safeStorage});await client.setServer(f.url);await client.sendCode('13800000008');await client.login('13800000008',f.codes.get('13800000008'));await client.enable(true)
  const raw=Buffer.alloc(10*1024*1024,65),text=JSON.stringify([{location:'正文',text:'A'.repeat(4*1024*1024)}])
  const saved=await client.save({linkId:'kb',name:'大资料',filename:'大资料.txt',data:raw.toString('base64'),text,kind:'knowledge'})
  assert.equal(saved.statuses[saved.id],'云端已保存');assert.ok(saved.account.used>raw.length+4*1024*1024)
  assert.equal((await client.list()).find(n=>n.id===saved.id).meta.text,text)
  await assert.rejects(client.save({linkId:'oversize',name:'超限.txt',data:Buffer.alloc(10*1024*1024+1).toString('base64'),kind:'knowledge'}),/10 MiB/)
})

test('隔离备份恢复后账号、密钥封装及历史密文可用，管理员仍看不到私有正文',async t=>{
  const f=await fixture(t),local=fs.mkdtempSync(path.join(os.tmpdir(),'seal-backup-client-')),restore=fs.mkdtempSync(path.join(os.tmpdir(),'seal-backup-restore-'))
  t.after(()=>{fs.rmSync(local,{recursive:true,force:true});fs.rmSync(restore,{recursive:true,force:true})})
  const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>seal(Buffer.alloc(32,9),Buffer.from(s),'safe'),decryptString:b=>unseal(Buffer.alloc(32,9),b,'safe').toString()}
  const client=createService({directory:local,safeStorage});await client.setServer(f.url);await client.sendCode('13800000009');await client.login('13800000009',f.codes.get('13800000009'));await client.enable(true)
  const saved=await client.save({linkId:'restore',name:'机密备份.txt',data:Buffer.from('备份后可以恢复的私有正文').toString('base64')})
  fs.cpSync(f.dir,restore,{recursive:true});const recovered=await createCloud({directory:restore,sms:{configured:false}});await new Promise(r=>recovered.server.listen(0,'127.0.0.1',r));t.after(()=>recovered.close())
  const url=`http://127.0.0.1:${recovered.server.address().port}`
  const restoredClient=createService({directory:local,safeStorage,transport:async(original,options)=>{const r=await fetch(original.replace(f.url,url),{method:options.method,headers:options.headers,...(options.body?{body:options.body}:{})});const raw=Buffer.from(await r.arrayBuffer());if(!r.ok)throw new Error('restore request failed');return options.binary?raw:JSON.parse(raw)}})
  const content=await restoredClient.download(saved.id);assert.equal(Buffer.from(content.data,'base64').toString(),'备份后可以恢复的私有正文')
  assert.equal(fs.readFileSync(path.join(restore,'seal.sqlite')).includes(Buffer.from('机密备份')),false)
  for(const name of fs.readdirSync(path.join(restore,'objects')))assert.equal(fs.readFileSync(path.join(restore,'objects',name)).includes(Buffer.from('私有正文')),false)
})
