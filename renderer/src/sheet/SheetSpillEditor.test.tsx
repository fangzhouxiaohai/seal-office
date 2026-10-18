import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, Modal } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider, useAppStore } from '../store'
import { 创建工作表, 写入单元格, type Sheet } from './model'
import { SHORTCUT_STORAGE_KEY, saveShortcutOverrides } from '../shortcuts/shortcuts'
function open(source?: Sheet) {
  let store: ReturnType<typeof useAppStore>
  function Host() {
    store=useAppStore()
    return <><button onClick={()=>store.createDoc('table',[source ?? 写入单元格(创建工作表('数组',6,6),'A1','=SEQUENCE(2,2)')])}>打开数组</button>{store.module==='table'?<SheetEditor/>:null}</>
  }
  const result=render(<AntdApp><AppProvider><Host/></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开数组'))
  return {...result,model:()=>store!.表格文档模型[store!.activeDocumentId!][0]}
}
afterEach(()=>{localStorage.removeItem(SHORTCUT_STORAGE_KEY);Modal.destroyAll()})
describe('real Sheet spill editor behavior',()=>{
  it('shows a read-only child formula, refuses double-click, F2, typing and partial deletion',async()=>{
    const view=open(), child=view.container.querySelector('[data-地址="B2"]')!
    expect(child).toHaveAttribute('aria-readonly','true')
    fireEvent.mouseDown(child)
    expect(screen.getByLabelText('公式栏')).toHaveValue('=SEQUENCE(2,2)')
    expect(screen.getByLabelText('公式栏')).toHaveAttribute('readonly')
    expect(screen.getByRole('status')).toHaveTextContent('动态数组结果来自 A1')
    fireEvent.doubleClick(child)
    const grid=view.container.querySelector('.wps-sheet')!
    fireEvent.keyDown(grid,{key:'F2'});fireEvent.keyDown(grid,{key:'9'});fireEvent.keyDown(grid,{key:'Delete'})
    expect(view.container.querySelector('.wps-sheet__editor')).toBeNull()
    expect(view.model().单元格.B2.计算值).toBe(4)
    await waitFor(()=>expect(screen.getAllByText(/请编辑锚点 A1/).length).toBeGreaterThan(0))
  })
  it('edits the anchor and undo/redo restores the whole recalculated range',()=>{
    const view=open(), anchor=view.container.querySelector('[data-地址="A1"]')!
    fireEvent.doubleClick(anchor)
    const input=view.container.querySelector('.wps-sheet__editor')!
    fireEvent.change(input,{target:{value:'=SEQUENCE(3,2,10)'}});fireEvent.keyDown(input,{key:'Enter'})
    expect(view.model().单元格.B3.计算值).toBe(15)
    const grid=view.container.querySelector('.wps-sheet')!
    fireEvent.keyDown(grid,{key:'z',ctrlKey:true})
    expect(view.model().单元格.B2.计算值).toBe(4);expect(view.model().单元格.B3).toBeUndefined()
    fireEvent.keyDown(grid,{key:'y',ctrlKey:true})
    expect(view.model().单元格.B3.计算值).toBe(15)
  })
  it('deleting the anchor clears the full derived region without deleting a neighboring input',()=>{
    const source=写入单元格(写入单元格(创建工作表('数组',6,6),'A1','=SEQUENCE(2,2)'),'D2','保留')
    const view=open(source)
    fireEvent.mouseDown(view.container.querySelector('[data-地址="A1"]')!)
    fireEvent.keyDown(view.container.querySelector('.wps-sheet')!,{key:'Delete'})
    expect(view.model().单元格.A1).toBeUndefined();expect(view.model().单元格.B2).toBeUndefined();expect(view.model().单元格.D2.原始值).toBe('保留')
  })
  it('disabled/rebound navigation keys have no hidden legacy fallback and the new binding works',()=>{
    saveShortcutOverrides({'sheet:navigation.move.right':[],'sheet:navigation.edit':['Ctrl+Alt+E']})
    const view=open(),grid=view.container.querySelector('.wps-sheet')!
    fireEvent.keyDown(grid,{key:'ArrowRight'});expect(screen.getByLabelText('名称框')).toHaveValue('A1')
    fireEvent.keyDown(grid,{key:'F2'});expect(view.container.querySelector('.wps-sheet__editor')).toBeNull()
    fireEvent.keyDown(grid,{key:'e',ctrlKey:true,altKey:true});expect(view.container.querySelector('.wps-sheet__editor')).not.toBeNull()
  })
  it('lets users explicitly switch WPS/Excel calculation semantics and undo that choice',()=>{
    const view=open(写入单元格(创建工作表('Unicode',6,6),'A1','=LEN("😀")'))
    const select=screen.getByLabelText('公式兼容模式')
    expect(view.model().单元格.A1.计算值).toBe(1)
    fireEvent.change(select,{target:{value:'WPS'}})
    expect(view.model().公式兼容模式).toBe('WPS');expect(view.model().单元格.A1.计算值).toBe(2)
    fireEvent.keyDown(view.container.querySelector('.wps-sheet')!,{key:'z',ctrlKey:true})
    expect(view.model().公式兼容模式).toBeUndefined();expect(view.model().单元格.A1.计算值).toBe(1)
  })
})
