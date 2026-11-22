import { useEffect, useRef, useState } from 'react'
import { 录制网页音频, 转写音频, type 录音会话 } from './audioTranscription'
import { downloadFile, nativeSpeechInput, platformFetch, recordNativeAudio } from './native'
import UtilityFileButton from './UtilityFileButton'

export default function AudioTranscriptionTool() {
  const [file,setFile]=useState<File|null>(null),[text,setText]=useState(''),[status,setStatus]=useState('')
  const [url,setUrl]=useState(''),[model,setModel]=useState(''),[key,setKey]=useState(''),[consent,setConsent]=useState(false)
  const [busy,setBusy]=useState(false),[recording,setRecording]=useState(false)
  const active=useRef<AbortController|null>(null), session=useRef<录音会话|null>(null)
  useEffect(()=>()=>{active.current?.abort()},[])
  const select=(f:File)=>{
    if (!f.size || (!f.type.startsWith('audio/') && !/\.(wav|mp3|m4a|aac|webm|ogg|flac|mp4)$/i.test(f.name))) throw new Error('请选择有效的音频文件')
    setFile(f); setConsent(false); setText(''); setStatus('')
  }
  const run=async(action:(signal:AbortSignal)=>Promise<void>)=>{
    if(active.current) return
    const controller=new AbortController();active.current=controller;setBusy(true);setStatus('')
    try {await action(controller.signal)} catch(e){if(!controller.signal.aborted)setStatus((e as Error).message)}
    finally {active.current=null;session.current=null;setBusy(false);setRecording(false)}
  }
  const record=async(signal:AbortSignal)=>{
    session.current=(window.sealNative?.audioRecorder?recordNativeAudio:录制网页音频)(signal,()=>setRecording(true))
    const recorded=await session.current.结果
    if(recorded&&!signal.aborted) select(recorded)
  }
  return <div className="seal-util-card">
    <div className="seal-util-row"><button className="seal-util-primary" disabled={busy&&!recording} onClick={()=>recording?session.current?.停止():void run(record)}>{recording?'结束录音':'开始录音'}</button>
    {window.sealNative?.speechInput && <button disabled={busy} onClick={()=>void run(async signal=>{
      const result=await nativeSpeechInput(signal)
      if(result&&!signal.aborted){setText(result);setFile(null);setConsent(false)}
    })}>打开系统语音输入</button>}
    <UtilityFileButton label="选择音频" disabled={busy} accept="audio/*,.m4a,.webm" onFile={select}/></div>
    {file&&<><p>{file.name}</p>
      <label className="seal-util-label">转写服务接口<input type="url" placeholder="https://" value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);setConsent(false)}}/></label>
      <label className="seal-util-label">模型<input value={model} disabled={busy} onChange={e=>{setModel(e.target.value);setConsent(false)}}/></label>
      <label className="seal-util-label">服务密钥（可选）<input type="password" autoComplete="off" value={key} disabled={busy} onChange={e=>setKey(e.target.value)}/></label>
      <label className="seal-util-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>同意将所选音频发送到上述转写服务。</label>
      <button disabled={busy||!consent||!url.trim()||!model.trim()} onClick={()=>void run(async signal=>{
        const result=await 转写音频(file,{地址:url,模型:model,密钥:key},signal,platformFetch)
        if(!signal.aborted)setText(result)
      })}>开始转写</button></>}
    {busy&&<button onClick={()=>active.current?.abort()}>取消</button>}
    <label className="seal-util-label">转写文字<textarea rows={6} value={text} onChange={e=>setText(e.target.value)}/></label>
    <button disabled={!text.trim()||busy} onClick={()=>void downloadFile('录音转写.txt',new TextEncoder().encode(text),'text/plain;charset=utf-8').catch(e=>setStatus(e.message))}>保存文字</button>
    {status&&<p role="alert">{status}</p>}
  </div>
}
