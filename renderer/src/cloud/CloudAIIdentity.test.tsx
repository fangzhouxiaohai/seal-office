import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {App as AntdApp,ConfigProvider} from 'antd'
import {afterEach,expect,it,vi} from 'vitest'
import {CloudProvider,useCloud} from './CloudProvider'
import {AppProvider,useAppStore} from '../store'
import AiAssistant from '../assistant/AiAssistant'

afterEach(()=>{Reflect.deleteProperty(window,'electronAPI')})
// The common jsdom setup fixes React.useId to "test-id", so a Drawer and a
// Modal share aria-labelledby IDs. Match the actual visible modal title here;
// production browser checks use real React IDs and accessible role names.
async function findDialog(title:string){let dialog:HTMLElement|undefined;await waitFor(()=>{dialog=Array.from(document.querySelectorAll<HTMLElement>('.ant-modal')).find(el=>el.querySelector('.ant-modal-title,.ant-modal-confirm-title')?.textContent===title);expect(dialog).toBeVisible()},{timeout:5000});return dialog!}
function environment(initialVerified=false){
  let verified=initialVerified,networkError=false,hold=false,release:((value:unknown)=>void)|undefined
  const identity=()=>({成功:true,数据:{accountId:'isolated-ui-account',verified:true,method:'phone'}})
  const account=()=>({account:verified?{id:'isolated-ui-account',phone:'13800138000',identityVerified:true,identityMethod:'phone',enabled:false,autosave:false,used:0,quota:300000000}:null,unlocked:false,statuses:{},pending:0})
  const invoke=vi.fn(async(action:string)=>{
    if(action==='status')return {成功:true,数据:account()}
    if(action==='requireAIIdentity'){
      if(hold){hold=false;return new Promise(resolve=>{release=resolve})}
      if(networkError)return {成功:false,错误:'测试网络暂时不可用',状态码:503,code:'SERVICE_UNAVAILABLE'}
      return verified?identity():{成功:false,错误:'请先登录已验证手机号的账号',状态码:401,code:'AI_IDENTITY_REQUIRED',需要登录:true}
    }
    if(action==='login'||action==='loginPassword'){verified=true;return {成功:true,数据:account()}}
    if(action==='logout'){verified=false;return {成功:true,数据:account()}}
    throw Error('Unopened isolated account action '+action)
  })
  const ai={getConfig:vi.fn(async()=>({成功:true,数据:{名称:'隔离测试模型',地址:'https://fixture.invalid/v1',模型:'fixture',已配置密钥:true}})),getSession:vi.fn(async()=>({成功:true,数据:null})),clearSession:vi.fn(async()=>({成功:true})),chat:vi.fn(async(input:unknown)=>({成功:true,数据:{内容:'测试回复',input}})),onStream:()=>()=>{},onToolCall:()=>()=>{}}
  window.electronAPI={cloud:{invoke},ai,backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),backupClear:async()=>({成功:true})} as any
  function Controls(){const store=useAppStore(),cloud=useCloud();const select=(name:string)=>{const tab=store.workspaceTabs.find(t=>t.name===name+'.sldoc');if(tab)store.selectWorkspaceTab(tab.id);else store.createDoc('word','<p>'+name+'</p>',{名称:name+'.sldoc'})};return <><button onClick={cloud.configure}>查看账号</button><button onClick={()=>select('文档A')}>切到A</button><button onClick={()=>select('文档B')}>切到B</button></>}
  render(<ConfigProvider button={{autoInsertSpace:false}}><AntdApp><CloudProvider><AppProvider 初始最近文档={[]}><Controls/><AiAssistant/></AppProvider></CloudProvider></AntdApp></ConfigProvider>)
  const open=async()=>{fireEvent.click(screen.getByRole('button',{name:'打开智能助手'}));const input=await screen.findByRole('textbox',{name:'发送给智能助手的消息'});await waitFor(()=>expect(ai.getConfig).toHaveBeenCalled());return input}
  const send=async(text:string)=>{const input=screen.getByRole('textbox',{name:'发送给智能助手的消息'});fireEvent.change(input,{target:{value:text}});await waitFor(()=>expect(screen.getByRole('button',{name:'发送'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'发送'}));return input}
  return {invoke,ai,open,send,setVerified:(value:boolean)=>{verified=value},network:()=>{networkError=true},pause:()=>{hold=true},finish:async()=>{await act(async()=>{release?.(identity())})}}
}
it('匿名发送打开现有登录弹窗；取消保留输入、无AI请求、普通本地文档仍可创建',async()=>{
  const f=environment(),input=await f.open();await f.send('待登录输入𠮷🦭')
  const login=await findDialog('账号登录');expect(within(login).getByRole('status')).toHaveTextContent('无需开通云空间');expect(f.ai.chat).not.toHaveBeenCalled();expect(input).toHaveValue('待登录输入𠮷🦭')
  fireEvent.click(login.querySelector('.ant-modal-close')!);await waitFor(()=>expect(login).not.toBeVisible());expect(input).toHaveValue('待登录输入𠮷🦭');expect(f.ai.chat).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('切到A'));await waitFor(()=>expect(screen.getByText(/当前范围：/).parentElement).toHaveTextContent('文档A.sldoc'));expect(f.invoke.mock.calls.some(([action])=>action==='enable')).toBe(false)
})
it.each(['sms','password'] as const)('%s 登录已验证账号后保留原稿且不自动生成，主动重试可用且无需开云空间',async(mode)=>{
  const f=environment(),input=await f.open();await f.send('保留给模型的输入𠮷🦭');const login=await findDialog('账号登录')
  fireEvent.change(within(login).getByLabelText('手机号'),{target:{value:'13800138000'}})
  if(mode==='password'){fireEvent.click(within(login).getByRole('button',{name:'密码登录'}));fireEvent.change(within(login).getByLabelText('登录密码'),{target:{value:'isolated-password'}})}else fireEvent.change(within(login).getByLabelText('验证码'),{target:{value:'123456'}})
  fireEvent.submit(within(login).getByRole('form',{name:mode==='password'?'手机号密码登录':'手机验证码登录'}));await waitFor(()=>expect(document.querySelector('.seal-login-modal')).not.toBeVisible());expect(input).toHaveValue('保留给模型的输入𠮷🦭');expect(f.ai.chat).not.toHaveBeenCalled();expect(f.invoke.mock.calls.some(([action])=>action==='enable')).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'发送'}));await waitFor(()=>expect(f.ai.chat).toHaveBeenCalledTimes(1));expect(JSON.stringify(f.ai.chat.mock.calls[0])).toContain('保留给模型的输入𠮷🦭');expect(JSON.stringify(f.ai.chat.mock.calls[0])).not.toContain('13800138000');expect(JSON.stringify(f.ai.chat.mock.calls[0])).not.toContain('accountId')
})
it('登录状态过期后下一次生成重新拦截，输入留在原处',async()=>{
  const f=environment(true),input=await f.open();await f.send('第一次');await waitFor(()=>expect(f.ai.chat).toHaveBeenCalledOnce());await waitFor(()=>expect(screen.getByRole('button',{name:'发送'})).toBeDisabled())
  f.setVerified(false);await f.send('过期后输入𠮷');await findDialog('账号登录');expect(f.ai.chat).toHaveBeenCalledTimes(1);expect(input).toHaveValue('过期后输入𠮷')
})
it('核验服务离线显示真实失败原因，保留输入且不打开未登录提示',async()=>{
  const f=environment(true),input=await f.open();f.network();await f.send('网络失败保留')
  const dialog=await findDialog('AI 账号核验未完成');expect(within(dialog).getByText('测试网络暂时不可用')).toBeInTheDocument();expect(document.querySelector('.seal-login-modal')).not.toBeInTheDocument();expect(input).toHaveValue('网络失败保留');expect(f.ai.chat).not.toHaveBeenCalled()
})
it('在线核验期间继续输入不会被旧发送清空，只发送当时明确提交的文字',async()=>{
  const f=environment(true),input=await f.open();f.pause();await f.send('先提交的文字');await waitFor(()=>expect(f.invoke.mock.calls.some(([action])=>action==='requireAIIdentity')).toBe(true));fireEvent.change(input,{target:{value:'核验期间的新草稿𠮷'}});await f.finish();await waitFor(()=>expect(f.ai.chat).toHaveBeenCalledOnce());expect(input).toHaveValue('核验期间的新草稿𠮷');expect(JSON.stringify(f.ai.chat.mock.calls[0])).toContain('先提交的文字');expect(JSON.stringify(f.ai.chat.mock.calls[0])).not.toContain('核验期间的新草稿𠮷')
})
it('在线核验期间切换文档，已提交任务仍在原范围执行且不清空新文档输入',async()=>{
  const f=environment(true);fireEvent.click(screen.getByText('切到A'));const input=await f.open();f.pause();await f.send('A的旧发送');await waitFor(()=>expect(f.invoke.mock.calls.some(([action])=>action==='requireAIIdentity')).toBe(true));fireEvent.click(screen.getByText('切到B'));fireEvent.change(input,{target:{value:'B的新草稿𠮷'}});await f.finish();await waitFor(()=>expect(f.ai.chat).toHaveBeenCalledOnce());expect(input).toHaveValue('B的新草稿𠮷');expect(JSON.stringify(f.ai.chat.mock.calls[0])).toContain('文档A.sldoc');expect(JSON.stringify(f.ai.chat.mock.calls[0])).not.toContain('文档B.sldoc');expect(JSON.stringify(f.ai.chat.mock.calls[0])).not.toContain('B的新草稿𠮷')
})
it('在线核验期间开启新对话会撤销旧发送，新会话草稿不会被迟到的核验清空',async()=>{
  const f=environment(true),input=await f.open();f.pause();await f.send('旧会话已提交文字');await waitFor(()=>expect(f.invoke.mock.calls.some(([action])=>action==='requireAIIdentity')).toBe(true))
  fireEvent.click(screen.getByRole('button',{name:'新对话'}));await waitFor(()=>expect(f.ai.clearSession).toHaveBeenCalledOnce());await waitFor(()=>expect(input).toHaveValue(''));fireEvent.change(input,{target:{value:'新会话保留草稿𠮷🦭'}})
  await f.finish();expect(f.ai.chat).not.toHaveBeenCalled();expect(input).toHaveValue('新会话保留草稿𠮷🦭');expect(screen.getByRole('log',{name:'助手对话'})).not.toHaveTextContent('旧会话已提交文字')
})
