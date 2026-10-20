import { createContext, useContext } from 'react'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider, useAppStore } from '../store'
import { restoreFileBinding } from '../collaboration/fileAccess'
import { getRealtimeClient } from '../collaboration/useRealtimeDocument'
import { 创建工作表, 批量写入单元格 } from './model'
import { 提取协作工作簿, 校验协作工作簿 } from './sheetRealtimeSource'
import { 导出为Xlsx } from './sheetExport'

const TestCloud=createContext<any>(null)
vi.mock('../cloud/CloudProvider',async()=>{
  const actual=await vi.importActual<Record<string,unknown>>('../cloud/CloudProvider')
  return {...actual,useCloud:()=>useContext(TestCloud)}
})
const require=createRequire(import.meta.url),Module=require('node:module'),load=Module._load,codec=require('../../../main/office/xlsxCodec.js')
let fixtureFactory:any
try {Module._load=function(id:string,...args:any[]){const result=load.call(this,id,...args);return id==='node:worker_threads'?{...result,isMainThread:true}:result};fixtureFactory=require('../../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture}finally{Module._load=load}
let fixture:any,originalCrypto:PropertyDescriptor|undefined,views:Array<ReturnType<typeof render>>=[],sessions:Array<()=>ReturnType<typeof getRealtimeClient>>=[]
beforeEach(async()=>{
  originalCrypto=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto})
  Object.defineProperty(window,'electronAPI',{configurable:true,value:{backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),backupClear:async()=>({成功:true})}})
  fixture=await fixtureFactory();fixture.cloud.server.prependListener('request',(_request:unknown,response:any)=>response.setHeader('Connection','close'))
},60000)
afterEach(async()=>{
  // A React unmount deliberately starts asynchronous session shutdown. Wait for
  // HTTP synchronization and leave before closing this in-process test server,
  // so requests from one test cannot time out inside the following test.
  await Promise.all(sessions.map(async read=>{const client=read();if(client){await client.sync().catch(()=>{});await client.close()}}));sessions=[]
  for(const view of views)view.unmount();views=[]
  await fixture?.cleanup();if(originalCrypto)Object.defineProperty(globalThis,'crypto',originalCrypto);Reflect.deleteProperty(window,'electronAPI')
})
async function openPair(){
  const team=await fixture.a.teamCreate({name:'表格真实协作'})
  const invite=await fixture.a.teamInvite({id:team.id,recipientPhone:'13800111002',role:'editor'});await fixture.b.teamAccept({credential:invite.credential})
  const saved=await fixture.a.teamSave({id:team.id,name:'动态表格.xlsx',data:Buffer.from('existing file').toString('base64')})
  const initial=批量写入单元格(创建工作表('动态协作',6,8),{A1:'1',B1:'2',C1:'原文😀',D1:'=SEQUENCE(2,1,A1+B1)'})
  const open=(service:any,name:string)=>{
    const account=service.status().account,path=`E:\\fixture\\${name}.xlsx`,state:{store?:ReturnType<typeof useAppStore>;offline:boolean}={offline:false}
    restoreFileBinding(path,{kind:'team',id:team.id,nodeId:saved.id,version:saved.version??1,name:'动态表格.xlsx',editable:true,accountId:account.id})
    const cloud={state:{account,unlocked:true},call:(action:string,input:unknown)=>state.offline&&!['realtimeRestore','realtimeQueue','realtimeStage','realtimeState'].includes(action)?Promise.reject(new Error('模拟真实网络断开')):Promise.resolve().then(()=>service[action](input))}
    function Host(){state.store=useAppStore();return <><button onClick={()=>state.store!.createDoc('table',[initial],{路径:path})}>打开{name}</button>{state.store.module==='table'?<SheetEditor/>:null}</>}
    const view=render(<TestCloud.Provider value={cloud}><AntdApp><AppProvider><Host/></AppProvider></AntdApp></TestCloud.Provider>);views.push(view);fireEvent.click(within(view.container).getByText('打开'+name))
    const client=()=>getRealtimeClient(state.store!.activeDocumentId!)!;sessions.push(client)
    return {...view,state,client,model:()=>state.store!.表格文档模型[state.store!.activeDocumentId!]}
  }
  const a=open(fixture.a,'甲'),b=open(fixture.b,'乙')
  await act(async()=>{await Promise.all([a.client().ready,b.client().ready])})
  const settle=async()=>{await act(async()=>{for(let i=0;i<3;i++)await Promise.all([a.client().sync(),b.client().sync()])})}
  const edit=(view:typeof a,address:string,value:string,commit=false)=>{fireEvent.doubleClick(view.container.querySelector(`[data-地址="${address}"]`)!);const input=view.container.querySelector('.wps-sheet__editor')!;fireEvent.change(input,{target:{value}});if(commit)fireEvent.keyDown(input,{key:'Enter'});return input}
  return {a,b,settle,edit,team}
}

