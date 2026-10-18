const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { createService } = require('./service'), { parseCredential } = require('./collaboration')
describe('协作能力与入口配置', () => {
  let directory
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-collab-client-')) })
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }))
  it('旧服务器没有协作能力时明确失败，不生成共享或伪造成功', async () => {
    const calls = [], service = createService({ directory, defaultUrl: 'http://localhost:5180/api', transport: async url => { calls.push(url); return { version: 1 } } })
    await expect(service.shareList()).rejects.toThrow('尚未开通协作接口'); expect(calls).toEqual(['http://localhost:5180/api/v1/capabilities'])
    expect(() => parseCredential('share', 'https://wrong.test/?token=anything')).toThrow('凭证格式无效')
  })
  it('账号转换拒绝未登录、未授权及旧服务器，转换传输保留110秒超时并不发送额外字段',async()=>{
    const calls=[],safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()},input={inputFormat:'doc',outputFormat:'docx',type:'word',data:Buffer.from('原文').toString('base64'),consent:true}
    let enabled=false,supported=true
    const service=createService({directory,safeStorage,transport:async(url,options)=>{calls.push({url,...options});if(url.endsWith('/v1/auth/login'))return{token:'session',account:{id:'user',enabled}};if(url.endsWith('/v1/capabilities'))return{version:1,accountConversion:supported?1:undefined};if(url.endsWith('/v1/conversion/convert'))return{data:input.data,outputFormat:'docx'};return{protocol:'seal-office-converter/1'}}})
    await expect(service.convertDocument(input)).rejects.toThrow('登录');await service.login('phone','code');await expect(service.convertDocument(input)).rejects.toThrow('开通')
    enabled=true;await service.login('phone','code');await expect(service.convertDocument({...input,consent:false})).rejects.toThrow('授权');await expect(service.convertDocument({...input,outputFormat:'docm'})).rejects.toThrow('格式')
    supported=false;await expect(service.convertDocument(input)).rejects.toThrow('尚未支持');supported=true
    expect(await service.convertDocument({...input,route:'/internal/config',token:'must-not-forward'})).toEqual({data:input.data,outputFormat:'docx'})
    const request=calls.findLast(item=>item.url.endsWith('/v1/conversion/convert'));expect(request.timeout).toBe(110000);expect(JSON.parse(request.body.toString())).toEqual(input);expect(request.headers.Authorization).toBe('Bearer session')
  })
})
