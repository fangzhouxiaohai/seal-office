import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {App as AntdApp} from 'antd'
import {afterEach,expect,it,vi} from 'vitest'
import {webcrypto} from 'node:crypto'
import {AppProvider,useAppStore,type AppState} from '../store'
import {saveShortcutOverrides,resetShortcutOverrides} from '../shortcuts/shortcuts'
import {创建演示文稿} from './deck'
import {创建图形} from './model/elements'
import PptEditor from './PptEditor'
afterEach(()=>{resetShortcutOverrides();Reflect.deleteProperty(window,'electronAPI');vi.unstubAllGlobals()})
it('实际画布的微移、改绑、复制、删除、撤销及只读锁定保持一致',async()=>{
  vi.stubGlobal('crypto',webcrypto)
  Object.defineProperty(window,'electronAPI',{configurable:true,value:{backupLoad:async()=>({成功:true,内容:null})}})
  let state!:AppState
  const Entry=()=>{state=useAppStore();return <PptEditor/>}
  const {container}=render(<AntdApp><AppProvider><Entry/></AppProvider></AntdApp>)
  await waitFor(()=>expect(state.启动恢复结束).toBe(true))
  const deck=创建演示文稿('对象键盘'),shape=创建图形('矩形');deck.幻灯片列表[0].对象列表=[shape]
  act(()=>state.createDoc('ppt',deck))
  const read=()=>state.演示文档模型[state.activeDocumentId!].幻灯片列表[0]
  const select=(id:string)=>{fireEvent.mouseDown(container.querySelector(`.wps-ppt-canvas [data-对象标识="${id}"]`)!,{button:0});fireEvent.mouseUp(window)}
  select(shape.id);fireEvent.keyDown(document,{key:'ArrowRight'});expect(read().对象列表![0].x).toBe(shape.x+1)
  saveShortcutOverrides({'ppt:object.nudge.right':['Ctrl+Alt+R']})
  fireEvent.keyDown(document,{key:'ArrowRight'});expect(read().对象列表![0].x).toBe(shape.x+1)
  fireEvent.keyDown(document,{key:'r',ctrlKey:true,altKey:true});expect(read().对象列表![0].x).toBe(shape.x+2)
  fireEvent.keyDown(document,{key:'d',ctrlKey:true});expect(read().对象列表).toHaveLength(2)
  const cloned=read().对象列表![1]
  expect(cloned.id).not.toBe(shape.id)
  fireEvent.keyDown(document,{key:'Delete'});expect(read().对象列表).toHaveLength(1)
  fireEvent.keyDown(document,{key:'z',ctrlKey:true});expect(read().对象列表).toHaveLength(2)
  fireEvent.click(screen.getByRole('button',{name:'复制幻灯片'}))
  expect(state.演示文档模型[state.activeDocumentId!].幻灯片列表).toHaveLength(2)
  act(()=>state.更新演示文档模型(state.activeDocumentId!,{...state.演示文档模型[state.activeDocumentId!],定稿:{时间:new Date().toISOString()}}))
  const original=read();fireEvent.keyDown(document,{key:'Delete'});expect(read()).toBe(original)
})
