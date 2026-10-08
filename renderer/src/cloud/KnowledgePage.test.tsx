import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {App as AntdApp} from 'antd'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import KnowledgePage from './KnowledgePage'
const cloud=vi.hoisted(()=>({state:{} as any,call:vi.fn(),refresh:vi.fn(async()=>{}),configure:vi.fn()}))
vi.mock('./CloudProvider',()=>({useCloud:()=>cloud,cloudCall:cloud.call}))
beforeEach(()=>{cloud.state={account:{id:'user',enabled:true},unlocked:true};cloud.call.mockReset();cloud.call.mockImplementation(async action=>action==='list'?[{id:'private',kind:'knowledge',parent:null,deleted:0,meta:{name:'机密资料',text:JSON.stringify([{location:'第一节',text:'只有本人的私有内容'}])}}]:{items:[]})})
describe('知识库权限与来源',()=>{
  it('退出后的延迟读取结果不会重新显示私有内容',async()=>{
    let finish:(value:any)=>void=()=>{}
    cloud.call.mockImplementation(async action=>action==='list'?new Promise(resolve=>{finish=resolve}):{items:[]})
    const view=render(<AntdApp><KnowledgePage/></AntdApp>)
    await waitFor(()=>expect(cloud.call).toHaveBeenCalledWith('list'))
    cloud.state={account:null,unlocked:false};view.rerender(<AntdApp><KnowledgePage/></AntdApp>)
    finish([{id:'late',kind:'knowledge',deleted:0,meta:{name:'迟到的私有文档'}}])
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'迟到的私有文档'})).not.toBeInTheDocument())
  })
  it('全部知识提问会检索私有资料并在发送前展示授权',async()=>{
    render(<AntdApp><KnowledgePage/></AntdApp>);await screen.findByRole('heading',{name:'机密资料'})
    fireEvent.change(screen.getByRole('textbox',{name:'知识库问题'}),{target:{value:'只有本人的私有内容'}})
    fireEvent.click(screen.getByRole('button',{name:/^提\s*问$/}))
    const dialog=await screen.findByRole('dialog',{name:'本次在线 AI 资料授权'})
    expect(within(dialog).getByText(/只有本人的私有内容/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button',{name:/^取\s*消$/}))
  })
  it('退出账号后不保留上一账号的私有卡片和原文',async()=>{
    const view=render(<AntdApp><KnowledgePage/></AntdApp>);await screen.findByRole('heading',{name:'机密资料'})
    fireEvent.click(screen.getAllByRole('button',{name:'阅读与提问'}).slice(-1)[0])
    expect(await screen.findByText('只有本人的私有内容')).toBeInTheDocument()
    cloud.state={account:null,unlocked:false};view.rerender(<AntdApp><KnowledgePage/></AntdApp>)
    await waitFor(()=>expect(screen.queryByText('只有本人的私有内容')).not.toBeInTheDocument());expect(screen.queryByRole('heading',{name:'机密资料'})).not.toBeInTheDocument()
  })
  it('选定文档提问先展示资料授权，取消时不调用 AI',async()=>{
    render(<AntdApp><KnowledgePage/></AntdApp>);await screen.findByRole('heading',{name:'机密资料'})
    fireEvent.click(screen.getAllByRole('button',{name:'阅读与提问'}).slice(-1)[0])
    fireEvent.change(screen.getByRole('textbox',{name:'知识库问题'}),{target:{value:'资料有哪些内容？'}})
    fireEvent.click(screen.getByRole('button',{name:/^提\s*问$/}))
    const dialog=await screen.findByRole('dialog',{name:'本次在线 AI 资料授权'});expect(within(dialog).getByText(/只有本人的私有内容/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button',{name:/^取\s*消$/}));expect(cloud.call.mock.calls.some(([action])=>action==='question')).toBe(false)
  })
})
