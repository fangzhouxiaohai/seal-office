import {render,screen,fireEvent,waitFor,within} from '@testing-library/react'
import {App as AntdApp} from 'antd'
import {describe,it,expect,vi,beforeEach} from 'vitest'
import CloudFilesPage from './CloudFilesPage'
const fixture=vi.hoisted(()=>({call:vi.fn(),configure:vi.fn(),refresh:vi.fn(),enabled:true,locale:'zh-CN'}))
vi.mock('../store',()=>({useAppStore:()=>({})}))
vi.mock('../store/settingsStore',()=>({useSettings:()=>({语言:fixture.locale})}))
vi.mock('./CloudProvider',()=>({cloudCall:fixture.call,useCloud:()=>({state:{account:{id:'test',enabled:fixture.enabled,quota:300000000,used:200000},unlocked:fixture.enabled},refresh:fixture.refresh,configure:fixture.configure})}))
const nodes=[
  {id:'folder',parent:null,kind:'folder',deleted:0,version:0,meta:{name:'测试文件夹'},updated:10},
  {id:'child-folder',parent:'folder',kind:'folder',deleted:0,version:0,meta:{name:'子文件夹'},updated:11},
  {id:'file',parent:null,kind:'file',deleted:0,version:3,meta:{name:'长文件名工作汇报.docx'},updated:20},
  {id:'child',parent:'folder',kind:'file',deleted:0,version:1,meta:{name:'内部资料.pdf'},updated:30},
  {id:'trash-folder',parent:null,kind:'folder',deleted:1,version:0,meta:{name:'回收文件夹'},updated:40},
  {id:'trash',parent:'trash-folder',kind:'file',deleted:1,version:1,meta:{name:'回收站资料.pptx'},updated:40}
]
beforeEach(()=>{localStorage.clear();fixture.enabled=true;fixture.locale='zh-CN';fixture.call.mockReset();fixture.call.mockImplementation(async(action)=>action==='list'?nodes:action==='pending'?[]:{});fixture.configure.mockClear()})
describe('云空间网盘浏览与真实操作',()=>{
  it('进入文件夹、面包屑返回、搜索与网格/列表切换保留数据',async()=>{
    render(<AntdApp><CloudFilesPage/></AntdApp>)
    fireEvent.click(await screen.findByRole('button',{name:'测试文件夹'}))
    expect(screen.getByRole('button',{name:'内部资料.pdf'})).toBeInTheDocument()
    window.dispatchEvent(new Event('seal-before-native-back',{cancelable:true}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'长文件名工作汇报.docx'})).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button',{name:'列表视图'}))
    expect(screen.getByRole('button',{name:'列表视图'})).toHaveAttribute('aria-pressed','true')
    fireEvent.change(screen.getByRole('textbox',{name:'搜索云文件'}),{target:{value:'内部'}})
    expect(screen.getByRole('button',{name:'内部资料.pdf'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'长文件名工作汇报.docx'})).not.toBeInTheDocument()
  })
  it('更多菜单的移动操作排除自身及子孙目录，批量删除实际调用接口',async()=>{
    render(<AntdApp><CloudFilesPage/></AntdApp>)
    fireEvent.click(await screen.findByRole('button',{name:'更多操作 测试文件夹'}))
    fireEvent.click(await screen.findByText('移动'))
    const dialog=await screen.findByRole('dialog')
    fireEvent.mouseDown(within(dialog).getByRole('combobox'))
    expect(screen.queryByRole('option',{name:'测试文件夹'})).not.toBeInTheDocument()
    expect(screen.queryByRole('option',{name:'子文件夹'})).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button',{name:/Cancel|取消/}))
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox',{name:'选择 长文件名工作汇报.docx'}))
    fireEvent.click(screen.getByRole('button',{name:/删\s*除/}))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:/OK|确定/}))
    await waitFor(()=>expect(fixture.call).toHaveBeenCalledWith('remove',{id:'file'}))
  })
  it('回收站包含原来位于子目录的文件，英文界面不改写文件名',async()=>{
    fixture.locale='en-US'
    render(<AntdApp><CloudFilesPage trash/></AntdApp>)
    expect(await screen.findByRole('button',{name:'回收站资料.pptx'})).toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Cloud recycle bin'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'More actions for 回收站资料.pptx'}))
    fireEvent.click(await screen.findByText('Restore'))
    await waitFor(()=>expect(fixture.call).toHaveBeenCalledWith('restore',{id:'trash'}))
  })
  it('未开通账号能够打开登录入口',()=>{
    fixture.enabled=false
    render(<AntdApp><CloudFilesPage/></AntdApp>)
    fireEvent.click(screen.getByRole('button',{name:'登录并开通云空间'}))
    expect(fixture.configure).toHaveBeenCalledOnce()
  })
  it('永久删除同时选中的父文件夹与子项只向服务器提交一次树删除',async()=>{
    render(<AntdApp><CloudFilesPage trash/></AntdApp>)
    await screen.findByRole('button',{name:'回收文件夹'})
    fireEvent.click(screen.getByRole('checkbox',{name:'全选云文件'}))
    fireEvent.click(screen.getByRole('button',{name:'彻底删除'}))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:/OK|确定/}))
    await waitFor(()=>expect(fixture.call).toHaveBeenCalledWith('remove',{id:'trash-folder',destroy:true}))
    expect(fixture.call).not.toHaveBeenCalledWith('remove',{id:'trash',destroy:true})
  })
})
describe('云空间加载与预览',()=>{
  it('读取文件列表期间显示统一加载动画',async()=>{
    let finish:(v:any)=>void=()=>{}
    fixture.call.mockImplementation((action)=>action==='list'?new Promise(resolve=>{finish=resolve}):Promise.resolve([]))
    render(<AntdApp><CloudFilesPage/></AntdApp>)
    expect(screen.getByRole('status').textContent).toContain('正在读取云空间文件')
    finish(nodes)
    expect(await screen.findByRole('button',{name:'长文件名工作汇报.docx'})).toBeInTheDocument()
    expect(screen.queryByText('正在读取云空间文件…')).not.toBeInTheDocument()
  })
  it('点击图片文件进入预览，菜单提供预览入口',async()=>{
    const withImage=[...nodes,{id:'photo',parent:null,kind:'file',deleted:0,version:1,meta:{name:'现场照片.png'},updated:50}]
    ;(URL as any).createObjectURL=vi.fn(()=>'blob:x');(URL as any).revokeObjectURL=vi.fn()
    fixture.call.mockImplementation(async(action)=>action==='list'?withImage:action==='pending'?[]:action==='rawDownload'?{name:'现场照片.png',data:btoa('png')}:{})
    render(<AntdApp><CloudFilesPage/></AntdApp>)
    fireEvent.click(await screen.findByRole('button',{name:'现场照片.png'}))
    expect(await screen.findByRole('img',{name:'现场照片.png'})).toBeInTheDocument()
    expect(fixture.call).toHaveBeenCalledWith('rawDownload',{id:'photo',version:undefined})
    expect(fixture.call).not.toHaveBeenCalledWith('download',expect.anything())
  })
})
