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
})
