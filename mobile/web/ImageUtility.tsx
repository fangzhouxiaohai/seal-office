import { useEffect, useRef, useState } from 'react'
import { 解码图片 } from '../../renderer/src/scan/imageIO'
import type { 像素图 } from '../../renderer/src/scan/imageProcessing'
import { 擦除笔画, type 擦除笔画设置 } from '../../renderer/src/scan/scanTransforms'
import HandwritingEditor from '../../renderer/src/scan/HandwritingEditor'
import { 格式化大小 } from '../../renderer/src/scan/scanSave'
import { 校正纸面阴影, 移除边缘背景, 证件像素 } from './utilityProcessing'
import UtilityFileButton from './UtilityFileButton'
import { downloadFile } from './native'

type Tool='id-photo'|'image-compress'|'cutout'|'image-erase'|'image-deshadow'|'generate-image'
function pixelsCanvas(img:像素图) {
  const canvas=document.createElement('canvas')
  canvas.width=img.宽; canvas.height=img.高
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.数据),img.宽,img.高),0,0)
  return canvas
}
export default function ImageUtility({tool}:{tool:Tool}) {
  const [source,setSource]=useState<{img:像素图;file:File}|null>(null)
  const [spec,setSpec]=useState<'一寸'|'二寸'>('一寸'), [color,setColor]=useState('#ffffff')
  const [quality,setQuality]=useState(75), [tolerance,setTolerance]=useState(32)
  const [strokes,setStrokes]=useState<擦除笔画设置[]>([]),[editing,setEditing]=useState(false)
  const [title,setTitle]=useState(''), [status,setStatus]=useState('')
  const [result,setResult]=useState<{blob:Blob;url:string;w:number;h:number}|null>(null)
  const sequence=useRef(0)
  useEffect(()=>()=>{if(result) URL.revokeObjectURL(result.url)},[result])
  useEffect(()=>{
    const task=++sequence.current
    setResult(null); setStatus('')
    if(!source && (tool!=='generate-image'||!title.trim())) return
    try {
      let canvas:HTMLCanvasElement
      if(tool==='generate-image') {
        canvas=document.createElement('canvas'); canvas.width=1080;canvas.height=720
        const ctx=canvas.getContext('2d')!
        ctx.fillStyle=color;ctx.fillRect(0,0,1080,720)
        if(source) {const photo=pixelsCanvas(source.img), s=Math.max(1080/photo.width,720/photo.height);ctx.drawImage(photo,(1080-photo.width*s)/2,(720-photo.height*s)/2,photo.width*s,photo.height*s)}
        ctx.font='bold 56px sans-serif';ctx.textBaseline='middle'
        const lines:string[]=[]
        for(const para of title.trim().split('\n')) {
          let line=''
          for(const ch of para) { if(ctx.measureText(line+ch).width>950) {lines.push(line);line=''} line+=ch }
          lines.push(line)
        }
        if(lines.length>8) throw new Error('标题过长，请缩短到八行内')
        ctx.fillStyle='rgba(0,0,0,.70)';ctx.fillRect(0,720-lines.length*72-48,1080,lines.length*72+48)
        ctx.fillStyle='#fff';lines.forEach((line,i)=>ctx.fillText(line,56,720-(lines.length-i)*72+12))
      } else {
        if(!source) return
        let img=source.img
        if(tool==='cutout'||tool==='id-photo') img=移除边缘背景(img,tolerance)
        if(tool==='image-erase') img=擦除笔画(img,strokes)
        if(tool==='image-deshadow') img=校正纸面阴影(img)
        canvas=pixelsCanvas(img)
        if(tool==='id-photo') {
          const original=canvas;canvas=document.createElement('canvas')
          ;[canvas.width,canvas.height]=证件像素(spec)
          const ctx=canvas.getContext('2d')!, scale=Math.max(canvas.width/img.宽,canvas.height/img.高)
          ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height)
          ctx.drawImage(original,(canvas.width-img.宽*scale)/2,(canvas.height-img.高*scale)/2,img.宽*scale,img.高*scale)
        }
      }
      canvas.toBlob(blob=>{
        if(task!==sequence.current) return
        if(!blob) {setStatus('图片生成失败，请重新选择文件');return}
        setResult({blob,url:URL.createObjectURL(blob),w:canvas.width,h:canvas.height})
      },tool==='image-compress'?'image/jpeg':'image/png',quality/100)
    } catch(e) {setStatus((e as Error).message)}
    return ()=>{sequence.current++}
  },[source,tool,title,color,quality,spec,tolerance,strokes])
  const save=async()=>{
    if(!result) return
    const base=source?.file.name.replace(/\.[^.]+$/,'')||'海报'
    try {await downloadFile(base+'-'+({ 'id-photo':'证件照','image-compress':'压缩',cutout:'抠图','image-erase':'涂抹消除','image-deshadow':'去阴影','generate-image':'出图' }[tool])+(tool==='image-compress'?'.jpg':'.png'), new Uint8Array(await result.blob.arrayBuffer()),result.blob.type)}
    catch(e){setStatus((e as Error).message)}
  }
  return <div className="seal-util-card">
    <UtilityFileButton label={tool==='generate-image'?'选择背景图':'选择图片'} accept="image/*" onFile={async file=>{const img=await 解码图片(file);setSource({img,file});setStrokes([])}}/>
    {source&&<p>{source.file.name} · {格式化大小(source.file.size)}</p>}
    {tool==='generate-image'&&<label className="seal-util-label">标题<textarea value={title} maxLength={240} onChange={e=>setTitle(e.target.value)}/></label>}
    {tool==='id-photo'&&<label className="seal-util-label">照片尺寸<select value={spec} onChange={e=>setSpec(e.target.value as typeof spec)}><option>一寸</option><option>二寸</option></select></label>}
    {(tool==='id-photo'||tool==='generate-image')&&<label className="seal-util-label">底色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>}
    {(tool==='id-photo'||tool==='cutout')&&<label className="seal-util-label">背景色容差 {tolerance}<input type="range" min={1} max={160} value={tolerance} onChange={e=>setTolerance(Number(e.target.value))}/></label>}
    {tool==='image-compress'&&<label className="seal-util-label">JPEG 质量 {quality}%<input type="range" min={10} max={95} value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label>}
    {result&&<><img className="seal-util-preview" src={result.url} alt="处理结果"/><p>{result.w} × {result.h} · {格式化大小(result.blob.size)}</p></>}
    {tool==='image-erase'&&<div className="seal-util-row"><button disabled={!result} onClick={()=>setEditing(true)}>涂抹区域</button><button disabled={!strokes.length} onClick={()=>setStrokes(s=>s.slice(0,-1))}>撤销上一笔</button></div>}
    {editing&&result&&<HandwritingEditor 预览={result.url} 宽={result.w} 高={result.h} 关闭={()=>setEditing(false)} 应用={s=>{setEditing(false);setStrokes(old=>[...old,...s])}}/>}
    <button className="seal-util-primary" disabled={!result} onClick={()=>void save()}>保存图片</button>{status&&<p role="alert">{status}</p>}
  </div>
}
