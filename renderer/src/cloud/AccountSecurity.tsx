import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, Radio } from 'antd'
import { CloudAccount, cloudCall } from './CloudProvider'

export function AccountSecurity({ account, onChanged }: {account:CloudAccount;onChanged:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[proof,setProof]=useState<'password'|'sms'>(account.hasPassword?'password':'sms')
  const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[code,setCode]=useState('')
  const [cooldown,setCooldown]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),pending=useRef(false)
  const [deleting,setDeleting]=useState(false),[deletionCode,setDeletionCode]=useState(''),[confirmation,setConfirmation]=useState(''),[acknowledged,setAcknowledged]=useState(false)
  const [feedbackArea,setFeedbackArea]=useState<'password'|'deletion'>('password'),feedback=useRef<HTMLParagraphElement>(null)
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(value=>value-1),1000);return()=>clearTimeout(timer)},[cooldown])
  useEffect(()=>{if(error&&!busy){feedback.current?.scrollIntoView?.({block:'nearest'});feedback.current?.focus({preventScroll:true})}},[error,busy,feedbackArea])
  const run=async(task:()=>Promise<void>,area:'password'|'deletion'='password')=>{if(pending.current)return;pending.current=true;setFeedbackArea(area);setBusy(true);setError('');setNotice('');try{await task()}catch(e){setError(e instanceof Error?e.message:'账号操作未完成')}finally{await onChanged().catch(()=>{});pending.current=false;setBusy(false)}}
  const reset=()=>{setCurrent('');setPassword('');setRepeat('');setCode('');setError('');setNotice('')}
  return <section className="seal-account-security" aria-label="账号安全">
    <h3>账号安全</h3>
    <p>登录密码与云空间恢复密钥独立。设置或重设密码不会改变云文件的加密密钥。</p>
    <Button disabled={busy} aria-expanded={open} aria-controls="seal-password-settings" onClick={()=>{setOpen(!open);reset()}}>{account.hasPassword?'修改登录密码':'设置登录密码'}</Button>
    {open&&<form id="seal-password-settings" method="post" aria-label="设置登录密码" onSubmit={event=>{event.preventDefault();setFeedbackArea('password');if(password!==repeat){setError('两次输入的新密码不一致');return}if([...password].length<15||[...password].length>128){setError('新密码须为 15–128 个字符');return}void run(async()=>{await cloudCall('setPassword',{password,...(proof==='sms'?{code}:{currentPassword:current})});reset();setNotice('密码已更新，其他设备已退出登录。云文件的加密密钥保持不变。')})}}>
      {account.hasPassword&&<Radio.Group aria-label="身份验证方式" value={proof} disabled={busy} onChange={event=>{setProof(event.target.value);setCurrent('');setCode('');setError('')}}><Radio value="password">当前密码</Radio><Radio value="sms">短信验证码</Radio></Radio.Group>}
      {proof==='password'&&account.hasPassword?<p><label htmlFor="seal-security-current">当前登录密码</label><Input.Password id="seal-security-current" name="current-password" autoComplete="current-password" required value={current} disabled={busy} onChange={event=>setCurrent(event.target.value)}/></p>:<p><label htmlFor="seal-security-code">验证绑定手机 {account.phone}</label><Input id="seal-security-code" name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={event=>setCode(event.target.value.replace(/\D/g,''))}/><Button disabled={busy||cooldown>0} onClick={()=>void run(async()=>{await cloudCall('code',{purpose:'password'});setCooldown(60);setNotice('验证码已发送到绑定手机')})}>{cooldown?`${cooldown} 秒后重试`:'获取账号安全验证码'}</Button></p>}
      <p><label htmlFor="seal-security-new">新登录密码</label><Input.Password id="seal-security-new" name="new-password" autoComplete="new-password" aria-describedby="seal-security-password-help" required maxLength={256} value={password} disabled={busy} onChange={event=>{setPassword(event.target.value);setError('')}}/></p>
      <p id="seal-security-password-help">15–128 个字符，支持中文、空格和符号。修改后其他设备需要重新登录。</p>
      <p><label htmlFor="seal-security-repeat">再次输入新密码</label><Input.Password id="seal-security-repeat" name="confirm-password" autoComplete="new-password" required maxLength={256} value={repeat} disabled={busy} onChange={event=>{setRepeat(event.target.value);setError('')}}/></p>
      <Button type="primary" htmlType="submit" loading={busy}>保存登录密码</Button>
    </form>}
    {feedbackArea==='password'&&<>{error&&<p ref={feedback} tabIndex={-1} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</>}
    <p><Button danger disabled={busy} aria-expanded={deleting} onClick={()=>{setDeleting(!deleting);setDeletionCode('');setConfirmation('');setAcknowledged(false);setError('');setNotice('')}}>注销账号</Button></p>
    {deleting&&<form method="post" aria-label="永久注销账号" onSubmit={event=>{event.preventDefault();setFeedbackArea('deletion');if(!acknowledged||confirmation!=='永久注销海豹办公账号'){setError('请阅读注销范围并输入完整确认文字');return}void run(async()=>{await cloudCall('deleteAccount',{code:deletionCode,confirm:confirmation})},'deletion')}}>
      <h4>永久删除账号及云数据</h4><p>注销会删除个人云空间的文件、历史版本、回收站、公开内容、共享、标签、设备会话，以及你拥有的团队空间及其文件，并清理服务器保留的对应备份。此操作完成后无法恢复。</p><p>你加入的其他人拥有的团队文档，以及他人已下载的副本仍由其持有人管理。本机文档会保留；请先同步或导出待同步文件。</p>
      <label htmlFor="seal-delete-code">验证绑定手机 {account.phone}</label><Input id="seal-delete-code" name="deletion-code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={deletionCode} disabled={busy} onChange={event=>setDeletionCode(event.target.value.replace(/\D/g,''))}/>
      <p><Button disabled={busy||cooldown>0} onClick={()=>void run(async()=>{await cloudCall('code',{purpose:'delete-account'});setCooldown(60);setNotice('注销验证码已发送到绑定手机')},'deletion')}>{cooldown?`${cooldown} 秒后重试`:'获取注销验证码'}</Button></p>
      <p><label htmlFor="seal-delete-confirm">输入“永久注销海豹办公账号”</label><Input id="seal-delete-confirm" name="confirmation" autoComplete="off" required value={confirmation} disabled={busy} onChange={event=>{setConfirmation(event.target.value);setError('')}}/></p>
      <p><Checkbox checked={acknowledged} disabled={busy} onChange={event=>setAcknowledged(event.target.checked)}>我已保存需要的文件，理解上述删除范围及不可恢复的后果</Checkbox></p>
      <Button danger type="primary" htmlType="submit" loading={busy} disabled={!acknowledged||confirmation!=='永久注销海豹办公账号'}>永久注销并删除云数据</Button>
      {feedbackArea==='deletion'&&<>{error&&<p ref={feedback} tabIndex={-1} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</>}
    </form>}
  </section>
}
