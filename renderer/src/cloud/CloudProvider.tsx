import React,{createContext,useCallback,useContext,useEffect,useState} from 'react'
import {App,Button,Checkbox,Input,Modal} from 'antd'
export interface CloudAccount {id:string;phone:string;enabled:boolean;autosave:boolean;used:number;quota:number;envelope?:string}
export interface CloudState {account:CloudAccount|null;unlocked:boolean;statuses:Record<string,string>;pending:number;recoveryPending?:string}
const initial:CloudState={account:null,unlocked:false,statuses:{},pending:0}
export async function cloudCall<T=any>(action:string,input?:unknown):Promise<T>{
  const api=window.electronAPI?.cloud
  if(!api){if(action==='status')return initial as T;throw new Error('云端功能需要桌面版海豹办公')}
  const result=await api.invoke(action,input)
  if(!result.成功)throw new Error(result.错误||'云端操作失败')
  return result.数据 as T
}
interface CloudContextValue {state:CloudState;refresh:()=>Promise<void>;configure:()=>void;call:typeof cloudCall}
const Context=createContext<CloudContextValue>({state:initial,refresh:async()=>{},configure:()=>{},call:cloudCall})
export const useCloud=()=>useContext(Context)
export function CloudProvider({children}:{children:React.ReactNode}){
  const {modal,message}=App.useApp(),[state,setState]=useState(initial),[open,setOpen]=useState(false),[busy,setBusy]=useState(false)
  const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[agreed,setAgreed]=useState(false),[recovery,setRecovery]=useState(''),[shownRecovery,setShownRecovery]=useState(''),[confirmedRecovery,setConfirmedRecovery]=useState(false),[cooldown,setCooldown]=useState(0)
  const refresh=useCallback(async()=>{const result=await cloudCall<CloudState>('status');setState(result)},[])
  useEffect(()=>{void refresh().catch(e=>message.error(e.message))},[refresh,message])
  useEffect(()=>{if(state.recoveryPending)setShownRecovery(state.recoveryPending)},[state.recoveryPending])
  useEffect(()=>{if(!cooldown)return;const timer=window.setTimeout(()=>setCooldown(cooldown-1),1000);return()=>clearTimeout(timer)},[cooldown])
  const run=async(task:()=>Promise<any>)=>{if(busy)return;setBusy(true);try{await task();await refresh()}catch(e){modal.error({title:'云端操作未完成',content:e instanceof Error?e.message:'请稍后重试'})}finally{setBusy(false)}}
  const send=()=>run(async()=>{await cloudCall('code',{phone});setCooldown(60);message.success('验证码已发送')})
  const enable=()=>run(async()=>{const result=await cloudCall<CloudState&{recovery:string}>('enable',{consent:agreed});setShownRecovery(result.recovery);setConfirmedRecovery(false);setState(result)})
  const configure=()=>{setCode('');setRecovery('');setAgreed(false);setOpen(true)}
  return <Context.Provider value={{state,refresh,configure,call:cloudCall}}>{children}
    <Modal title="账号与云空间" open={open} centered footer={null} onCancel={()=>setOpen(false)} width={560}>
      <p>登录海豹办公账号，即可按需开通加密云空间。</p>
      {!state.account?<>
        <Input aria-label="手机号" placeholder="手机号" maxLength={11} value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}/>
        <div className="seal-cloud-form"><Input aria-label="验证码" placeholder="短信验证码" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/><Button disabled={cooldown>0||busy||!/^1[3-9]\d{9}$/.test(phone)} onClick={send}>{cooldown?`${cooldown} 秒后重试`:'获取验证码'}</Button></div>
        <Button type="primary" loading={busy} disabled={code.length!==6} onClick={()=>run(async()=>{await cloudCall('login',{phone,code});message.success('登录成功')})}>登录</Button>
      </>:<>
        <p>已登录：{state.account.phone} <Button size="small" onClick={()=>run(()=>cloudCall('logout'))}>退出登录</Button></p>
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
