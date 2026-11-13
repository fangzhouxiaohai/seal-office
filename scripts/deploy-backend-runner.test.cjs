const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { verifyFrozen, atomicSwitch, compatibleLock, probe, assertSystemd, waitReady } = require('./deploy-backend-runner.cjs')

test('逐文件验证摘要并拒绝额外文件及路径穿越', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-backend-test-'))
  try {
    fs.writeFileSync(path.join(dir,'index.cjs'),'x')
    const manifest=[{path:'index.cjs',sha256:crypto.createHash('sha256').update('x').digest('hex')}]
    assert.doesNotThrow(() => verifyFrozen(dir,manifest))
    fs.writeFileSync(path.join(dir,'extra.cjs'),'x')
    assert.throws(() => verifyFrozen(dir,manifest),/额外/)
    assert.throws(() => verifyFrozen(dir,[{path:'../unsafe',sha256:'a'.repeat(64)}]),/路径/)
  } finally { fs.rmSync(dir,{recursive:true,force:true}) }
})
test('仅项目版本差异可复用依赖，依赖版本或完整性差异拒绝', () => {
  const one={version:'2.1.1',lockfileVersion:3,packages:{'':{version:'2.1.1',dependencies:{a:'1'}},'node_modules/a':{version:'1',integrity:'sha512-safe'}}}
  const two=structuredClone(one);two.version='2.7.2';two.packages[''].version='2.7.2'
  assert.equal(compatibleLock(one,two),true)
  two.packages['node_modules/a'].integrity='sha512-other'
  assert.equal(compatibleLock(one,two),false)
})
test('仅支持当前活动的单机 systemd 服务及预期运行目录',()=>{
  assert.doesNotThrow(()=>assertSystemd({MainPID:'123',ActiveState:'active',FragmentPath:'/etc/systemd/system/seal-cloud.service'},'/site/releases/old','/site/releases/old'))
  assert.throws(()=>assertSystemd({MainPID:'0',ActiveState:'inactive',FragmentPath:'/etc/systemd/system/seal-cloud.service'},'/site/releases/old','/site/releases/old'),/systemd/)
  assert.throws(()=>assertSystemd({MainPID:'123',ActiveState:'active',FragmentPath:'/tmp/other'},'/site/releases/old','/site/releases/old'),/systemd/)
  assert.throws(()=>assertSystemd({MainPID:'123',ActiveState:'active',FragmentPath:'/etc/systemd/system/seal-cloud.service'},'/site/releases/other','/site/releases/old'),/目录/)
})
test('服务短暂未就绪时重试并成功，超时仍报告失败',async()=>{
  let calls=0
  assert.equal(await waitReady(async()=>{if(++calls<3)throw Error('502');return 'ready'},{timeout:500,interval:5}),'ready')
  assert.equal(calls,3)
  await assert.rejects(waitReady(async()=>{throw Error('持续不可用')},{timeout:20,interval:5}),/持续不可用/)
})
test('就绪探针无响应时也在总时限内停止',async()=>{
  const start=Date.now()
  await assert.rejects(waitReady(()=>new Promise(()=>{}),{timeout:50,interval:5}),/超时/)
  assert(Date.now()-start<1000)
})
test('公网只读探针验证后台摘要、拒绝未授权及新旧客户端更新响应', async () => {
  const html='<html>后台</html>', calls=[]
  const fetcher=async url=>{
    calls.push(url)
    if(url.includes('/seal-admin/profile')||url.includes('/api/v1/admin/overview'))return new Response('',{status:401})
    if(url.includes('/updates/latest'))return Response.json({hasUpdate:false})
    if(url.includes('/capabilities'))return Response.json({version:1})
    return new Response(html,{headers:{'content-type':'text/html'}})
  }
  const result=await probe('2.7.2',{fetcher,homeHash:crypto.createHash('sha256').update(html).digest('hex')})
  assert.equal(calls.filter(x=>x.includes('/updates/latest')).length,12)
  assert.equal(Object.keys(result).length,12)
  await assert.rejects(probe('2.7.2',{fetcher,homeHash:'0'.repeat(64)}),/后台首页/)
})
test('指针原子切换仅接受预期基线，并保留 previous-release', { skip: process.platform === 'win32' ? '需在 Linux 服务器隔离目录验证真实符号链接' : false }, () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'seal-backend-switch-'))
  try {
    fs.mkdirSync(path.join(root,'releases','old'),{recursive:true});fs.mkdirSync(path.join(root,'releases','new'),{recursive:true})
    fs.symlinkSync(path.join(root,'releases','old'),path.join(root,'current'),'dir');fs.writeFileSync(path.join(root,'previous-release'),'历史备份')
    assert.throws(() => atomicSwitch(root,'releases/not-old','releases/new'),/变化/)
    atomicSwitch(root,'releases/old','releases/new')
    assert.equal(fs.realpathSync(path.join(root,'current')),path.join(root,'releases','new'))
    assert.equal(fs.readFileSync(path.join(root,'previous-release'),'utf8'),'历史备份')
  } finally { fs.rmSync(root,{recursive:true,force:true}) }
})
