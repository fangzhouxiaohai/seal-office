const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {createService}=require('./service')
const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:value=>value.toString()}
let directory
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'seal-cloud-deleted-'))})
afterEach(()=>{
  const target=path.resolve(directory)
  if(!target.startsWith(path.resolve(os.tmpdir())+path.sep+'seal-cloud-deleted-'))throw new Error('测试目录越界')
  fs.rmSync(target,{recursive:true,force:true})
})

// 模拟云服务节点与上传会话，便于复现“云端文件已被删除”后再次保存的链路。
function 建立传输(){
  const 节点=new Map(),上传=new Map(),创建记录=[]
  let envelope
  const 失败=(状态,消息)=>Object.assign(new Error(消息),{status:状态})
  const 解析=请求=>{if(!请求.body||!请求.body.length)return {};return JSON.parse(请求.body.toString())}
  const transport=async(url,请求={})=>{
    const 方法=(请求.method||'GET').toUpperCase(),纯=url.replace(/^https?:\/\/[^/]+/,'').replace(/^\/api(?=\/v1\/)/,'')
    if(纯==='/v1/auth/login')return {token:'测试令牌',account:{id:'用户',enabled:false,autosave:true,used:0,quota:10**9}}
    if(纯==='/v1/space/enable'){envelope=解析(请求).envelope;return {id:'用户',enabled:true,autosave:true,used:0,quota:10**9,envelope}}
    if(纯==='/v1/me')return {id:'用户',enabled:true,autosave:true,used:0,quota:10**9,envelope}
    if(纯==='/v1/nodes'&&方法==='GET')return {items:[...节点.values()]}
    if(纯==='/v1/nodes'&&方法==='POST'){const 数据=解析(请求);if(节点.has(数据.id))throw 失败(409,'已存在');节点.set(数据.id,{id:数据.id,kind:数据.kind,meta:数据.meta});创建记录.push(数据.id);return {id:数据.id}}
    if(纯==='/v1/uploads'&&方法==='POST'){const 数据=解析(请求);if(!节点.has(数据.nodeId))throw 失败(404,'云文件不存在或已删除');const id='up'+上传.size;上传.set(id,{id,nodeId:数据.nodeId,offset:0});return {id,offset:0}}
    if(/^\/v1\/uploads\/[^/]+$/.test(纯)&&方法==='PUT'){const id=纯.split('/').pop(),会话=上传.get(id);if(!会话)throw 失败(404,'上传会话不存在');会话.offset=请求.body.length;return {offset:会话.offset}}
    if(/^\/v1\/uploads\/[^/]+\/commit$/.test(纯)){const id=纯.split('/')[3],会话=上传.get(id);if(!会话||!节点.has(会话.nodeId))throw 失败(404,'云文件不存在或已删除');return {version:1,used:100}}
    if(/^\/v1\/uploads\/[^/]+$/.test(纯)&&方法==='DELETE')return {ok:true}
    throw new Error('未预期的请求：'+方法+' '+纯)
  }
  return {transport,节点,创建记录}
}

describe('云端文件被删除后的再次保存',()=>{
  it('旧云文件已删除时报告失败并保留待同步；清除旧映射后按新文件重新上传',async()=>{
    const {transport,节点,创建记录}=建立传输()
    const service=createService({directory,safeStorage,transport})
    await service.login('13800000000','000000')
    await service.enable(true)
    const 第一次=await service.save({linkId:'D:/资料/文档.docx',name:'文档.docx',data:Buffer.from('第一版内容').toString('base64'),automatic:true,queueOnly:false})
    expect(创建记录).toHaveLength(1)
    expect(service.pending()).toHaveLength(0)
    // 用户在云端删除该文件
    节点.clear()
    const 失败=await service.save({linkId:'D:/资料/文档.docx',name:'文档.docx',data:Buffer.from('第二版内容').toString('base64'),automatic:true,queueOnly:false})
    expect(失败.id).toBe(第一次.id)
    expect(失败.statuses[失败.id]).toContain('云文件不存在或已删除')
    expect(service.pending()).toHaveLength(1)
    // 客户端清除失效节点后重新保存，应按新文件上传且队列清空
    await service.forget('D:/资料/文档.docx')
    const 重建=await service.save({linkId:'D:/资料/文档.docx',name:'文档.docx',data:Buffer.from('第二版内容').toString('base64'),automatic:true,queueOnly:false})
    expect(重建.id).not.toBe(第一次.id)
    expect(创建记录).toHaveLength(2)
    expect(service.pending()).toHaveLength(0)
    expect(重建.statuses[重建.id]).toBe('云端已保存')
  })

  it('其他上传错误仍如实报告，不重复创建云文件',async()=>{
    let 拒绝=false
    const {transport,创建记录}=建立传输()
    const 包装=async(url,请求)=>{
      if(拒绝&&url.endsWith('/v1/uploads')&&(请求.method||'GET')==='POST')throw Object.assign(new Error('云空间不足'),{status:413})
      return transport(url,请求)
    }
    const service=createService({directory,safeStorage,transport:包装})
    await service.login('13800000000','000000')
    await service.enable(true)
    await service.save({linkId:'D:/资料/文档.docx',name:'文档.docx',data:Buffer.from('第一版').toString('base64'),automatic:true,queueOnly:false})
    拒绝=true
    const 结果=await service.save({linkId:'D:/资料/文档.docx',name:'文档.docx',data:Buffer.from('第二版').toString('base64'),automatic:true,queueOnly:false})
    expect(结果.statuses[结果.id]).toBe('云空间不足')
    expect(创建记录).toHaveLength(1)
    expect(service.pending()).toHaveLength(1)
  })
})
