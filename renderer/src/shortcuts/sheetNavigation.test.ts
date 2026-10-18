import { expect, it } from 'vitest'
import { executeSheetNavigation, type SheetKeyboardContext } from './sheetNavigation'
import { 创建工作表, 写入单元格 } from '../sheet/model'
import { dispatchShortcut, saveShortcutOverrides, resetShortcutOverrides } from './shortcuts'
it('可配置的区域跳转按当前边界和选区锚点移动，边缘不越界',()=>{
  let sheet=创建工作表('导航',10,10)
  for(const address of ['B2','C2','D2','G2'])sheet=写入单元格(sheet,address,'1')
  const context:SheetKeyboardContext={sheet,selection:{起点:{行:1,列:1},终点:{行:1,列:1}},select:selection=>{context.selection=selection},edit:()=>{},clear:()=>{}}
  executeSheetNavigation('navigation.extendEdge.right',context)
  expect(context.selection).toEqual({起点:{行:1,列:1},终点:{行:1,列:3}})
  executeSheetNavigation('navigation.extendEdge.right',context)
  expect(context.selection.终点).toEqual({行:1,列:6})
  executeSheetNavigation('navigation.edge.down',context)
  expect(context.selection).toEqual({起点:{行:9,列:1},终点:{行:9,列:1}})
  executeSheetNavigation('navigation.move.down',context)
  expect(context.selection.终点.行).toBe(9)
  executeSheetNavigation('navigation.end',context)
  expect(context.selection.终点).toEqual({行:1,列:6})
})
it('改绑导航与禁止旧按键走同一调度，文本输入控件保留方向键',()=>{
  const commands:string[]=[]
  try{
    saveShortcutOverrides({'sheet:navigation.move.right':['Ctrl+Alt+R']})
    const key=(value:string,init:KeyboardEventInit={})=>new KeyboardEvent('keydown',{key:value,cancelable:true,...init})
    const old=key('ArrowRight');expect(dispatchShortcut(old,'sheet',id=>{commands.push(id)})).toBe(true)
    expect(commands).toEqual([]);expect(old.defaultPrevented).toBe(true)
    expect(dispatchShortcut(key('r',{ctrlKey:true,altKey:true}),'sheet',id=>{commands.push(id)})).toBe(true)
    expect(commands).toEqual(['navigation.move.right'])
  }finally{resetShortcutOverrides()}
})
