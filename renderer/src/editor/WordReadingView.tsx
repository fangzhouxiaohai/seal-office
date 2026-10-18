import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { 净化富文本 } from './sanitizeHtml'
import { useReadingFullscreen, useReadingPinch, type ReadingPoint } from './readingInteractions'
import './reading.css'

export interface WordReadingState { page:number; zoom:number; mode:'pages'|'continuous'; top:number }
interface Props { html:string; title:string; fontSize:number; revisionView?:'markup'|'final'|'original'; initialState?:WordReadingState; onStateChange?:(state:WordReadingState)=>void; onClose:()=>void }
/** Actual browser column fragmentation, labelled as screen reading pages. It
 * never reuses or pretends to be the native Word/print page number. */
export default function WordReadingView({html,title,fontSize,revisionView='markup',initialState,onStateChange,onClose}:Props){
  const root=useRef<HTMLElement>(null),viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null)
  const [width,setWidth]=useState(0),[height,setHeight]=useState(0),[pages,setPages]=useState(1),[page,setPage]=useState(initialState?.page??1),[zoom,setZoom]=useState(initialState?.zoom??1),[mode,setMode]=useState<'pages'|'continuous'>(initialState?.mode??'pages')
  const savedTop=useRef(initialState?.top??0),pendingAnchor=useRef<unknown>(null)
  const safe=useMemo(()=>净化富文本(html),[html]),native=useReadingFullscreen(root,true,onClose)
  const go=(value:number)=>{const next=Math.max(1,Math.min(pages,value));setPage(next);if(viewport.current)viewport.current.scrollLeft=(next-1)*width}
  const capture=(point:ReadingPoint)=>{
    const doc=document as Document & {caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null}
    let range=document.caretRangeFromPoint?.(point.x,point.y)
    if(!range&&doc.caretPositionFromPoint){const pos=doc.caretPositionFromPoint(point.x,point.y);if(pos){range=document.createRange();range.setStart(pos.offsetNode,pos.offset)}}
    if(range&&content.current?.contains(range.startContainer))return range.cloneRange()
    const area=viewport.current
    return {page:page-1,top:area?.scrollTop??0,scale:zoom,y:point.y-(area?.getBoundingClientRect().top??0)}
  }
  const restore=(anchor:unknown)=>{
    const area=viewport.current
    if(!area)return
    if(anchor instanceof Range&&content.current?.contains(anchor.startContainer)){
      const range=anchor.cloneRange()
      if(range.startContainer.nodeType===Node.TEXT_NODE&&range.startOffset<(range.startContainer.textContent?.length??0))range.setEnd(range.startContainer,range.startOffset+1)
      const rect=range.getBoundingClientRect?.(),bounds=area.getBoundingClientRect()
      if(rect){if(mode==='pages'){const index=Math.max(0,Math.floor((rect.left-bounds.left+area.scrollLeft)/Math.max(1,area.clientWidth)));area.scrollLeft=index*area.clientWidth;setPage(index+1)}else {area.scrollTop+=rect.top-bounds.top-area.clientHeight/2;savedTop.current=area.scrollTop}return}
    }
    const fallback=anchor as {page?:number;top?:number;scale?:number;y?:number}
    if(mode==='pages')area.scrollLeft=Math.max(0,fallback?.page??page-1)*area.clientWidth
    else if(fallback?.scale){area.scrollTop=((fallback.top??0)+(fallback.y??0))*zoom/fallback.scale-(fallback.y??0);savedTop.current=area.scrollTop}
  }
  const changeZoom=(value:number)=>{const area=viewport.current,rect=area?.getBoundingClientRect(),anchor=capture({x:(rect?.left??0)+(area?.clientWidth??0)/2,y:(rect?.top??0)+(area?.clientHeight??0)/2});setZoom(Math.max(.75,Math.min(3,value)));requestAnimationFrame(()=>restore(anchor))}
  useReadingPinch(viewport,{enabled:true,scale:zoom,onScale:setZoom,min:.75,max:3,captureAnchor:capture,restoreAnchor:restore,identity:mode})
  useLayoutEffect(()=>{
    const area=viewport.current,node=content.current
    if(!area||!node)return
    let frame=0
    const measure=()=>{if(width!==area.clientWidth||height!==area.clientHeight){if(width>0&&height>0){const rect=area.getBoundingClientRect();pendingAnchor.current=capture({x:rect.left+20,y:rect.top+20})}setWidth(area.clientWidth);setHeight(area.clientHeight);return}const total=mode==='pages'&&area.clientWidth>0?Math.max(1,Math.ceil((node.scrollWidth-1)/area.clientWidth)):1;setPages(total);if(mode==='pages')setPage(old=>Math.min(old,total))}
    const schedule=()=>{if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
    measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;observer?.observe(area);observer?.observe(node);node.addEventListener('load',schedule,true);window.addEventListener('resize',schedule);void document.fonts?.ready.then(schedule)
    return()=>{if(frame)cancelAnimationFrame(frame);observer?.disconnect();node.removeEventListener('load',schedule,true);window.removeEventListener('resize',schedule)}
  },[safe,zoom,mode,width,height])
  useEffect(()=>{const area=viewport.current;if(!area)return;if(pendingAnchor.current){restore(pendingAnchor.current);pendingAnchor.current=null}else if(mode==='pages')area.scrollLeft=(page-1)*width;else area.scrollTop=savedTop.current},[width,mode,pages])
  useEffect(()=>{onStateChange?.({page,zoom,mode,top:savedTop.current})},[page,zoom,mode,onStateChange])
  const switchMode=()=>{const area=viewport.current,rect=area?.getBoundingClientRect();pendingAnchor.current=capture({x:(rect?.left??0)+20,y:(rect?.top??0)+20});setMode(mode==='pages'?'continuous':'pages')}
  return createPortal(<section ref={root} className="seal-fullscreen-reader seal-word-reader" role="dialog" aria-modal="true" aria-label="文字全屏阅读" tabIndex={-1} data-fullscreen={native?'native':'viewport'}>
    <div className="seal-fullscreen-reader__toolbar" role="toolbar" aria-label="全屏阅读工具">
      <button type="button" onClick={onClose} aria-label="退出全屏阅读">返回</button><span className="seal-fullscreen-reader__title">{title}</span>
      <button type="button" aria-label={mode==='pages'?'切换连续阅读':'切换左右翻页'} onClick={switchMode}>{mode==='pages'?'连续阅读':'左右翻页'}</button>
      <button type="button" aria-label="缩小阅读内容" disabled={zoom<=.75} onClick={()=>changeZoom(zoom-.25)}>−</button><output aria-label="阅读缩放">{Math.round(zoom*100)}%</output><button type="button" aria-label="放大阅读内容" disabled={zoom>=3} onClick={()=>changeZoom(zoom+.25)}>＋</button>
    </div>
    <div ref={viewport} className={`seal-word-reader__viewport seal-word-reader__viewport--${mode}`} aria-label={mode==='pages'?'文字左右翻页阅读区':'文字连续阅读区'} data-reading-page={page} data-reading-pages={pages} data-reading-zoom={zoom} onScroll={()=>{if(!viewport.current)return;if(mode==='pages'){if(viewport.current.clientWidth!==width)return;setPage(Math.min(pages,Math.max(1,Math.round(viewport.current.scrollLeft/Math.max(1,width))+1)))}else {savedTop.current=viewport.current.scrollTop;onStateChange?.({page,zoom,mode,top:savedTop.current})}}}>
      <div ref={content} className="seal-word-reader__content" contentEditable={false} data-seal-revision-view={revisionView} style={{'--reading-width':`${width}px`,'--reading-height':`${height}px`,fontSize:`${fontSize*zoom}px`} as React.CSSProperties} dangerouslySetInnerHTML={{__html:safe}}/>
      {mode==='pages'&&Array.from({length:pages},(_,index)=><span key={index} className="seal-word-reader__snap" aria-hidden="true" style={{left:index*width,width}}/>)}
    </div>
    <div className="seal-fullscreen-reader__footer">
      {mode==='pages'?<><button type="button" aria-label="上一阅读页" disabled={page<=1} onClick={()=>go(page-1)}>上一页</button><span aria-live="polite">阅读页 {page} / {pages}</span><button type="button" aria-label="下一阅读页" disabled={page>=pages} onClick={()=>go(page+1)}>下一页</button></>:<span>连续阅读</span>}
      <small>按屏重排 · 双指缩放</small>
    </div>
  </section>,document.body)
}