it('实际两个编辑器不同单元格并发、溢出重算及本机撤销保留远端操作，真实XLSX导出一致',async()=>{
  const {a,b,settle,edit}=await openPair()
  edit(a,'A1','10',true);edit(b,'B1','20',true);await settle()
  for(const view of[a,b]){expect(view.model()[0].单元格.D2.计算值).toBe(31);expect(view.client().current[0].单元格.D2).toBeUndefined();expect(view.client().current[0].单元格.D1.计算值).toBeUndefined()}
  expect(导出为Xlsx(a.model())).toEqual(导出为Xlsx(b.model()))
  const exported=await codec.读取xlsx(await codec.写入xlsx(导出为Xlsx(a.model())))
  expect(exported.工作表列表[0].元数据.公式来源.D1).toMatchObject({动态数组:true,数组范围:'D1:D2',结果:30,数组缓存:{D2:31}})
  fireEvent.keyDown(a.container.querySelector('.wps-sheet')!,{key:'z',ctrlKey:true});await settle()
  expect(a.model()[0].单元格.A1.原始值).toBe('1');expect(a.model()[0].单元格.B1.原始值).toBe('20');expect(a.model()[0].单元格.D2.计算值).toBe(22)
  expect(导出为Xlsx(a.model())).toEqual(导出为Xlsx(b.model()))
},60000)

it('网格中文IME期间远端同格插入不覆盖草稿，完成后Unicode并发合并；断网重连保留双方输入',async()=>{
  const {a,b,settle,edit}=await openPair()
  fireEvent.doubleClick(a.container.querySelector('[data-地址="C1"]')!);const composing=a.container.querySelector('.wps-sheet__editor')!
  fireEvent.compositionStart(composing);fireEvent.change(composing,{target:{value:'本地原文😀𠀀'}})
  expect(a.client().current[0].单元格.C1.原始值).toBe('原文😀')
  edit(b,'C1','原远端文😀',true);await settle()
  expect(composing).toHaveValue('本地原文😀𠀀')
  fireEvent.compositionEnd(composing);fireEvent.keyDown(composing,{key:'Enter'});await settle()
  expect(a.model()[0].单元格.C1.原始值).toContain('本地');expect(a.model()[0].单元格.C1.原始值).toContain('远端');expect(a.model()[0].单元格.C1.原始值).toContain('😀𠀀');expect(a.model()[0].单元格.C1.原始值).not.toContain('�')
  b.state.offline=true;edit(b,'E1','离线😀',true)
  await expect(b.client().sync()).rejects.toThrow('模拟真实网络断开')
  edit(a,'F1','在线𠀀',true);await act(async()=>{await a.client().flush()})
  b.state.offline=false;await settle()
  for(const view of[a,b]){expect(view.model()[0].单元格.E1.原始值).toBe('离线😀');expect(view.model()[0].单元格.F1.原始值).toBe('在线𠀀')}
  expect(导出为Xlsx(a.model())).toEqual(导出为Xlsx(b.model()))
},60000)

it('协作源过滤保留独立格式和未知公式缓存，拒绝混合日期基准及无界远端网格',()=>{
  const source=批量写入单元格(创建工作表('过滤',6,6),{A1:'=SEQUENCE(2,2)'})
  source.单元格.B2.格式={加粗:true};source.单元格.D1={原始值:'=_xlfn.FUTURE()',显示值:'1',格式:{},公式来源:{原始值:'=_xlfn.FUTURE()',结果:1,动态数组:true,数组范围:'D1:D2',数组缓存:{D2:0}}}
  const stripped=提取协作工作簿([source])
  expect(stripped[0].单元格.B1).toBeUndefined();expect(stripped[0].单元格.B2).toEqual({原始值:'',显示值:'',格式:{加粗:true}})
  expect(stripped[0].单元格.D1.公式来源?.数组缓存).toEqual({D2:0});expect(校验协作工作簿(stripped)).toBeNull()
  expect(校验协作工作簿([source,{...source,id:'other',日期系统1904:true}])).toContain('日期基准')
  expect(校验协作工作簿([{...source,行数:100000,列数:100000}])).toContain('安全显示范围')
  expect(screen.queryByText('unused')).toBeNull()
})

it('公式栏IME与同格远端输入合并不丢字，权限降级后网格和公式栏只读',async()=>{
  const {a,b,settle,edit,team}=await openPair(),formula=within(a.container).getByLabelText('公式栏')
  fireEvent.mouseDown(a.container.querySelector('[data-地址="C1"]')!)
  fireEvent.compositionStart(formula);fireEvent.change(formula,{target:{value:'公式栏原文😀本地'}})
  edit(b,'C1','原远端文😀',true);await settle();expect(formula).toHaveValue('公式栏原文😀本地')
  fireEvent.compositionEnd(formula);await settle()
  expect(a.model()[0].单元格.C1.原始值).toContain('本地');expect(a.model()[0].单元格.C1.原始值).toContain('远端')
  expect(formula).toHaveValue(a.model()[0].单元格.C1.原始值)
  await act(async()=>{await fixture.a.teamUpdateMember({id:team.id,userId:fixture.b.status().account.id,role:'viewer'});await b.client().sync()})
  expect(within(b.container).getByLabelText('公式栏')).toHaveAttribute('readonly')
  const before=b.model()[0].单元格.A1.原始值
  fireEvent.doubleClick(b.container.querySelector('[data-地址="A1"]')!);fireEvent.keyDown(b.container.querySelector('.wps-sheet')!,{key:'9'})
  expect(b.container.querySelector('.wps-sheet__editor')).toBeNull();expect(b.model()[0].单元格.A1.原始值).toBe(before)
},60000)
