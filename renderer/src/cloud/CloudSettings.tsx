import {useState} from 'react'
import {App,Button,Input,Modal,Switch,Checkbox} from 'antd'
import {cloudCall,useCloud} from './CloudProvider'
export default function CloudSettings(){
  const {state,refresh,configure}=useCloud(),{modal,message}=App.useApp(),[purging,setPurging]=useState(false),[code,setCode]=useState(''),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[sent,setSent]=useState(false)
  const [counts,setCounts]=useState<any>(null)
  const run=async(task:()=>Promise<any>)=>{setBusy(true);try{await task();await refresh()}catch(e){modal.error({title:'云空间操作失败',content:e instanceof Error?e.message:'操作未完成'})}finally{setBusy(false)}}
  const showPurge=()=>void run(async()=>{const summary=await cloudCall('counts');setCounts(summary);setChecked(false);setCode('');setSent(false);setPurging(true)})
  return <><h2 className="settings-group__title">账号与云端</h2><div className="settings-wps-card">
    <div className="settings-wps-row"><div className="settings-wps-row__text"><div className="settings-wps-row__title">云空间</div><div className="settings-wps-row__desc">默认关闭；主动勾选协议后开通 300 MB 加密空间。</div></div><Switch aria-label="云空间" checked={Boolean(state.account?.enabled)} onChange={on=>on?configure():showPurge()}/></div>
    <div className="settings-wps-row"><div className="settings-wps-row__text"><div className="settings-wps-row__title">云文档自动保存</div><div className="settings-wps-row__desc">内容变动后加密同步；关闭不会删除已保存的云文件。</div></div><Switch aria-label="云文档自动保存" checked={Boolean(state.account?.autosave)} disabled={!state.account?.enabled||busy} onChange={enabled=>state.unlocked?void run(()=>cloudCall('autosave',{enabled})):configure()}/></div>
    <div className="settings-wps-row"><Button onClick={configure}>{state.account?'账号与恢复密钥':'登录或开通云空间'}</Button>{state.account?.enabled?<Button danger onClick={showPurge}>清空并停用云空间</Button>:null}</div>
  </div><Modal title="清空并停用云空间" open={purging} centered confirmLoading={busy} okText="清空并停用" okButtonProps={{danger:true,disabled:!checked||code.length!==6}} onCancel={()=>setPurging(false)} onOk={()=>run(async()=>{await cloudCall('purge',{code});setPurging(false);message.success('云空间已清空并停用，自动保存已关闭')})}>
    <p>将删除此账号云空间的全部文件、目录、知识文件、历史版本、回收站及本人发布的公开副本，撤销分享访问。当前已用 {((counts?.used??state.account?.used??0)/1000000).toFixed(2)} MB。</p>{counts?<p>文件 {counts.files} 个 · 目录 {counts.folders} 个 · 历史版本 {counts.versions} 个 · 回收站 {counts.trash} 项 · 公开副本 {counts.publications} 个</p>:null}<p>本地文件仍可使用。云端备份最多 7 天后清除；他人已下载的副本无法收回。你可先返回云空间下载需要保留的文件；再次开通将从空空间开始。</p>
    <Checkbox checked={checked} onChange={e=>setChecked(e.target.checked)}>我已备份需要的文件，确认清空全部云端数据</Checkbox><div className="seal-cloud-form"><Input aria-label="停用验证码" placeholder="短信验证码" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/><Button disabled={sent||busy} onClick={()=>run(async()=>{await cloudCall('code',{purpose:'purge'});setSent(true);setTimeout(()=>setSent(false),60000)})}>{sent?'验证码已发送':'发送验证短信'}</Button></div>
  </Modal></>
}
