const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {createService}=require('./service')
const safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:bytes=>bytes.toString()}
let directory
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'seal-ai-identity-'))})
afterEach(()=>{const resolved=path.resolve(directory);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'seal-ai-identity-'))throw Error('测试目录越界');fs.rmSync(resolved,{recursive:true,force:true})})

it('匿名无模型前核验；已验证手机号且未开云空间可用，每次检查服务器会话并只返回非个人信息凭据',async()=>{
  let revoked=false,identityCalls=0
  const transport=vi.fn(async url=>{
    if(url.endsWith('/v1/auth/login'))return {token:'token',account:{id:'account',phone:'138****2801',enabled:false,identityVerified:true}}
    if(url.endsWith('/v1/ai/identity')){identityCalls++;if(revoked)throw Object.assign(Error('会话已撤销'),{status:401});return {accountId:'account',verified:true,method:'phone',phone:'should-not-escape'}}
    throw Error('Unexpected route')
  })
  const service=createService({directory,safeStorage,transport})
  await expect(service.requireAIIdentity()).rejects.toMatchObject({status:401,code:'AI_IDENTITY_REQUIRED'})
  expect(transport).not.toHaveBeenCalled()
  await service.login('13800112801','123456')
  expect(await service.requireAIIdentity()).toEqual({accountId:'account',verified:true,method:'phone'})
  expect(await service.requireAIIdentity()).toEqual({accountId:'account',verified:true,method:'phone'})
  expect(identityCalls).toBe(2)
  revoked=true
  await expect(service.requireAIIdentity()).rejects.toMatchObject({status:401,code:'AI_IDENTITY_REQUIRED'})
  expect(service.status().account).toBeNull()
})

it.each(['unverified','wrong-account','wrong-method','offline','old-server'])('本机已登录缓存不能绕过服务端 %s 状态',async mode=>{
  const transport=async url=>{
    if(url.endsWith('/v1/auth/login'))return {token:'token',account:{id:'account',enabled:false,identityVerified:true}}
    if(mode==='offline')throw Error('网络不可用')
    if(mode==='old-server')throw Object.assign(Error('接口不存在'),{status:404})
    return {accountId:mode==='wrong-account'?'other':'account',verified:mode!=='unverified',method:mode==='wrong-method'?'entered-phone':'phone'}
  }
  const service=createService({directory,safeStorage,transport})
  await service.login('13800112801','123456')
  await expect(service.requireAIIdentity()).rejects.toThrow()
})

it('核验期间退出或切换会话，不接受迟到的已认证结果',async()=>{
  let resolve
  const transport=async url=>{
    if(url.endsWith('/v1/auth/login'))return {token:'token',account:{id:'account',enabled:false}}
    if(url.endsWith('/v1/ai/identity'))return new Promise(done=>{resolve=done})
    if(url.endsWith('/v1/auth/logout'))return {ok:true}
    throw Error('Unexpected route')
  }
  const service=createService({directory,safeStorage,transport})
  await service.login('13800112801','123456')
  const pending=service.requireAIIdentity()
  await service.logout()
  resolve({accountId:'account',verified:true,method:'phone'})
  await expect(pending).rejects.toMatchObject({status:401,code:'AI_IDENTITY_REQUIRED'})
})
