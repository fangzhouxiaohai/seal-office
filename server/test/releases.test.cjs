// 版本发布与更新检查：版本比较、匿名查询、限流、管理员鉴权、增改删、强制与最低版本
const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{scryptSync}=require('node:crypto')
const {createCloud}=require('../index.cjs')
const {compareVersions,parseVersion,createRateLimiter}=require('../releases.cjs')
const {listenLoopback}=require('./collaborationFixture.cjs')
const SHA='a'.repeat(64)

async function fixture(t,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-release-'));let time=Date.now()
  const cloud=await createCloud({directory:dir,clock:()=>time,sms:{configured:true,send:async()=>{}},env:{SEAL_ADMIN_PASSWORD_HASH:scryptSync('admin-secret','seal-admin-v1',32).toString('hex')},...options})
  await listenLoopback(cloud.server);const url=`http://127.0.0.1:${cloud.server.address().port}`
  t.after(async()=>{await cloud.close();fs.rmSync(dir,{recursive:true,force:true})})
  const request=async(route,data,token,method=data?'POST':'GET')=>{const r=await fetch(url+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()}}
  const admin=async()=>(await request('/v1/admin/login',{username:'admin',password:'admin-secret'})).body.token
  return {dir,cloud,request,admin,tick:ms=>time+=ms}
}
const windowsRelease=(version,extra={})=>({platform:'windows',version,channel:'stable',notes:'修复若干问题',url:`https://seal.xingmasoft.com/download/seal-office-setup-${version}.exe`,sha256:SHA,bytes:1024,...extra})

test('语义化版本比较遵循数字逐段与预发布规则',()=>{
  assert.equal(compareVersions('2.7.1','2.7.0'),1)
  assert.equal(compareVersions('2.7.0','2.7.1'),-1)
  assert.equal(compareVersions('2.10.0','2.9.9'),1)
  assert.equal(compareVersions('10.0.0','9.99.99'),1)
  assert.equal(compareVersions('2.7.1','2.7.1'),0)
  assert.equal(compareVersions('2.7.1-beta.1','2.7.1'),-1)
  assert.equal(compareVersions('2.7.1','2.7.1-beta.2'),1)
  assert.equal(compareVersions('2.7.1-beta.2','2.7.1-beta.10'),-1)
  assert.equal(compareVersions('2.7.1-alpha','2.7.1-beta'),-1)
  assert.equal(compareVersions('2.7.1-1','2.7.1-alpha'),-1)
  assert.equal(compareVersions('2.7.1-beta','2.7.1-beta.1'),-1)
  assert.equal(parseVersion('2.7'),null)
  assert.equal(parseVersion('v2.7.1'),null)
  assert.equal(parseVersion('2.07.1'),null)
  assert.throws(()=>compareVersions('abc','2.7.1'),/版本号格式无效/)
})

test('令牌桶按键限流并随时间回补',()=>{
  let now=0;const allow=createRateLimiter({capacity:2,refillPerMinute:60,clock:()=>now})
  assert.equal(allow('a'),true);assert.equal(allow('a'),true);assert.equal(allow('a'),false)
  assert.equal(allow('b'),true)
  now+=1000;assert.equal(allow('a'),true);assert.equal(allow('a'),false)
})

