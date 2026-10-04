import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useAppStore, type AppState } from '../store'
import PptEditor from './PptEditor'
import { 创建演示文稿 } from './deck'
import { 解码图片文件 } from './model/imageImport'
import { 标记放映开始 } from './presentationState'
vi.mock('./model/imageImport',()=>({ 解码图片文件:vi.fn() }))
const 指纹='a'.repeat(64), 数据='AQID'
afterEach(()=>{Reflect.deleteProperty(window,'electronAPI');vi.clearAllMocks();vi.unstubAllGlobals()})
async function 装配() {
  const 添加=vi.fn(async()=>({成功:true,标识:指纹,字节数:3,类型:'image/png'})),写入=vi.fn(async(_模型: unknown)=>({成功:true,数据:'文稿字节'}))
  Object.defineProperty(window,'electronAPI',{configurable:true,value:{
    backupLoad:vi.fn(async()=>({成功:true,内容:null})),recentAdd:vi.fn(async()=>({成功:true})),showSaveDialog:vi.fn(async()=> 'E:\\Temp\\图片测试.pptx'),saveToFile:vi.fn(async()=>({成功:true})),
    enterSlideshowFullscreen:vi.fn(async()=>({成功:true,会话标识:'测试放映'})),exitSlideshowFullscreen:vi.fn(async()=>({成功:true})),onSlideshowEnded:vi.fn(()=>()=>{}),
    presentationResources:{add:添加,read:vi.fn(async()=>({成功:true,数据})),dropTemporary:vi.fn(async()=>({成功:true})),sync:vi.fn(async()=>({成功:true})),release:vi.fn(async()=>({成功:true})),export:vi.fn(async()=>({成功:true,条目:[{标识:指纹,类型:'image/png',数据}]}))},office:{writePptx:写入}
  }})
  vi.mocked(解码图片文件).mockResolvedValue({数据,类型:'image/png',宽:800,高:400})
  let 状态: AppState
  function 入口(){状态=useAppStore();return <PptEditor/>}
  const 视图=render(<AntdApp><AppProvider><入口/></AppProvider></AntdApp>)
  await waitFor(()=>expect(状态.启动恢复结束).toBe(true))
  act(()=>状态.createDoc('ppt',创建演示文稿('图片测试')))
  return { ...视图,添加,写入,状态:()=>状态,读取文稿:()=>状态.演示文档模型[状态.activeDocumentId!] }
}
describe('图片输入与保存闭环',()=>{
  it('放映对话框焦点下图片粘贴不修改后台正文',async()=>{
    const {读取文稿,添加}=await 装配(),之前=读取文稿()
    fireEvent.keyDown(document,{key:'F5'})
    const 放映=await screen.findByRole('dialog',{name:'幻灯片放映'})
    fireEvent.paste(放映,{clipboardData:{files:[new File(['字节'],'图片.png')]}})
    await act(async()=>{})
    expect(添加).not.toHaveBeenCalled();expect(读取文稿()).toEqual(之前)
  })
  it.each(['放映','预览'])('图片处理中进入%s中止并释放暂存资源',async 场景=>{
    const {读取文稿,添加}=await 装配(),之前=读取文稿()
    let 完成!: (值:{成功:boolean;标识:string;字节数:number;类型:string})=>void
    添加.mockImplementationOnce(()=>new Promise<{成功:boolean;标识:string;字节数:number;类型:string}>(resolve=>{完成=resolve}))
    fireEvent.paste(document.body,{clipboardData:{files:[new File(['字节'],'图片.png')]}})
    await waitFor(()=>expect(添加).toHaveBeenCalled())
    let 释放:(()=>void)|undefined
    if(场景==='放映') { fireEvent.keyDown(document,{key:'F5'});await screen.findByRole('dialog',{name:'幻灯片放映'}) }
    else act(()=>{释放=标记放映开始()})
    try {
      await act(async()=>完成({成功:true,标识:指纹,字节数:3,类型:'image/png'}))
      expect(await screen.findByText('图片处理期间已进入放映或预览，请返回编辑后重新插入')).toBeInTheDocument()
      expect(读取文稿()).toEqual(之前)
      expect(window.electronAPI!.presentationResources!.dropTemporary).toHaveBeenCalledWith(指纹)
    } finally { if(释放) act(释放) }
  })
  it('共享预览活动期间图片粘贴不启动解码',async()=>{
    const {读取文稿,添加}=await 装配(),之前=读取文稿()
    let 释放!:()=>void;act(()=>{释放=标记放映开始()})
    try {fireEvent.paste(document.body,{clipboardData:{files:[new File(['字节'],'图片.png')]}});await act(async()=>{});expect(添加).not.toHaveBeenCalled();expect(读取文稿()).toEqual(之前)}
    finally {act(释放)}
  })
  it('处理期间正文变动或开启只读均中止，释放暂存引用',async()=>{
    const {读取文稿,添加,状态}=await 装配()
    let 完成!: (值: {成功:boolean;标识:string;字节数:number;类型:string})=>void
    添加.mockImplementationOnce(()=>new Promise<{成功:boolean;标识:string;字节数:number;类型:string}>(resolve=>{完成=resolve}))
    fireEvent.change(screen.getByLabelText('选择图片文件'),{target:{files:[new File(['字节'],'图片.png')]}})
    await waitFor(()=>expect(添加).toHaveBeenCalled())
    const 当前=读取文稿(),更新={...当前,name:'期间编辑'}
    act(()=>状态().更新演示文档模型(状态().activeDocumentId!,更新))
    await act(async()=>完成({成功:true,标识:指纹,字节数:3,类型:'image/png'}))
    expect(await screen.findByText('图片处理期间文稿已变化，请重新插入')).toBeInTheDocument()
    expect(读取文稿()).toEqual(更新)
    expect(window.electronAPI!.presentationResources!.dropTemporary).toHaveBeenCalledWith(指纹)
  })
  it.each(['只读','删除页面','切换文档'])('处理期间%s中止，既有编辑保持且暂存资源释放',async 场景=>{
    const {读取文稿,添加,状态}=await 装配()
    let 完成!: (值:{成功:boolean;标识:string;字节数:number;类型:string})=>void
    添加.mockImplementationOnce(()=>new Promise<{成功:boolean;标识:string;字节数:number;类型:string}>(resolve=>{完成=resolve}))
    fireEvent.change(screen.getByLabelText('选择图片文件'),{target:{files:[new File(['字节'],'图片.png')]}})
    await waitFor(()=>expect(添加).toHaveBeenCalled())
    if(场景==='只读') await userEvent.click(screen.getByRole('checkbox',{name:'只读查看'}))
    else if(场景==='删除页面') act(()=>状态().更新演示文档模型(状态().activeDocumentId!,{...读取文稿(),幻灯片列表:[],当前索引:0}))
    else act(()=>状态().createDoc('ppt',创建演示文稿('另一文档')))
    const 保留=读取文稿()
    await act(async()=>完成({成功:true,标识:指纹,字节数:3,类型:'image/png'}))
    expect(await screen.findByText(场景==='只读'?'图片处理期间已开启只读，请关闭只读后重新插入':场景==='切换文档'?'图片处理期间文档已切换，请重新插入':'图片处理期间文稿已变化，请重新插入')).toBeInTheDocument()
    expect(读取文稿()).toEqual(保留)
    expect(window.electronAPI!.presentationResources!.dropTemporary).toHaveBeenCalledWith(指纹)
  })
  it('右键图片粘贴读取真实系统剪贴板并走图片校验',async()=>{
    const {读取文稿,container}=await 装配()
    const 读取=vi.fn(async()=>[{types:['image/png'],getType:async()=>new Blob(['字节'],{type:'image/png'})}])
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:读取}})
    fireEvent.contextMenu(container.querySelector('.wps-ppt-canvas')!,{clientX:100,clientY:100})
    await userEvent.click(screen.getByText('粘贴图片'))
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(1))
    expect(读取).toHaveBeenCalledTimes(1)
  })
  it('按钮与页面主体焦点接收图片粘贴，输入框保持原生粘贴',async()=>{
    const {读取文稿,添加}=await 装配(),文件=new File(['字节'],'图片.png')
    fireEvent.paste(screen.getByRole('button',{name:'保存'}),{clipboardData:{files:[文件]}})
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(1))
    fireEvent.paste(document.body,{clipboardData:{files:[文件]}})
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(2))
    fireEvent.paste(screen.getByLabelText('宽度'),{clipboardData:{files:[文件]}})
    expect(添加).toHaveBeenCalledTimes(2)
  })
  it('选择取消不改变正文，相同字节复用资源，原生保存提交真实字节',async()=>{
    const {读取文稿,添加,写入}=await 装配(),输入=screen.getByLabelText('选择图片文件'),之前=JSON.stringify(读取文稿())
    fireEvent.change(输入,{target:{files:[]}})
    expect(JSON.stringify(读取文稿())).toBe(之前);expect(添加).not.toHaveBeenCalled()
    const 文件=new File(['字节'],'图片.png',{type:'image/png'})
    fireEvent.change(输入,{target:{files:[文件]}})
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(1))
    fireEvent.change(输入,{target:{files:[文件]}})
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(2))
    expect(Object.keys(读取文稿().资源索引!)).toEqual([指纹])
    await userEvent.click(screen.getByRole('button',{name:'保存'}))
    await waitFor(()=>expect(写入).toHaveBeenCalled())
    expect(写入.mock.calls[0][0]).toMatchObject({资源条目:[{标识:指纹,类型:'image/png',数据}],幻灯片:[{对象列表:[{width:720,height:360,资源标识:指纹},{width:720,height:360,资源标识:指纹}]}]})
  })
  it('粘贴和拖入走同一校验，坏图片弹窗报告且正文不变',async()=>{
    const {读取文稿,添加,container}=await 装配(),舞台=container.querySelector('.wps-ppt-stage')!,文件=new File(['字节'],'图片.png')
    fireEvent.paste(舞台,{clipboardData:{files:[文件]}})
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(1))
    fireEvent.drop(舞台,{dataTransfer:{files:[文件]}})
    await waitFor(()=>expect(读取文稿().幻灯片列表[0].对象列表).toHaveLength(2))
    const 之前=JSON.stringify(读取文稿())
    vi.mocked(解码图片文件).mockRejectedValueOnce(new Error('图片压缩数据损坏'))
    fireEvent.drop(舞台,{dataTransfer:{files:[文件]}})
    expect(await screen.findByText('图片压缩数据损坏')).toBeInTheDocument()
    expect(JSON.stringify(读取文稿())).toBe(之前);expect(添加).toHaveBeenCalledTimes(2)
  })
  it('属性尺寸和图层操作可撤销，非法裁剪不能提交，只读禁用输入',async()=>{
    const {读取文稿}=await 装配(),输入=screen.getByLabelText('选择图片文件')
    fireEvent.change(输入,{target:{files:[new File(['字节'],'图片.png')]}})
    await waitFor(()=>expect(screen.getByLabelText('宽度')).toBeInTheDocument())
    const 宽度=screen.getByLabelText('宽度');fireEvent.change(宽度,{target:{value:'420'}});fireEvent.blur(宽度)
    expect(读取文稿().幻灯片列表[0].对象列表![0].width).toBe(420)
    await userEvent.click(screen.getByRole('button',{name:'撤销'}))
    expect(读取文稿().幻灯片列表[0].对象列表![0].width).toBe(720)
    const 左=screen.getByLabelText('左裁剪');fireEvent.change(左,{target:{value:'110'}});fireEvent.blur(左)
    expect(await screen.findByText('图片裁剪范围无效')).toBeInTheDocument()
    expect(读取文稿().幻灯片列表[0].对象列表![0].裁剪).toBeUndefined()
    await userEvent.click(screen.getByRole('checkbox',{name:'只读查看'}))
    expect(screen.getByLabelText('宽度')).toBeDisabled()
  })
})
