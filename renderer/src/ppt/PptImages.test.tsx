import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useAppStore, type AppState } from '../store'
import PptEditor from './PptEditor'
import { 创建演示文稿 } from './deck'
import { 解码图片文件 } from './model/imageImport'
vi.mock('./model/imageImport',()=>({ 解码图片文件:vi.fn() }))
const 指纹='a'.repeat(64), 数据='AQID'
afterEach(()=>{Reflect.deleteProperty(window,'electronAPI');vi.clearAllMocks()})
async function 装配() {
  const 添加=vi.fn(async()=>({成功:true,标识:指纹,字节数:3,类型:'image/png'})),写入=vi.fn(async(_模型: unknown)=>({成功:true,数据:'文稿字节'}))
  Object.defineProperty(window,'electronAPI',{configurable:true,value:{
    backupLoad:vi.fn(async()=>({成功:true,内容:null})),recentAdd:vi.fn(async()=>({成功:true})),showSaveDialog:vi.fn(async()=> 'E:\\Temp\\图片测试.pptx'),saveToFile:vi.fn(async()=>({成功:true})),
    presentationResources:{add:添加,read:vi.fn(async()=>({成功:true,数据})),dropTemporary:vi.fn(async()=>({成功:true})),sync:vi.fn(async()=>({成功:true})),release:vi.fn(async()=>({成功:true})),export:vi.fn(async()=>({成功:true,条目:[{标识:指纹,类型:'image/png',数据}]}))},office:{writePptx:写入}
  }})
  vi.mocked(解码图片文件).mockResolvedValue({数据,类型:'image/png',宽:800,高:400})
  let 状态: AppState
  function 入口(){状态=useAppStore();return <PptEditor/>}
  const 视图=render(<AntdApp><AppProvider><入口/></AppProvider></AntdApp>)
  await waitFor(()=>expect(状态.启动恢复结束).toBe(true))
  act(()=>状态.createDoc('ppt',创建演示文稿('图片测试')))
  return { ...视图,添加,写入,读取文稿:()=>状态.演示文档模型[状态.activeDocumentId!] }
}
describe('图片输入与保存闭环',()=>{
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
