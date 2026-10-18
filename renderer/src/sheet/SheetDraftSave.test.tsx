import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, Modal } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider, useAppStore } from '../store'
import { 创建工作表, 写入单元格, 设置数据验证, type Sheet } from './model'
const codec=createRequire(import.meta.url)('../../../main/office/xlsxCodec.js')
afterEach(()=>{Reflect.deleteProperty(window,'electronAPI');Modal.destroyAll()})
function open(source: Sheet) {
  let store!:ReturnType<typeof useAppStore>
  function Host(){store=useAppStore();return <><button onClick={()=>store.createDoc('table',[source],{路径:'E:\\验收\\表格草稿.xlsx'})}>打开草稿</button>{store.module==='table'?<SheetEditor/>:null}</>}
  const view=render(<AntdApp><AppProvider><Host/></AppProvider></AntdApp>);fireEvent.click(screen.getByText('打开草稿'));return {...view,model:()=>store.表格文档模型[store.activeDocumentId!][0]}
}
function bridge(){
  let bytes=''
  const write=vi.fn(async(_path:string,data:string)=>{bytes=data;return {成功:true,文件指纹:'b'.repeat(64)}})
  const encode=vi.fn(async(model:unknown)=>({成功:true,数据:(await codec.写入xlsx(model)).toString('base64')}))
  Object.defineProperty(window,'electronAPI',{configurable:true,value:{backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),backupClear:async()=>({成功:true}),recentAdd:async()=>({成功:true,数据:[]}),saveToFile:write,showSaveDialog:async()=>'E:\\验收\\新草稿.xlsx',office:{writeXlsx:encode}}})
  return {write,encode,bytes:()=>bytes}
}
it.each([false,true])('网格输入未失焦 CtrlS 纳入中文Unicode草稿，另存=%s',async saveAs=>{
  const io=bridge(),view=open(写入单元格(创建工作表('草稿',6,6),'A1','旧文本'))
  fireEvent.doubleClick(view.container.querySelector('[data-地址="A1"]')!)
  const input=view.container.querySelector('.wps-sheet__editor')!,blur=vi.fn();input.addEventListener('blur',blur)
  fireEvent.change(input,{target:{value:'新中文😀𠀀 &<> "完整文本"'}})
  fireEvent.keyDown(input,{key:'s',ctrlKey:true,shiftKey:saveAs})
  await waitFor(()=>expect(io.write).toHaveBeenCalledOnce())
  expect(blur).not.toHaveBeenCalled();expect(document.activeElement).toBe(input)
  expect(view.model().单元格.A1.原始值).toBe('新中文😀𠀀 &<> "完整文本"')
  expect((await codec.读取xlsx(Buffer.from(io.bytes(),'base64'))).html).toContain('新中文😀𠀀 &amp;&lt;&gt; &quot;完整文本&quot;')
})
it('公式栏未回车 CtrlS 使用最新动态公式和完整二维结果',async()=>{
  const io=bridge(),view=open(创建工作表('草稿',6,6)),formula=screen.getByLabelText('公式栏')
  fireEvent.change(formula,{target:{value:'=SEQUENCE(3,2,10)'}})
  fireEvent.keyDown(formula,{key:'s',ctrlKey:true})
  await waitFor(()=>expect(io.write).toHaveBeenCalledOnce())
  expect(view.model().单元格.B3.计算值).toBe(15)
  expect((io.encode.mock.calls[0][0] as any).工作表[0].数据[0][0]).toMatchObject({公式:'SEQUENCE(3,2,10)',结果:10,数组范围:'A1:B3',动态数组:true})
})
it('无效数据验证草稿仍留在输入框，不误保存旧模型或非法值',async()=>{
  const io=bridge(),source=设置数据验证(写入单元格(创建工作表('验证',6,6),'A1','5'),'A1',{类型:'整数',最小值:1,最大值:10,允许空白:false}),view=open(source)
  fireEvent.doubleClick(view.container.querySelector('[data-地址="A1"]')!)
  const input=view.container.querySelector('.wps-sheet__editor')!
  fireEvent.change(input,{target:{value:'999'}});fireEvent.keyDown(input,{key:'s',ctrlKey:true})
  expect((await screen.findAllByText('输入不符合数据验证')).length).toBeGreaterThan(0)
  expect(io.encode).not.toHaveBeenCalled();expect(io.write).not.toHaveBeenCalled();expect(input).toHaveValue('999');expect(view.model().单元格.A1.原始值).toBe('5')
})
