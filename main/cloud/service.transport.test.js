const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {createService}=require('./service')
const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()}
let directory
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'seal-cloud-transport-'))})
afterEach(()=>{
  const target=path.resolve(directory)
  if(!target.startsWith(path.resolve(os.tmpdir())+path.sep+'seal-cloud-transport-'))throw new Error('测试目录越界')
  fs.rmSync(target,{recursive:true,force:true})
})
describe('云端自定义传输与桌面 HTTP 的会话行为一致',()=>{
  it('401 清除账号并持久保存失效会话',async()=>{
    const transport=async url=>{if(url.endsWith('/v1/auth/login'))return {token:'test-token',account:{id:'test-user',enabled:true}};throw Object.assign(new Error('登录已过期'),{status:401})}
    const service=createService({directory,safeStorage,transport})
    await service.login('test-phone','000000')
    await expect(service.refresh()).rejects.toThrow('登录已过期')
    expect(service.status().account).toBeNull()
    expect(createService({directory,safeStorage,transport}).status().account).toBeNull()
  })
  it('关闭自动保存中止仍在传输的请求',async()=>{
    let started,requestSignal
    const ready=new Promise(resolve=>{started=resolve})
    const transport=async(url,options)=>{
      if(url.endsWith('/v1/auth/login'))return {token:'test-token',account:{id:'test-user',enabled:true,autosave:true}}
      if(url.endsWith('/v1/space/autosave'))return {ok:true}
      requestSignal=options.signal;started()
      return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('已取消')),{once:true}))
    }
    const service=createService({directory,safeStorage,transport})
    await service.login('test-phone','000000')
    const inFlight=service.request('/v1/long-request').catch(error=>error)
    await ready;await service.setAutosave(false)
    expect(requestSignal.aborted).toBe(true)
    expect((await inFlight).message).toBe('已取消')
    expect(service.status().account.autosave).toBe(false)
  })
})
