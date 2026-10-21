import {act,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import CloudAutosave from './CloudAutosave'
import {flushCloudBeforeClose} from './autosaveLifecycle'
import {restoreFileBinding} from '../collaboration/fileAccess'
import {创建工作表,写入单元格} from '../sheet/model'
import {创建演示文稿,创建文本框} from '../ppt/deck'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),native=require('../../../main/office/sealFormat.js')
const fixture=vi.hoisted(()=>({store:{} as any,state:{} as any,call:vi.fn(),refresh:vi.fn(async()=>{})}))
vi.mock('../store',()=>({useAppStore:()=>fixture.store}))
vi.mock('./CloudProvider',()=>({useCloud:()=>({state:fixture.state,refresh:fixture.refresh,configure:vi.fn()}),cloudCall:fixture.call}))
vi.mock('../ipc/bridge',()=>({桥接:{presentationResources:{export:vi.fn(async()=>({成功:true,条目:[]}))},office:{writeDocx:vi.fn(async()=>({成功:true,数据:'UEs='})),writeSeal:vi.fn(async(type:string,model:unknown)=>{const {createRequire}=await import('node:module');const codec=createRequire(import.meta.url)('../../../main/office/sealFormat.js');return {成功:true,数据:(await codec.writeSeal(type,model)).toString('base64')}})}}}))
beforeEach(()=>{
  vi.useFakeTimers();fixture.call.mockReset();fixture.call.mockImplementation(async(action,input)=>action==='save'?{id:input.linkId,statuses:{[input.linkId]:'离线待同步'}}:{})
  fixture.state={account:{id:'user',enabled:true,autosave:true},unlocked:true,statuses:{}}
  fixture.store={module:'word',activeWorkspaceTabId:'word',documents:[{id:'word',name:'资料.docx',html:'<p>原内容</p>'}],workspaceTabs:[{id:'word',type:'word',dirty:true}],pdfDocuments:[],文档路径:{},表格文档模型:{},演示文档模型:{}}
})
afterEach(()=>{vi.useRealTimers()})
describe('云端自动保存关闭链路',()=>{
  it('更换账号后不会继承上一账号的快照去重状态',async()=>{
    const view=render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose()})
    fixture.call.mockClear();fixture.state={...fixture.state,account:{id:'other-user',enabled:true,autosave:true}}
    view.rerender(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose()})
    expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(1)
  })
  it('TXT 自动快照保留空行及原始换行，JSON 不转成编辑器对象',async()=>{
    fixture.store={...fixture.store,documents:[{id:'word',name:'资料.txt',html:'<p data-seal-line-ending="crlf" data-seal-break="crlf">甲</p><p data-seal-break="crlf"><br></p><p>乙</p>'}]}
    const view=render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose()})
    expect(atob(fixture.call.mock.calls.find(([action])=>action==='save')![1].data)).toBe(String.fromCharCode(...new TextEncoder().encode('甲\r\n\r\n乙')))
    fixture.call.mockClear();fixture.store={...fixture.store,documents:[{id:'word',name:'资料.json',html:'<p>{"name":"seal"}</p>'}]};view.rerender(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose()})
    expect(JSON.parse(atob(fixture.call.mock.calls.find(([action])=>action==='save')![1].data))).toEqual({name:'seal'})
  })
  it('防抖结束前退出也保留最后一次修改，重复关闭检查不重复排队',async()=>{
    const view=render(<CloudAutosave/>);
    fixture.store={...fixture.store,documents:[{...fixture.store.documents[0],html:'<p>最后一次修改</p>'}]};view.rerender(<CloudAutosave/>);
    await act(async()=>{await flushCloudBeforeClose()})
    const saves=fixture.call.mock.calls.filter(([action])=>action==='save')
    expect(saves).toHaveLength(1);expect(saves[0][1]).toMatchObject({automatic:true,queueOnly:true,name:'资料.docx'})
    await act(async()=>{await flushCloudBeforeClose();await vi.advanceTimersByTimeAsync(2000)})
    expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(1)
  })
  it('默认关闭和关闭自动保存后，编辑及退出检查都不上传',async()=>{
    fixture.state={...fixture.state,account:{...fixture.state.account,autosave:false}}
    render(<CloudAutosave/>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(2000);await flushCloudBeforeClose()})
    expect(fixture.call).not.toHaveBeenCalled()
  })
  it('已打开未修改的 PDF 不上传，修改后退出保留编辑字节',async()=>{
    fixture.store={...fixture.store,module:'pdf',documents:[],activeWorkspaceTabId:'pdf',workspaceTabs:[{id:'pdf',type:'pdf',dirty:false}],pdfDocuments:[{id:'pdf',name:'原件.pdf',path:'D:/原件.pdf',data:'JVBERi0='}]}
    const view=render(<CloudAutosave/>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(2000);await flushCloudBeforeClose()});expect(fixture.call).not.toHaveBeenCalled()
    fixture.store={...fixture.store,workspaceTabs:[{id:'pdf',type:'pdf',dirty:true}],pdfDocuments:[{...fixture.store.pdfDocuments[0],data:'JVBERi1lZGl0'}]};view.rerender(<CloudAutosave/>);
    await act(async()=>{await flushCloudBeforeClose()})
    expect(fixture.call).toHaveBeenCalledWith('save',expect.objectContaining({linkId:'D:/原件.pdf',data:'JVBERi1lZGl0',queueOnly:true}))
  })
  it.each(['share','team'] as const)('%s 的海豹 PDF 只走整文件共享同步，不另上传个人自动副本',async(kind)=>{
    const path=`D:/${kind}-隔离.spdf`
    restoreFileBinding(path,{kind,id:kind,nodeId:kind==='team'?'node':undefined,accountId:'user',name:'共享.spdf',version:1,editable:true})
    fixture.store={...fixture.store,module:'pdf',documents:[],activeWorkspaceTabId:'pdf',workspaceTabs:[{id:'pdf',type:'pdf',dirty:true}],pdfDocuments:[{id:'pdf',name:'共享.spdf',path,data:'JVBERi1lZGl0'}]}
    const view=render(<CloudAutosave/>)
    await act(async()=>{await vi.advanceTimersByTimeAsync(2000);await flushCloudBeforeClose()})
    expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(0)
    expect(view.container).toBeEmptyDOMElement()
  })
  it('撤销到磁盘原文后仍同步恢复版本，并只刷新指定关闭标签',async()=>{
    const view=render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose('word')})
    fixture.call.mockClear();fixture.store={...fixture.store,documents:[{...fixture.store.documents[0],html:'<p>磁盘原文</p>'}],workspaceTabs:[{id:'word',type:'word',dirty:false}]};view.rerender(<CloudAutosave/>);
    await act(async()=>{await flushCloudBeforeClose('other')});expect(fixture.call).not.toHaveBeenCalled()
    await act(async()=>{await flushCloudBeforeClose('word')});expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(1)
  })
  it('未失焦表格草稿仅在防抖/关闭边界采集，使用同步返回的模型生成真实 SLXLS',async()=>{
    vi.useRealTimers()
    const before=[创建工作表('一表',10,6),写入单元格(创建工作表('二表',10,6),'A1','第二表𠮷')],after=[写入单元格(before[0],'A1','正在输入𠮷🦭'),before[1]],prepare=vi.fn(()=>({成功:true,表格文档模型:{table:after},演示文档模型:{}}))
    fixture.store={...fixture.store,module:'table',activeWorkspaceTabId:'table',草稿版本:0,准备编辑草稿:prepare,documents:[{id:'table',type:'table',name:'资料.slxls',html:''}],workspaceTabs:[{id:'table',type:'table',dirty:false}],表格文档模型:{table:before}}
    const view=render(<CloudAutosave/>);expect(prepare).not.toHaveBeenCalled()
    fixture.store={...fixture.store,草稿版本:1};view.rerender(<CloudAutosave/>);expect(prepare).not.toHaveBeenCalled()
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,2000));await flushCloudBeforeClose('table')})
    const saves=fixture.call.mock.calls.filter(([action])=>action==='save');expect(saves).toHaveLength(1)
    const decoded=await native.readSeal('slxls',Buffer.from(saves[0][1].data,'base64'));expect(decoded.工作表列表).toEqual(after);expect(prepare).toHaveBeenCalledWith('table')
    await act(async()=>{await flushCloudBeforeClose('table')});expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(1)
  })
  it('IME 或验证失败草稿暂停自动快照，显示原因，后续合法输入可以重试',async()=>{
    vi.useRealTimers()
    const sheets=[创建工作表('资料',10,6)],prepare=vi.fn<any,any>(()=>({成功:false,标识:'table',错误:'请完成输入法候选后再保存'}))
    fixture.store={...fixture.store,module:'table',activeWorkspaceTabId:'table',草稿版本:0,准备编辑草稿:prepare,documents:[{id:'table',type:'table',name:'资料.slxls',html:''}],workspaceTabs:[{id:'table',type:'table',dirty:false}],表格文档模型:{table:sheets}}
    const view=render(<CloudAutosave/>);fixture.store={...fixture.store,草稿版本:1};view.rerender(<CloudAutosave/>)
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1900));await flushCloudBeforeClose('table')})
    expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(0);expect(screen.getByRole('status')).toHaveTextContent('请完成输入法候选后再保存')
    prepare.mockImplementation(()=>({成功:true,表格文档模型:{table:[写入单元格(sheets[0],'A1','输入完成')]},演示文档模型:{}}));fixture.store={...fixture.store,草稿版本:2};view.rerender(<CloudAutosave/>)
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,2000));await flushCloudBeforeClose('table')})
    expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(1);expect(screen.queryByText('请完成输入法候选后再保存')).not.toBeInTheDocument()
  })
  it('关闭检查采集未失焦演示文字，直接采用同步返回模型写入 SLPPT',async()=>{
    vi.useRealTimers();const before=创建演示文稿('草稿.slppt'),after=structuredClone(before)
    after.幻灯片列表[0].文本框列表=[{...创建文本框(40,40,600,100,'未失焦草稿𠮷🦭'),加粗:true,颜色:'#123456'}]
    fixture.store={...fixture.store,module:'ppt',activeWorkspaceTabId:'ppt',草稿版本:0,准备编辑草稿:()=>({成功:true,表格文档模型:{},演示文档模型:{ppt:after}}),documents:[{id:'ppt',type:'ppt',name:'草稿.slppt',html:''}],workspaceTabs:[{id:'ppt',type:'ppt',dirty:false}],演示文档模型:{ppt:before}}
    render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose('ppt')})
    const save=fixture.call.mock.calls.find(([action])=>action==='save')!;expect(save).toBeDefined()
    expect((await native.readSeal('slppt',Buffer.from(save[1].data,'base64'))).演示文稿).toEqual(after)
  })
  it('未挂载的后台表格和演示没有草稿处理器时仍保留完整模型并写入云快照',async()=>{
    vi.useRealTimers();const sheets=[写入单元格(创建工作表('后台表',10,6),'A1','后台𠮷🦭')],deck=创建演示文稿('后台.slppt')
    deck.幻灯片列表[0].文本框列表=[创建文本框(40,40,600,100,'后台演示𠮷🦭')]
    fixture.store={...fixture.store,module:'home',activeWorkspaceTabId:'home',准备编辑草稿:()=>({成功:true,表格文档模型:{},演示文档模型:{}}),documents:[{id:'table',type:'table',name:'后台.slxls',html:''},{id:'ppt',type:'ppt',name:'后台.slppt',html:''}],workspaceTabs:[{id:'table',type:'table',dirty:true},{id:'ppt',type:'ppt',dirty:true}],表格文档模型:{table:sheets},演示文档模型:{ppt:deck}}
    render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose()})
    const saves=fixture.call.mock.calls.filter(([action])=>action==='save');expect(saves).toHaveLength(2)
    expect((await native.readSeal('slxls',Buffer.from(saves.find(([,input])=>input.name==='后台.slxls')![1].data,'base64'))).工作表列表).toEqual(sheets)
    expect((await native.readSeal('slppt',Buffer.from(saves.find(([,input])=>input.name==='后台.slppt')![1].data,'base64'))).演示文稿).toEqual(deck)
  })
  it('SPDF 自动云快照保留完整 PDF 字节，正文不变而来源记录更新时仍写出新版本',async()=>{
    vi.useRealTimers();const pdf=await require('pdf-lib').PDFDocument.create();pdf.addPage();const data=Buffer.from(await pdf.save()).toString('base64'),warnings=['原始 OFD 转换来源记录']
    fixture.store={...fixture.store,module:'pdf',documents:[],activeWorkspaceTabId:'pdf',workspaceTabs:[{id:'pdf',type:'pdf',dirty:true}],pdfDocuments:[{id:'pdf',name:'资料.spdf',path:'D:/个人/资料.spdf',data,警告:warnings}]}
    const view=render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose('pdf')})
    const save=fixture.call.mock.calls.find(([action])=>action==='save')!;expect(save).toBeDefined();expect(await native.readSeal('spdf',Buffer.from(save[1].data,'base64'))).toMatchObject({PDF数据:data,警告:warnings})
    const nextWarnings=[...warnings,'同一 PDF 新增的来源记录𠮷'];fixture.store={...fixture.store,workspaceTabs:[{id:'pdf',type:'pdf',dirty:false}],pdfDocuments:[{...fixture.store.pdfDocuments[0],警告:nextWarnings}]};view.rerender(<CloudAutosave/>)
    await act(async()=>{await flushCloudBeforeClose('pdf')})
    const saves=fixture.call.mock.calls.filter(([action])=>action==='save');expect(saves).toHaveLength(2);expect(await native.readSeal('spdf',Buffer.from(saves[1][1].data,'base64'))).toMatchObject({PDF数据:data,警告:nextWarnings})
  })
})
