import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { App, Button } from 'antd'
import MultiTablePage from '../../renderer/src/localTools/MultiTablePage'
import { ChartRenderer } from '../../renderer/src/ppt/render/ChartRenderer'
import { 创建图表, 修改图表, type 图表种类 } from '../../renderer/src/ppt/model/elements'
import { downloadFile } from './native'
import './creativeTools.css'

type CreativeTool = 'collect-form'|'make-chart'|'handwriting'
type Point = [number, number]
type Stroke = { points: Point[]; color: string; width: number }

function parsedChart(input: string, type: 图表种类, title: string) {
  const labels:string[] = [], values:number[] = []
  for(const [index,line] of input.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const pieces=line.trim().split(/[,，\t]/)
    if (pieces.length!==2 || !pieces[0].trim() || !pieces[1].trim() || !Number.isFinite(Number(pieces[1]))) {
      throw new Error('第 '+(index+1)+' 行需要一项分类和一个数值，请用逗号或制表符分隔')
    }
    labels.push(pieces[0].trim()); values.push(Number(pieces[1]))
  }
  if (!labels.length) throw new Error('请先输入要绘图的数据')
  const draft=创建图表(type), chart=draft.图表!
  return 修改图表(draft,{...chart,标题:title.trim(),分类:labels,系列:[{...chart.系列[0],名称:title.trim()||'数值',数值:values}],图例:'无',数值格式:'0.00'})
}

function ExportDrawing({getSvg,disabled,name,w,h}:{getSvg:()=>SVGSVGElement|null;disabled:boolean;name:string;w:number;h:number}) {
  const {modal,message}=App.useApp(), [busy,setBusy]=useState(false)
  const exportDrawing=async(format:'svg'|'png')=>{
    const current=getSvg()
    if (busy || disabled || !current) return
    setBusy(true)
    try {
      const svg=current.cloneNode(true) as SVGSVGElement
      svg.setAttribute('width',String(w)); svg.setAttribute('height',String(h))
      // 序列化器根据节点命名空间写入 xmlns，保留普通同名属性会生成重复声明。
      for(const attribute of ['xmlns','tabindex','aria-label','class','role']) svg.removeAttribute(attribute)
      const source=new XMLSerializer().serializeToString(svg)
      if (format==='svg') await downloadFile(name+'.svg',new TextEncoder().encode(source),'image/svg+xml')
      else {
        const image=new Image()
        const objectUrl=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}))
        try {
          await new Promise<void>((done,fail)=>{
            image.onload=()=>done(); image.onerror=()=>fail(new Error('无法读取当前图形'))
            image.src=objectUrl
          })
          const canvas=document.createElement('canvas'); canvas.width=w*2;canvas.height=h*2
          const ctx=canvas.getContext('2d')
          if(!ctx) throw new Error('当前设备无法生成图片')
          ctx.drawImage(image,0,0,canvas.width,canvas.height)
          const png=await new Promise<Blob>((done,fail)=>canvas.toBlob(result=>result?done(result):fail(new Error('无法生成 PNG 图片')),'image/png'))
          await downloadFile(name+'.png',new Uint8Array(await png.arrayBuffer()),'image/png')
        } finally { URL.revokeObjectURL(objectUrl) }
      }
      message.success('已导出'+name)
    } catch(error) {
      if (!(error instanceof DOMException && error.name==='AbortError')) modal.error({title:'导出失败',content:error instanceof Error ? error.message : '请重新导出图片'})
    } finally { setBusy(false) }
  }
  return <div className="seal-creative-actions"><Button type="primary" disabled={disabled||busy} onClick={()=>void exportDrawing('png')}>导出 PNG</Button><Button disabled={disabled||busy} onClick={()=>void exportDrawing('svg')}>导出 SVG</Button></div>
}