test('匿名查询只返回必要字段，已是最新或更高版本不提示',async t=>{
  const f=await fixture(t),token=await f.admin()
  const created=await f.request('/v1/admin/releases',windowsRelease('2.7.1'),token);assert.equal(created.status,200)
  const latest=await f.request('/v1/updates/latest?platform=windows&version=2.7.0&channel=stable')
  assert.equal(latest.status,200)
  assert.deepEqual(Object.keys(latest.body).sort(),['bytes','hasUpdate','mandatory','notes','publishedAt','sha256','url','version'])
  assert.equal(latest.body.hasUpdate,true);assert.equal(latest.body.version,'2.7.1');assert.equal(latest.body.mandatory,false)
  assert.equal(latest.body.sha256,SHA);assert.equal(latest.body.bytes,1024);assert.ok(latest.body.publishedAt>0)
  assert.deepEqual((await f.request('/v1/updates/latest?platform=windows&version=2.7.1')).body,{hasUpdate:false})
  assert.deepEqual((await f.request('/v1/updates/latest?platform=windows&version=2.8.0-beta.1')).body,{hasUpdate:false})
  // 其他平台互不影响
  assert.deepEqual((await f.request('/v1/updates/latest?platform=android&version=2.7.0')).body,{hasUpdate:false})
  assert.equal((await f.request('/v1/updates/latest?platform=ios&version=2.7.0')).status,400)
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=latest')).status,400)
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.0&channel=nightly')).status,400)
})

test('测试通道同时可见稳定版，稳定通道看不到测试版；下架版本不再下发',async t=>{
  const f=await fixture(t),token=await f.admin()
  await f.request('/v1/admin/releases',windowsRelease('2.7.1'),token)
  const beta=(await f.request('/v1/admin/releases',windowsRelease('2.8.0-beta.1',{channel:'beta'}),token)).body
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.0')).body.version,'2.7.1')
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.0&channel=beta')).body.version,'2.8.0-beta.1')
  assert.equal((await f.request('/v1/admin/releases/'+beta.item.id,{withdrawn:true},token,'PATCH')).status,200)
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.0&channel=beta')).body.version,'2.7.1')
})

test('强制更新：跨过的版本中任一强制或当前低于最低版本均视为强制',async t=>{
  const f=await fixture(t),token=await f.admin()
  const forced=(await f.request('/v1/admin/releases',windowsRelease('2.7.1',{mandatory:true}),token)).body.item
  await f.request('/v1/admin/releases',windowsRelease('2.7.2'),token)
  const fromOld=(await f.request('/v1/updates/latest?platform=windows&version=2.7.0')).body
  assert.equal(fromOld.version,'2.7.2');assert.equal(fromOld.mandatory,true)
  // 已越过强制版本的用户只收到普通更新
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.1')).body.mandatory,false)
  await f.request('/v1/admin/releases/'+forced.id,{mandatory:false},token,'PATCH')
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.0')).body.mandatory,false)
  await f.request('/v1/admin/releases',windowsRelease('2.7.3',{minVersion:'2.7.1'}),token)
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.0')).body.mandatory,true)
  assert.equal((await f.request('/v1/updates/latest?platform=windows&version=2.7.1')).body.mandatory,false)
  // 最低版本不能高于发布版本本身
  assert.equal((await f.request('/v1/admin/releases',windowsRelease('2.7.4',{minVersion:'2.8.0'}),token)).status,400)
})

test('匿名查询按 IP 限流',async t=>{
  const f=await fixture(t,{updateRateLimit:{capacity:3,refillPerMinute:1}})
  for(let i=0;i<3;i++)assert.equal((await f.request('/v1/updates/latest?platform=web&version=2.7.0')).status,200)
  const limited=await f.request('/v1/updates/latest?platform=web&version=2.7.0')
  assert.equal(limited.status,429);assert.match(limited.body.error,/过于频繁/)
  f.tick(60000)
  assert.equal((await f.request('/v1/updates/latest?platform=web&version=2.7.0')).status,200)
})

test('发布管理接口必须管理员登录，普通请求与错误令牌被拒绝',async t=>{
  const f=await fixture(t)
  assert.equal((await f.request('/v1/admin/releases')).status,401)
  assert.equal((await f.request('/v1/admin/releases',windowsRelease('2.7.1'))).status,401)
  assert.equal((await f.request('/v1/admin/releases',null,'forged-token')).status,401)
  assert.equal((await f.request('/v1/admin/releases/00000000-0000-4000-8000-000000000000',{mandatory:true},'forged-token','PATCH')).status,401)
  assert.equal((await f.request('/v1/admin/releases/00000000-0000-4000-8000-000000000000',null,'forged-token','DELETE')).status,401)
})

