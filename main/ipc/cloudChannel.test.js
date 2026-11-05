const {注册云端通道}=require('./cloudChannel')
describe('云服务地址仅由主进程管理',()=>{
  it('状态隐藏地址，并拒绝旧客户端修改服务地址的命令',async()=>{
    const handle=vi.fn(),setServer=vi.fn()
    注册云端通道({handle},{cloudService:{setServer,status:()=>({url:'https://private.example/api',account:null,pending:0})}})
    const invoke=handle.mock.calls[0][1]
    expect(await invoke({},'status')).toEqual({成功:true,数据:{account:null,pending:0}})
    expect(await invoke({},'server',{url:'https://other.example/api'})).toEqual({成功:false,错误:'云端操作不受支持'})
    expect(setServer).not.toHaveBeenCalled()
  })
  it('创建分享链接时向界面返回可复制的完整地址',async()=>{
    const handle=vi.fn(),id='11111111-1111-4111-8111-111111111111',nodeId='22222222-2222-4222-8222-222222222222'
    注册云端通道({handle},{cloudService:{
      status:()=>({url:'https://cloud.example.test/api',account:{id:'owner'}}),
      list:async()=>[{id:nodeId,version:1,deleted:0,meta:{name:'测试文档',filename:'测试文档.docx'}}],
      keyFor:()=>Buffer.alloc(32,7),
      request:async()=>({id,nodeId,expiresAt:null,requiresCode:false,downloads:0,created:1}),
    }})
    const invoke=handle.mock.calls[0][1]
    const result=await invoke({},'shareLinkCreate',{id,nodeId})
    expect(result.成功).toBe(true)
    expect(result.数据.url).toMatch(/^https:\/\/cloud\.example\.test\/share\/#\/s\/11111111-1111-4111-8111-111111111111\?a=.+&k=.+$/)
    expect(result.数据.name).toBe('测试文档.docx')
  })
})
