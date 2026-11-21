import { useEffect, useRef, useState } from 'react'
import { 整理视频尺寸 } from './utilityProcessing'
import { 格式化大小 } from '../../renderer/src/scan/scanSave'
import { downloadFile } from './native'
import UtilityFileButton from './UtilityFileButton'

async function compress(file:File, maxSide:number, signal:AbortSignal, progress:(n:number)=>void) {
  const mime=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(m=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(m))
  if(!mime || !HTMLCanvasElement.prototype.captureStream || typeof AudioContext==='undefined') throw new Error('此系统 WebView 不支持带音轨的视频编码')
  const video=document.createElement('video'), canvas=document.createElement('canvas')
  const audio=new AudioContext(), dest=audio.createMediaStreamDestination()
  const url=URL.createObjectURL(file)
  let stream:MediaStream|undefined, frame=0
  video.playsInline=true;video.preload='auto'
  const canceled=()=>new DOMException('已取消压缩','AbortError')
  const controller=new AbortController()
  const untilAbort=new Promise<never>((_,reject)=>{
    controller.signal.addEventListener('abort',()=>reject(canceled()),{once:true})
  })
  const abort=()=>controller.abort()
  signal.addEventListener('abort',abort,{once:true})
  try {
    await Promise.race([untilAbort,(async()=>{
      await audio.resume()
      await new Promise<void>((resolve,reject)=>{video.onloadedmetadata=()=>resolve();video.onerror=()=>reject(new Error('无法解码所选视频')); video.src=url})
    })()])
    if(!Number.isFinite(video.duration)||video.duration<=0) throw new Error('无法读取视频时长')
    const [w,h]=整理视频尺寸(video.videoWidth,video.videoHeight,maxSide)
    canvas.width=w;canvas.height=h
    const ctx=canvas.getContext('2d')!
    audio.createMediaElementSource(video).connect(dest)
    stream=canvas.captureStream(25)
    dest.stream.getAudioTracks().forEach(t=>stream!.addTrack(t))
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(2200000,Math.max(160000,w*h*3)),audioBitsPerSecond:96000})
    const chunks:Blob[]=[]
    const complete=new Promise<Blob>((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
      recorder.onerror=()=>reject(new Error('视频编码失败'))
      recorder.onstop=()=>chunks.length?resolve(new Blob(chunks,{type:recorder.mimeType})):reject(new Error('压缩结果为空'))
      video.onerror=()=>reject(new Error('视频读取中断'))
      video.onended=()=>{if(recorder.state==='recording') recorder.stop()}
    })
    let lastPercent=-1
    const draw=()=>{
      ctx.drawImage(video,0,0,w,h)
      const n=Math.min(99,Math.floor(100*video.currentTime/video.duration))
      if(n!==lastPercent) {progress(n);lastPercent=n}
      frame=requestAnimationFrame(draw)
    }
    recorder.start(1000)
    try {
      await Promise.race([untilAbort,video.play()]);draw()
      return await Promise.race([untilAbort,complete])
    } finally {if(recorder.state==='recording') recorder.stop()}
  } finally {
    signal.removeEventListener('abort',abort);cancelAnimationFrame(frame)
    video.pause();video.removeAttribute('src');video.load()
    stream?.getTracks().forEach(t=>t.stop()); dest.stream.getTracks().forEach(t=>t.stop())
    await audio.close();URL.revokeObjectURL(url)
  }
}
export default function VideoUtility() {
  const [file,setFile]=useState<File|null>(null),[side,setSide]=useState(720),[progress,setProgress]=useState<number|null>(null)
  const [out,setOut]=useState<{url:string;blob:Blob}|null>(null),[status,setStatus]=useState('')
  const active=useRef<AbortController|null>(null)
  useEffect(()=>()=>active.current?.abort(),[])
  useEffect(()=>()=>{if(out) URL.revokeObjectURL(out.url)},[out])
  const start=async()=>{
    if(!file||active.current) return
    const controller=new AbortController();active.current=controller;setProgress(0);setOut(null);setStatus('')
    try {
      const blob=await compress(file,side,controller.signal,setProgress)
      if(!controller.signal.aborted) setOut({url:URL.createObjectURL(blob),blob})
    } catch(e){setStatus((e as Error).message)}
    finally{active.current=null;setProgress(null)}
  }
  return <div className="seal-util-card"><UtilityFileButton label="选择视频" accept="video/*" disabled={progress!==null} onFile={f=>{if(!f.size)throw new Error('视频为空');setFile(f);setOut(null);setStatus('')}}/>
    {file&&<p>{file.name} · {格式化大小(file.size)}</p>}
    <label className="seal-util-label">最长边<select value={side} disabled={progress!==null} onChange={e=>{setSide(Number(e.target.value));setOut(null)}}>{[480,720,1080].map(n=><option key={n} value={n}>{n} px</option>)}</select></label>
    {progress===null?<button className="seal-util-primary" disabled={!file} onClick={()=>void start()}>开始压缩</button>:<div className="seal-util-row"><progress value={progress} max={100}/><span>{progress}%</span><button onClick={()=>active.current?.abort()}>取消</button></div>}
    {out&&<><video className="seal-util-preview" controls src={out.url}/><p>{out.blob.type} · {格式化大小(out.blob.size)}</p>
      <button onClick={()=>void out.blob.arrayBuffer().then(bytes=>downloadFile((file?.name.replace(/\.[^.]+$/,'')||'视频')+'-压缩.'+(out.blob.type.includes('mp4')?'mp4':'webm'),new Uint8Array(bytes),out.blob.type)).catch(e=>setStatus(e.message))}>保存视频</button></>}
    {status&&<p role="status">{status}</p>}
  </div>
}
