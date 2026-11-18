const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{scryptSync,randomUUID}=require('node:crypto')
const {createCloud}=require('../index.cjs')
const {listenLoopback}=require('./collaborationFixture.cjs')
const http=require('node:http')
const {spawn}=require('node:child_process')
const {createHash}=require('node:crypto')

test('受限管理员真实鉴权、概览裁剪、权限撤销与原超管兼容',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-http-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('old-secret','seal-admin-v1',32).toString('hex')}})
  await listenLoopback(cloud.server)
  const base='http://127.0.0.1:'+cloud.server.address().port
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  async function request(route,method='GET',data,token){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,body:await response.json()}}
  const root=(await request('/v1/admin/login','POST',{username:'admin',password:'old-secret'})).body.token
  assert.ok(root)
  const list=(await request('/v1/admin/access/admins','GET',null,root)).body.items
  assert.deepEqual(list.find(x=>x.id==='admin'),{id:'admin',username:'admin',enabled:true,roleIds:[],roleNames:['超级管理员'],created:null,builtin:true})
  assert.equal((await request('/v1/admin/access/admins/admin','PATCH',{enabled:false},root)).status,403)
  assert.equal((await request('/v1/admin/access/admins/admin','DELETE',null,root)).status,403)
  assert.ok((await request('/v1/admin/login','POST',{username:'admin',password:'old-secret'})).body.token)
  const role=(await request('/v1/admin/access/roles','POST',{name:'模板审核',permissions:['template:read','template:review']},root)).body.item
  assert.ok(role?.id)
  const admin=(await request('/v1/admin/access/admins','POST',{username:'reviewer',password:'StrongPassword123',roleIds:[role.id],enabled:true},root)).body.item
  assert.ok(admin?.id)
  const user=(await request('/v1/admin/login','POST',{username:'reviewer',password:'StrongPassword123'})).body.token
  assert.ok(user)
  const session=await request('/v1/admin/session','GET',null,user)
  assert.equal(session.status,200);assert.equal(session.body.user.username,'reviewer')
  assert.deepEqual(session.body.menus.map(x=>x.path),['/seal/template'])
  const template=randomUUID(),knowledge=randomUUID()
  cloud.db.transaction(()=>{for(const [id,kind] of [[template,'template'],[knowledge,'knowledge']])cloud.db.run('INSERT INTO publications(id,user_id,kind,title,description,category,blob,bytes,text,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,'test',kind,kind,'','','blob',0,'','pending',Date.now()])})
  const overview=await request('/v1/admin/overview','GET',null,user)
  assert.equal(overview.status,200);assert.deepEqual(overview.body.publications.map(x=>x.kind),['template'])
  for(const key of ['users','audit','runtime','sms','quota','overviewCounts'])assert.equal(Object.hasOwn(overview.body,key),false)
  assert.equal((await request('/v1/admin/publications/'+knowledge,'GET',null,user)).status,403)
  assert.equal((await request('/v1/admin/releases','GET',null,user)).status,403)
  assert.equal((await request('/v1/admin/release-assets','POST',{},user)).status,403)
  fs.writeFileSync(path.join(dir,'objects','blob'),'隔离文件')
  const downloaded=await fetch(base+'/v1/admin/publications/'+template+'/download',{headers:{Authorization:'Bearer '+user}})
  assert.equal(downloaded.status,200);await downloaded.arrayBuffer()
  assert.equal(cloud.db.one('SELECT user_id FROM audit WHERE action=? ORDER BY id DESC',['review-download']).user_id,'admin:'+admin.id)
  const sql=await require('sql.js')(),saved=new sql.Database(fs.readFileSync(path.join(dir,'seal.sqlite')))
  try {assert.equal(saved.exec("SELECT user_id FROM audit WHERE action='review-download'")[0]?.values[0][0],'admin:'+admin.id)} finally {saved.close()}
  assert.equal((await request('/v1/admin/publications/'+template,'PATCH',{status:'approved'},user)).status,200)
  assert.equal(cloud.db.one('SELECT user_id FROM audit WHERE action=? ORDER BY id DESC',['review']).user_id,'admin:'+admin.id)
  assert.equal((await request('/v1/admin/access/menus/template','PATCH',{enabled:false},root)).status,200)
  assert.equal((await request('/v1/admin/publications/'+template,'GET',null,user)).status,403)
  assert.equal((await request('/v1/admin/publications/'+template,'GET',null,root)).status,403)
  assert.equal((await request('/v1/admin/session','GET',null,user)).body.menus.length,0)
  assert((await request('/v1/admin/access/menu-candidates','GET',null,root)).body.items.some(x=>x.key==='template'))
  assert.equal((await request('/v1/admin/access/menus','POST',{key:'template'},root)).status,200)
  assert.equal((await request('/v1/admin/publications/'+template,'GET',null,user)).status,200)
  assert.equal((await request('/v1/admin/access/menus/menus','PATCH',{enabled:false},root)).status,400)
  assert.equal((await request('/v1/admin/access/menus/menus','PATCH',{visible:false},root)).status,400)
  assert.equal((await request('/v1/admin/access/admins/'+admin.id,'PATCH',{password:'DifferentPassword456'},root)).status,200)
  assert.equal((await request('/v1/admin/session','GET',null,user)).status,401)
  const renewed=(await request('/v1/admin/login','POST',{username:'reviewer',password:'DifferentPassword456'})).body.token
  assert.ok(renewed)
  assert.equal((await request('/v1/admin/access/admins/'+admin.id,'PATCH',{enabled:false},root)).status,200)
  assert.equal((await request('/v1/admin/session','GET',null,renewed)).status,401)
  assert.equal((await request('/v1/admin/overview','GET',null,root)).status,200)
})

test('上传进行中撤销发布权限后不得保存附件',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-upload-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('old-secret','seal-admin-v1',32).toString('hex')}})
  await listenLoopback(cloud.server);const port=cloud.server.address().port,base='http://127.0.0.1:'+port
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  async function call(route,method='GET',data,token){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return r.json()}
  const root=(await call('/v1/admin/login','POST',{username:'admin',password:'old-secret'})).token
  const role=(await call('/v1/admin/access/roles','POST',{name:'发布',permissions:['releases:read','releases:write']},root)).item
  const admin=(await call('/v1/admin/access/admins','POST',{username:'publisher',password:'StrongPassword123',roleIds:[role.id],enabled:true},root)).item
  const token=(await call('/v1/admin/login','POST',{username:'publisher',password:'StrongPassword123'})).token
  const created=await call('/v1/admin/releases','POST',{platform:'web',version:'2.8.0',notes:'隔离测试'},token)
  assert.equal(created.item.createdBy,'admin:'+admin.id)
  const bytes=Buffer.alloc(512,7);bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128)
  let finished
  const response=new Promise((resolve,reject)=>{finished=http.request({host:'127.0.0.1',port,method:'POST',path:'/v1/admin/release-assets?platform=windows&version=2.7.2&filename=seal-office-setup-2.7.2.exe',headers:{Authorization:'Bearer '+token,'Content-Type':'application/octet-stream','Content-Length':bytes.length}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode))});finished.on('error',reject);finished.write(bytes.subarray(0,256))})
  for(let i=0;i<100&&!fs.readdirSync(path.join(dir,'release-assets')).some(x=>x.endsWith('.part'));i++)await new Promise(r=>setTimeout(r,10))
  assert(fs.readdirSync(path.join(dir,'release-assets')).some(x=>x.endsWith('.part')))
  await call('/v1/admin/access/roles/'+role.id,'PATCH',{permissions:['releases:read']},root)
  finished.end(bytes.subarray(256))
  assert.equal(await response,403)
  assert.deepEqual(fs.readdirSync(path.join(dir,'release-assets')),[])
  await call('/v1/admin/access/roles/'+role.id,'PATCH',{permissions:['releases:read','releases:write']},root)
  const payload=Buffer.from(JSON.stringify({platform:'web',version:'2.9.1',notes:'隔离测试'}))
  let jsonRequest
  const jsonResponse=new Promise((resolve,reject)=>{jsonRequest=http.request({host:'127.0.0.1',port,method:'POST',path:'/v1/admin/releases',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Content-Length':payload.length}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode))});jsonRequest.on('error',reject);jsonRequest.write(payload.subarray(0,5))})
  await new Promise(resolve=>setTimeout(resolve,30))
  await call('/v1/admin/access/roles/'+role.id,'PATCH',{permissions:['releases:read']},root)
  jsonRequest.end(payload.subarray(5))
  assert.equal(await jsonResponse,403)
  assert.equal(cloud.db.one('SELECT COUNT(*) AS n FROM releases').n,1)
})
test('审核附件下载期间撤权中止未发送的内容',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-download-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('old-secret','seal-admin-v1',32).toString('hex')}})
  await listenLoopback(cloud.server);const base='http://127.0.0.1:'+cloud.server.address().port
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  async function call(route,method='GET',data,token){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()}}
  const root=(await call('/v1/admin/login','POST',{username:'admin',password:'old-secret'})).body.token
  const role=(await call('/v1/admin/access/roles','POST',{name:'下载审核',permissions:['template:read']},root)).body.item
  await call('/v1/admin/access/admins','POST',{username:'reviewer',password:'StrongPassword123',roleIds:[role.id]},root)
  const token=(await call('/v1/admin/login','POST',{username:'reviewer',password:'StrongPassword123'})).body.token
  const id=randomUUID(),blob=randomUUID(),total=32*1024*1024
  const fd=fs.openSync(path.join(dir,'objects',blob),'w');fs.ftruncateSync(fd,total);fs.closeSync(fd)
  cloud.db.transaction(()=>cloud.db.run('INSERT INTO publications(id,user_id,kind,title,description,category,blob,bytes,text,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,'test','template','test','','',blob,total,'','pending',Date.now()]))
  const response=await new Promise((resolve,reject)=>{const req=http.get(base+'/v1/admin/publications/'+id+'/download',{headers:{Authorization:'Bearer '+token}},resolve);req.on('error',reject)})
  response.pause()
  await call('/v1/admin/access/roles/'+role.id,'PATCH',{permissions:[]},root)
  const read=await new Promise(resolve=>{let count=0;response.on('data',chunk=>count+=chunk.length);response.on('end',()=>resolve(count));response.on('error',()=>resolve(count));response.resume()})
  assert(read<total,'撤权后未发送数据应被中止')
  assert.equal((await call('/v1/admin/publications/'+id,'GET',null,token)).status,403)
})
test('低权限账号成功登录不能清除同 IP 的超管密码失败限流',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-login-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('old-secret','seal-admin-v1',32).toString('hex')}})
  await listenLoopback(cloud.server);const base='http://127.0.0.1:'+cloud.server.address().port
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  async function call(route,data,token){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()}}
  const root=(await call('/v1/admin/login',{username:'admin',password:'old-secret'})).body.token
  await call('/v1/admin/access/admins',{username:'reviewer',password:'StrongPassword123',roleIds:[],enabled:true},root)
  for(let i=0;i<4;i++){
    assert.equal((await call('/v1/admin/login',{username:'admin',password:'wrong'})).status,401)
    assert.equal((await call('/v1/admin/login',{username:'reviewer',password:'StrongPassword123'})).status,200)
  }
  assert.equal((await call('/v1/admin/login',{username:'admin',password:'wrong'})).status,401)
  assert.equal((await call('/v1/admin/login',{username:'admin',password:'wrong'})).status,429)
})
test('无效登录请求返回统一鉴权错误，不泄露账号是否存在',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-invalid-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('old-secret','seal-admin-v1',32).toString('hex')}})
  await listenLoopback(cloud.server);const base='http://127.0.0.1:'+cloud.server.address().port
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  for (const body of ['null',JSON.stringify({username:'unknown',password:'wrong'}),JSON.stringify({username:'admin',password:'wrong'})]) {
    const r=await fetch(base+'/v1/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body})
    assert.equal(r.status,401);assert.equal((await r.json()).error,'管理员账号或密码不正确')
  }
})
test('不同来源的错误密码不能全局锁死合法超管',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-sources-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('old-secret','seal-admin-v1',32).toString('hex')}})
  await listenLoopback(cloud.server);const base='http://127.0.0.1:'+cloud.server.address().port
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  async function login(ip,password){return fetch(base+'/v1/admin/login',{method:'POST',headers:{'Content-Type':'application/json','X-Real-IP':ip},body:JSON.stringify({username:'admin',password})})}
  for(let i=1;i<=5;i++)assert.equal((await login('10.1.1.'+i,'wrong')).status,401)
  assert.equal((await login('10.1.1.6','old-secret')).status,200)
})
test('第二云服务进程被排他锁拒绝前不触碰已有业务数据库',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-cloud-lock-'))
  const cloud=await createCloud({directory:dir,sms:{configured:false,send:async()=>{}},env:{}})
  await listenLoopback(cloud.server)
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  const file=path.join(dir,'seal.sqlite'),before=fs.readFileSync(file),stamp=fs.statSync(file,{bigint:true}).mtimeNs
  const code="require(process.argv[1]).createCloud({directory:process.argv[2],env:{},sms:{configured:false}}).then(()=>process.exit(0)).catch(()=>process.exit(2))"
  const child=spawn(process.execPath,['-e',code,require.resolve('../index.cjs'),dir],{stdio:'ignore',windowsHide:true})
  const result=await new Promise(resolve=>child.once('exit',resolve))
  assert.equal(result,2)
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),createHash('sha256').update(before).digest('hex'))
  assert.equal(fs.statSync(file,{bigint:true}).mtimeNs,stamp)
})
