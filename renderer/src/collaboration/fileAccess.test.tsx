import {act,renderHook} from '@testing-library/react'
import {App as AntdApp} from 'antd'
import {beforeEach,expect,it,vi} from 'vitest'
import {useCollaborationFiles} from './fileAccess'
const fixture=vi.hoisted(()=>({createDoc:vi.fn(),refreshRecents:vi.fn(),record:vi.fn(),call:vi.fn(async()=>({})),materialize:vi.fn()}))
vi.mock('../store',()=>({useAppStore:()=>({createDoc:fixture.createDoc,refreshRecents:fixture.refreshRecents})}))
vi.mock('../fileOpen',()=>({记录最近文档:fixture.record,通过路径打开文件:vi.fn()}))
vi.mock('../cloud/CloudProvider',()=>({cloudCall:fixture.call}))
vi.mock('./materializeRealtime',()=>({materializeRealtime:fixture.materialize}))
beforeEach(()=>{vi.clearAllMocks()})
it.each([['word','sldoc'],['table','slxls'],['ppt','slppt']] as const)('实时 %s 专属副本进入编辑器仍保留来源警告记录，后续保存可完整写回',async(type,extension)=>{
  const path=`private:/协作.${extension}`,warnings=['来源中特殊域已经转换','保留原始来源记录'],content=type==='word'?'<p>最新𠮷🦭</p>':type==='table'?[{name:'最新'}]:{幻灯片列表:[]}
  fixture.materialize.mockResolvedValue({path,name:`协作.${extension}`,version:2,live:{type,content,warnings,page:{方向:'横向'},fingerprint:'actual-version'}})
  const {result}=renderHook(()=>useCollaborationFiles('user'),{wrapper:({children})=><AntdApp>{children}</AntdApp>})
  await act(async()=>{await result.current.open(async()=>({path,name:`协作.${extension}`,version:1}),{kind:'share',id:'share',editable:true})})
  expect(fixture.createDoc).toHaveBeenCalledWith(type,content,{路径:path,页面设置:{方向:'横向'},文件指纹:'actual-version',警告:warnings})
  expect(fixture.record).toHaveBeenCalledWith(path,`协作.${extension}`,type);expect(fixture.call).toHaveBeenCalledWith('realtimeBindFile',expect.objectContaining({path,binding:expect.objectContaining({version:2})}))
})