test('管理员新增、查询、修改、下架、删除发布并写入操作记录',async t=>{
  const f=await fixture(t),token=await f.admin()
  assert.equal((await f.request('/v1/admin/releases',windowsRelease('2.7.1',{sha256:'xyz'}),token)).status,400)
  assert.equal((await f.request('/v1/admin/releases',windowsRelease('2.7.1',{url:'http://example.com/a.exe'}),token)).status,400)
  assert.equal((await f.request('/v1/admin/releases',{...windowsRelease('2.7.1'),platform:'ios'},token)).status,400)
  assert.equal((await f.request('/v1/admin/releases',{platform:'windows',version:'2.7.1',channel:'stable'},token)).status,400)
  const web=await f.request('/v1/admin/releases',{platform:'web',version:'2.7.1',channel:'stable',notes:'网页版更新'},token)
  assert.equal(web.status,200);assert.equal(web.body.item.url,null)
  const store=await f.request('/v1/admin/releases',{platform:'windows-store',version:'2.7.1',channel:'stable',url:'ms-windows-store://pdp/?productid=9NGPL705R5Z3'},token)
  assert.equal(store.status,200)
  const created=await f.request('/v1/admin/releases',windowsRelease('2.7.1'),token)
  assert.equal(created.status,200);const id=created.body.item.id
  assert.equal((await f.request('/v1/admin/releases',windowsRelease('2.7.1'),token)).status,409)
  const list=(await f.request('/v1/admin/releases',null,token)).body.items
  assert.equal(list.length,3)
  assert.deepEqual((await f.request('/v1/admin/releases?platform=windows',null,token)).body.items.map(item=>item.id),[id])
  const changed=await f.request('/v1/admin/releases/'+id,{mandatory:true,notes:'安全修复'},token,'PATCH')
  assert.equal(changed.status,200);assert.equal(changed.body.item.mandatory,true);assert.equal(changed.body.item.notes,'安全修复')
  assert.equal((await f.request('/v1/admin/releases/'+id,{mandatory:'yes'},token,'PATCH')).status,400)
  assert.equal((await f.request('/v1/admin/releases/'+id,{withdrawn:true},token,'PATCH')).body.item.withdrawn,true)
  assert.deepEqual((await f.request('/v1/updates/latest?platform=windows&version=2.7.0')).body,{hasUpdate:false})
  assert.equal((await f.request('/v1/admin/releases/'+id,{withdrawn:false},token,'PATCH')).body.item.withdrawn,false)
  assert.equal((await f.request('/v1/admin/releases/'+id,null,token,'DELETE')).status,200)
  assert.equal((await f.request('/v1/admin/releases/'+id,null,token,'DELETE')).status,404)
  assert.equal((await f.request('/v1/admin/releases/'+id,{mandatory:false},token,'PATCH')).status,404)
  const actions=(await f.request('/v1/admin/overview',null,token)).body.audit.map(row=>row.action)
  for(const action of ['release-create','release-update','release-delete'])assert.ok(actions.includes(action),action)
})

test('发布表新增不影响已有数据，重启后仍可读',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-release-restart-'))
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const env={SEAL_ADMIN_PASSWORD_HASH:scryptSync('admin-secret','seal-admin-v1',32).toString('hex')}
  let cloud=await createCloud({directory:dir,sms:{configured:true,send:async()=>{}},env})
  cloud.db.transaction(()=>cloud.db.run("INSERT INTO releases(id,platform,version,channel,mandatory,published) VALUES('r1','android','2.7.1','stable',0,1)"))
  await cloud.close()
  cloud=await createCloud({directory:dir,sms:{configured:true,send:async()=>{}},env})
  try{assert.equal(cloud.db.one('SELECT version FROM releases WHERE id=?',['r1']).version,'2.7.1')}finally{await cloud.close()}
})