function ChartTool() {
  const [input,setInput]=useState(''),[kind,setKind]=useState<图表种类>('柱状图'),[title,setTitle]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  const chart=useMemo(()=>{
    try { return {data:parsedChart(input,kind,title),error:''} }
    catch(err) { return {data:null,error:err instanceof Error?err.message:'无法读取图表数据'} }
  },[input,kind,title])
  return <div className="seal-creative-tool">
    <label>图表标题<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder="输入标题（可选）"/></label>
    <label>图表类型<select value={kind} onChange={e=>setKind(e.target.value as 图表种类)}>{(['柱状图','折线图','饼图'] as const).map(k=><option key={k}>{k}</option>)}</select></label>
    <label>图表数据<textarea rows={5} value={input} onChange={e=>setInput(e.target.value)} maxLength={24000} placeholder={'每行输入“分类,数值”，也可从表格粘贴两列数据。'}/></label>
    {input.trim() && chart.error && <p role="alert">{chart.error}</p>}
    <div ref={ref} className="seal-chart-preview">{chart.data&&<ChartRenderer 对象={chart.data}/>}</div>
    <ExportDrawing getSvg={()=>ref.current?.querySelector('svg')??null} disabled={!chart.data} name="图表" w={600} h={360}/>
  </div>
}

function HandwritingTool() {
  const svg=useRef<SVGSVGElement>(null), active=useRef<{id:number;stroke:Stroke}|null>(null)
  const [strokes,setStrokes]=useState<Stroke[]>([]),[draft,setDraft]=useState<Stroke|null>(null)
  const [color,setColor]=useState('#223147'),[width,setWidth]=useState(5)
  function point(event:PointerEvent<SVGSVGElement>):Point | null {
    const box=event.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return null
    return [Math.round(Math.max(0,Math.min(800,(event.clientX-box.left)/box.width*800))),Math.round(Math.max(0,Math.min(360,(event.clientY-box.top)/box.height*360)))]
  }
  function down(event:PointerEvent<SVGSVGElement>) {
    const p=point(event)
    if (active.current || event.button!==0 || !p) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const stroke={points:[p],color,width}
    active.current={id:event.pointerId,stroke};setDraft(stroke)
  }
  function move(event:PointerEvent<SVGSVGElement>) {
    const current=active.current,p=point(event)
    if(!current || current.id!==event.pointerId || !p) return
    const prev=current.stroke.points[current.stroke.points.length-1]
    if(prev[0]!==p[0] || prev[1]!==p[1]) current.stroke.points.push(p)
    setDraft({...current.stroke})
  }
  function finish(event:PointerEvent<SVGSVGElement>,keep:boolean) {
    const current=active.current
    if(!current || current.id!==event.pointerId) return
    if(keep) { move(event);setStrokes(previous=>[...previous,current.stroke]) }
    active.current=null;setDraft(null)
  }
  return <div className="seal-creative-tool">
    <div className="seal-pen-settings">
      <label>笔迹颜色<select value={color} onChange={e=>setColor(e.target.value)}><option value="#223147">墨黑</option><option value="#235bc4">深蓝</option><option value="#b53b3c">朱红</option></select></label>
      <label>笔画粗细<select value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={2}>细</option><option value={5}>中</option><option value={9}>粗</option></select></label>
    </div>
    <svg ref={svg} aria-label="手写画布" role="img" className="seal-handwriting-canvas" viewBox="0 0 800 360" preserveAspectRatio="none" onPointerDown={down} onPointerMove={move} onPointerUp={e=>finish(e,true)} onPointerCancel={e=>finish(e,false)} onLostPointerCapture={e=>finish(e,false)}>
      {(draft?[...strokes,draft]:strokes).map((stroke,i)=>stroke.points.length===1
        ? <circle key={i} cx={stroke.points[0][0]} cy={stroke.points[0][1]} r={stroke.width/2} fill={stroke.color}/>
        : <polyline key={i} points={stroke.points.map(p=>p.join(',')).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round"/>)}
    </svg>
    <Button disabled={!strokes.length||Boolean(draft)} onClick={()=>setStrokes(previous=>previous.slice(0,-1))}>撤销上一笔</Button>
    <ExportDrawing name="手写字迹" getSvg={()=>svg.current} disabled={!strokes.length||Boolean(draft)} w={800} h={360}/>
  </div>
}
export default function CreativeTools({tool}:{tool:CreativeTool}) {
  if(tool==='collect-form') return <MultiTablePage initialView="form"/>
  return tool==='make-chart'?<ChartTool/>:<HandwritingTool/>
}
