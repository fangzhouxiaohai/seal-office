const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createLocalCollaborationFixture } = require('./collaborationFixture.cjs')
const password = '海豹办公 测试🔒Password2026'

test('密码设置要求独立短信验证；密码登录跨设备保留加密数据和恢复能力', async t => {
  const f = await createLocalCollaborationFixture(t, { clients: false }), phone = '13800111901', a = await f.client(phone)
  const owner = a.status().account.id, envelope = a.status().account.envelope
  await a.save({linkId:'password-fixture',name:'密钥保持.txt',data:Buffer.from('稀有字𠮷、emoji🦭、e\u0301').toString('base64')})
  const node = (await a.list())[0], before = await a.download(node.id)
  assert.equal(a.status().account.hasPassword, false)
  await assert.rejects(a.setPassword({password}), /验证/)
  await assert.rejects(a.setPassword({password:'short', code:'123456'}), /15/)
  f.advance(61000); await a.sendCode(null,'password')
  await a.setPassword({password,code:f.codes.get(phone)})
  assert.equal(a.status().account.hasPassword,true)
  const credential = f.cloud.db.one('SELECT * FROM passwords WHERE user_id=?',[owner])
  assert.equal(credential.digest.length,128);assert.equal(credential.salt.length,32)
  assert.equal(fs.readFileSync(path.join(f.directory,'server','seal.sqlite')).includes(Buffer.from(password)),false)
  assert.equal(a.status().account.envelope,envelope);assert.equal(a.status().unlocked,true)
  await a.logout();await assert.rejects(a.loginPassword(phone,password+'!'), /不正确/)
  await a.loginPassword(phone,password);await a.unlock(f.recoveries.get(phone))
  assert.equal((await a.download(node.id)).data,before.data)
  assert.equal(a.status().account.id,owner)
})

test('修改密码撤销其他会话、旧密码失效，错误尝试受限且未注册手机号不会创建账号', async t => {
  const f = await createLocalCollaborationFixture(t,{clients:false}),phone='13800111902',a=await f.client(phone)
  f.advance(61000);await a.sendCode(null,'password');await a.setPassword({password,code:f.codes.get(phone)})
  const b=await f.client(phone),oldToken=f.localState(b).token
  await a.setPassword({password:password+' new',currentPassword:password})
  assert.equal((await f.request('/v1/me',{token:oldToken})).status,401)
  assert.equal((await f.request('/v1/auth/password-login',{method:'POST',data:{phone,password}})).status,401)
  assert.equal((await f.request('/v1/auth/password-login',{method:'POST',data:{phone,password:password+' new'}})).status,200)
  for(let i=0;i<10;i++)assert.equal((await f.request('/v1/auth/password-login',{method:'POST',data:{phone:'13800111999',password}})).status,401)
  assert.equal((await f.request('/v1/auth/password-login',{method:'POST',data:{phone:'13800111999',password}})).status,429)
  assert.equal(f.cloud.db.one('SELECT id FROM users WHERE phone=?',['13800111999']),undefined)
  assert.equal((await f.request('/v1/auth/password',{method:'POST',data:{password}})).status,401)
})

test('短信登录、密码重设的验证码隔离，一次消费且不依赖云空间开通', async t => {
  const f = await createLocalCollaborationFixture(t,{clients:false}),phone='13800111903'
  await f.request('/v1/auth/code',{method:'POST',data:{phone}})
  const login=(await f.request('/v1/auth/login',{method:'POST',data:{phone,code:f.codes.get(phone)}})).body
  f.advance(61000);await f.request('/v1/auth/code',{method:'POST',token:login.token,data:{purpose:'password',phone:'13800111999'}})
  const code=f.codes.get(phone)
  assert.equal((await f.request('/v1/auth/login',{method:'POST',data:{phone,code}})).status,400)
  assert.equal((await f.request('/v1/auth/password',{method:'POST',token:login.token,data:{password,code}})).status,200)
  assert.equal((await f.request('/v1/auth/password',{method:'POST',token:login.token,data:{password,code}})).status,400)
  assert.equal((await f.request('/v1/auth/password-login',{method:'POST',data:{phone,password}})).body.account.enabled,false)
})
