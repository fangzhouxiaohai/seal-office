import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react'
import {App,Button,Checkbox,Input,Modal} from 'antd'
import {CloudLoginForm} from './CloudLoginForm'
import {AccountSecurity} from './AccountSecurity'
export interface CloudAccount {id:string;phone:string;enabled:boolean;autosave:boolean;used:number;quota:number;envelope?:string;hasPassword?:boolean}
export interface CloudState {account:CloudAccount|null;unlocked:boolean;statuses:Record<string,string>;pending:number;recoveryPending?:string;deletionPending?:boolean}
const initial:CloudState={account:null,unlocked:false,statuses:{},pending:0}
export async function cloudCall<T=any>(action:string,input?:unknown):Promise<T>{
  const api=window.electronAPI?.cloud
  if(!api){if(action==='status')return initial as T;throw new Error('云端功能需要桌面版海豹办公')}
  const result=await api.invoke(action,input)
  if(!result.成功)throw Object.assign(new Error(result.错误||'云端操作失败'),{status:result.状态码})
  if(action==='shareCreate')window.dispatchEvent(new Event('seal-collaboration-binding'))
  return result.数据 as T
}
interface CloudContextValue {state:CloudState;refresh:()=>Promise<void>;configure:()=>void;call:typeof cloudCall}
const Context=createContext<CloudContextValue>({state:initial,refresh:async()=>{},configure:()=>{},call:cloudCall})
export const useCloud=()=>useContext(Context)
export function CloudProvider({children}:{children:React.ReactNode}){
  const {modal,message}=App.useApp(),[state,setState]=useState(initial),[open,setOpen]=useState(false),[busy,setBusy]=useState(false)
  const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[agreed,setAgreed]=useState(false),[recovery,setRecovery]=useState(''),[shownRecovery,setShownRecovery]=useState(''),[confirmedRecovery,setConfirmedRecovery]=useState(false),[cooldown,setCooldown]=useState(0)
  const [loginError,setLoginError]=useState(''),operationPending=useRef(false)
  const refresh=useCallback(async()=>{const result=await cloudCall<CloudState>('status');setState(result)},[])
  useEffect(()=>{void refresh().catch(e=>message.error(e.message))},[refresh,message])
  useEffect(()=>{if(state.recoveryPending)setShownRecovery(state.recoveryPending)},[state.recoveryPending])
  useEffect(()=>{
    if(!open||!state.deletionPending)return
    let cancelled=false,polling=false
    const poll=async()=>{if(polling)return;polling=true;try{const result=await cloudCall('deletionStatus');if(!cancelled){await refresh();if(result.deleted)message.success('账号与云数据已永久删除；历史备份清理完成')}}catch{}finally{polling=false}}
    void poll();const timer=setInterval(()=>void poll(),3000)
    return()=>{cancelled=true;clearInterval(timer)}
  },[open,state.deletionPending,refresh,message])
  useEffect(()=>{if(!cooldown)return;const timer=window.setTimeout(()=>setCooldown(cooldown-1),1000);return()=>clearTimeout(timer)},[cooldown])
  const run=async(task:()=>Promise<any>,inline=false)=>{if(operationPending.current)return;operationPending.current=true;setBusy(true);if(inline)setLoginError('');try{await task()}catch(e){const error=e instanceof Error?e.message:'请稍后重试';if(inline)setLoginError(error);else modal.error({title:'云端操作未完成',content:error})}finally{await refresh().catch(()=>{});operationPending.current=false;setBusy(false)}}
  const send=()=>{if(cooldown||!/^1[3-9]\d{9}$/.test(phone))return;void run(async()=>{await cloudCall('code',{phone});setCooldown(60);message.success('验证码已发送')},true)}
  const enable=()=>run(async()=>{const result=await cloudCall<CloudState&{recovery:string}>('enable',{consent:agreed});setShownRecovery(result.recovery);setConfirmedRecovery(false);setState(result)})
  const configure=()=>{setCode('');setRecovery('');setAgreed(false);setLoginError('');setOpen(true)}
  return <Context.Provider value={{state,refresh,configure,call:cloudCall}}>{children}
    <Modal title={state.account?'账号与云空间':<span className="seal-login__dialog-title">账号登录</span>} className={!state.account?'seal-login-modal':undefined} open={open} centered footer={null} closable={!busy} keyboard={!busy} maskClosable={!busy} onCancel={()=>{if(!operationPending.current)setOpen(false)}} width={state.account?560:440}>
      {state.deletionPending&&<div role="status"><p>注销请求正在确认或清理历史备份。服务器确认完成后，账号与对应云数据无法恢复；可以查看进度。</p><Button loading={busy} onClick={()=>void run(async()=>{const result=await cloudCall('deletionStatus');if(result.deleted)message.success('账号与云数据已永久删除；历史备份清理完成')})}>查看注销进度</Button></div>}
      {!state.account?<CloudLoginForm phone={phone} code={code} busy={busy} cooldown={cooldown} error={loginError} onPhone={value=>{setPhone(value);setCode('');setLoginError('')}} onCode={value=>{setCode(value);setLoginError('')}} onSend={send} onPasswordLogin={password=>void run(async()=>{await cloudCall('loginPassword',{phone,password});message.success('登录成功')},true)} onLogin={()=>{if(!/^1[3-9]\d{9}$/.test(phone)||!/^\d{6}$/.test(code))return;void run(async()=>{await cloudCall('login',{phone,code});setCode('');message.success('登录成功')},true)}}/>:<>
        <p>已登录：{state.account.phone} <Button size="small" onClick={()=>run(()=>cloudCall('logout'))}>退出登录</Button></p>
        <AccountSecurity key={state.account.id} account={state.account} onChanged={refresh}/>
        {!state.account.enabled?<>
          <div className="seal-cloud-agreement"><h3>云服务协议与隐私说明</h3><p>开通后，你主动上传或开启自动保存的文件会在本机加密后上传到海豹办公云服务。每账号提供 300 MB 实际配额，文件、历史版本、回收站和公开副本计入用量。服务器能够知道账号、密文大小与访问时间，无法直接解密私有文档内容和文件名。</p><p>恢复密钥由你保管。全部授权设备和恢复密钥丢失后，运营人员无法找回文件。公开发布与在线 AI 处理另行授权；公开副本可被他人及管理员阅读。清空停用后活动数据删除，备份最多保留 7 天；他人已下载的副本无法收回。</p></div>
          <Checkbox checked={agreed} onChange={e=>setAgreed(e.target.checked)}>我已阅读并同意云服务协议与隐私说明</Checkbox>
          <p><Button type="primary" disabled={!agreed} loading={busy} onClick={enable}>开通云空间</Button></p>
        </>:!state.unlocked?<><p>请输入自己保管的恢复密钥，解锁此设备。</p><Input.Password aria-label="恢复密钥" value={recovery} onChange={e=>setRecovery(e.target.value)}/><p><Button loading={busy} onClick={()=>run(()=>cloudCall('unlock',{recovery}))}>解锁云空间</Button></p></>:<><p>云空间已开通，已用 {(state.account.used/1000000).toFixed(2)} / 300 MB。</p><Button loading={busy} onClick={()=>run(()=>cloudCall('autosave',{enabled:!state.account?.autosave}))}>{state.account.autosave?'关闭':'开启'}云文档自动保存</Button></>}
      </>}
    </Modal>
    <Modal title="保存你的云空间恢复密钥" open={Boolean(shownRecovery)} centered closable={false} maskClosable={false} confirmLoading={busy} onOk={()=>run(async()=>{await cloudCall('ackRecovery');setShownRecovery('');setOpen(false)})} okText="我已安全保存" okButtonProps={{disabled:!confirmedRecovery}} cancelButtonProps={{style:{display:'none'}}}>
      <p>换设备或重新登录后可能需要此密钥。请保存到安全位置；运营人员无法代你找回。</p><Input.TextArea aria-label="新恢复密钥" readOnly value={shownRecovery} rows={3}/><p><Button onClick={()=>navigator.clipboard.writeText(shownRecovery).then(()=>message.success('已复制恢复密钥')).catch(()=>message.error('复制失败，请手动保存'))}>复制密钥</Button></p><Checkbox checked={confirmedRecovery} onChange={e=>setConfirmedRecovery(e.target.checked)}>我已在安全位置保存恢复密钥</Checkbox>
    </Modal>
  </Context.Provider>
}
