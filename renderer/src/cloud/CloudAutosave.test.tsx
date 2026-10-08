import {act,render} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import CloudAutosave from './CloudAutosave'
import {flushCloudBeforeClose} from './autosaveLifecycle'
const fixture=vi.hoisted(()=>({store:{} as any,state:{} as any,call:vi.fn(),refresh:vi.fn(async()=>{})}))
vi.mock('../store',()=>({useAppStore:()=>fixture.store}))
vi.mock('./CloudProvider',()=>({useCloud:()=>({state:fixture.state,refresh:fixture.refresh,configure:vi.fn()}),cloudCall:fixture.call}))
vi.mock('../ipc/bridge',()=>({桥接:{office:{writeDocx:vi.fn(async()=>({成功:true,数据:'UEs='}))}}}))
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
  it('撤销到磁盘原文后仍同步恢复版本，并只刷新指定关闭标签',async()=>{
    const view=render(<CloudAutosave/>);await act(async()=>{await flushCloudBeforeClose('word')})
    fixture.call.mockClear();fixture.store={...fixture.store,documents:[{...fixture.store.documents[0],html:'<p>磁盘原文</p>'}],workspaceTabs:[{id:'word',type:'word',dirty:false}]};view.rerender(<CloudAutosave/>);
    await act(async()=>{await flushCloudBeforeClose('other')});expect(fixture.call).not.toHaveBeenCalled()
    await act(async()=>{await flushCloudBeforeClose('word')});expect(fixture.call.mock.calls.filter(([action])=>action==='save')).toHaveLength(1)
  })
})
