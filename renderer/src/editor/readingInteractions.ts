import { useEffect, useRef, useState, type RefObject } from 'react'

export interface ReadingPoint { x: number; y: number }
export interface PinchReadingOptions {
  enabled: boolean
  scale: number
  onScale: (value: number) => void
  min?: number
  max?: number
  resolveViewport?: (target: EventTarget | null) => HTMLElement | null
  captureAnchor?: (point: ReadingPoint) => unknown
  restoreAnchor?: (anchor: unknown) => void
  identity?: unknown
}
const interactive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,input,textarea,select,[contenteditable="true"],[data-reading-control]'))

/** Single-finger scrolling stays native (including scroll snap and momentum).
 * Only an intentional two-finger pinch is owned by the document view. */
export function useReadingPinch(root: RefObject<HTMLElement>, options: PinchReadingOptions) {
  const latest=useRef(options);latest.current=options
  useEffect(()=>{
    const element=root.current
    if(!element||!options.enabled)return
    let gesture:{distance:number;scale:number;viewport:HTMLElement;anchor:unknown;left:number;top:number;x:number;y:number}|null=null
    let consumed=false,composing=false,frame=0
    const point=(event:TouchEvent)=>({x:(event.touches[0].clientX+event.touches[1].clientX)/2,y:(event.touches[0].clientY+event.touches[1].clientY)/2})
    const distance=(event:TouchEvent)=>Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY)
    const start=(event:TouchEvent)=>{
      if(composing||interactive(event.target)||event.touches.length!==2)return
      const viewport=latest.current.resolveViewport?.(event.target)??element,center=point(event),rect=viewport.getBoundingClientRect(),span=distance(event)
      if(span<8)return
      consumed=true;gesture={distance:span,scale:latest.current.scale,viewport,anchor:latest.current.captureAnchor?.(center),left:viewport.scrollLeft,top:viewport.scrollTop,x:center.x-rect.left,y:center.y-rect.top}
      if(event.cancelable)event.preventDefault()
    }
    const move=(event:TouchEvent)=>{
      if(!consumed||composing)return
      if(event.cancelable)event.preventDefault()
      if(!gesture||event.touches.length!==2)return
      const active=gesture,value=Math.min(latest.current.max??4,Math.max(latest.current.min??0.5,active.scale*distance(event)/active.distance)),ratio=value/active.scale
      latest.current.onScale(value)
      if(frame)cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        frame=0
        if(latest.current.restoreAnchor&&active.anchor!==undefined)latest.current.restoreAnchor(active.anchor)
        else {active.viewport.scrollLeft=(active.left+active.x)*ratio-active.x;active.viewport.scrollTop=(active.top+active.y)*ratio-active.y}
      })
    }
    const end=(event:TouchEvent)=>{if(consumed&&event.cancelable)event.preventDefault();if(!event.touches.length){consumed=false;gesture=null}}
    const cancel=()=>{consumed=false;gesture=null;if(frame)cancelAnimationFrame(frame);frame=0}
    const composingStart=()=>{composing=true;cancel()},composingEnd=()=>{composing=false}
    element.addEventListener('touchstart',start,{passive:false});element.addEventListener('touchmove',move,{passive:false});element.addEventListener('touchend',end,{passive:false});element.addEventListener('touchcancel',cancel)
    element.addEventListener('compositionstart',composingStart,true);element.addEventListener('compositionend',composingEnd,true)
    return()=>{cancel();element.removeEventListener('touchstart',start);element.removeEventListener('touchmove',move);element.removeEventListener('touchend',end);element.removeEventListener('touchcancel',cancel);element.removeEventListener('compositionstart',composingStart,true);element.removeEventListener('compositionend',composingEnd,true)}
  },[root,options.enabled,options.identity])
}

/** Fullscreen API when allowed; fixed viewport fallback for mobile WebViews and
 * denied browser requests. Back/Escape restores focus and background state. */
export function useReadingFullscreen(root:RefObject<HTMLElement>,active:boolean,onClose:()=>void,restoreFocus?:()=>HTMLElement|null|undefined){
  const latest=useRef(onClose);latest.current=onClose
  const focusTarget=useRef(restoreFocus);focusTarget.current=restoreFocus
  const [native,setNative]=useState(false)
  useEffect(()=>{
    const element=root.current
    if(!active||!element)return
    let disposed=false,enteredNative=false
    const focus=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow
    const background=Array.from(document.body.children).filter(node=>node instanceof HTMLElement&&node!==element&&!node.contains(element)).map(node=>({node:node as HTMLElement,inert:(node as HTMLElement).inert,hidden:node.getAttribute('aria-hidden')}))
    for(const {node}of background){node.inert=true;node.setAttribute('aria-hidden','true')}
    document.body.style.overflow='hidden';element.focus({preventScroll:true})
    const fullscreen=()=>{if(disposed)return;if(document.fullscreenElement===element){enteredNative=true;setNative(true)}else if(enteredNative)latest.current()}
    const close=(event:Event)=>{event.preventDefault();latest.current()}
    const key=(event:KeyboardEvent)=>{
      if(event.isComposing||event.keyCode===229)return
      if(event.key==='Escape'){event.preventDefault();latest.current();return}
      if(event.key==='Tab'){
        const items=Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex="0"],a[href]')).filter(node=>!node.closest('[hidden],[inert]')&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden')
        const first=items[0],last=items[items.length-1]
        if(!first){event.preventDefault();element.focus()}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===element)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===element)){event.preventDefault();first.focus()}
      }
    }
    document.addEventListener('fullscreenchange',fullscreen);element.addEventListener('keydown',key);window.addEventListener('seal-before-native-back',close)
    if(!document.fullscreenElement&&typeof element.requestFullscreen==='function'){
      try{void Promise.resolve(element.requestFullscreen()).then(()=>{if(disposed){if(document.fullscreenElement===element)void document.exitFullscreen().catch(()=>{})}else fullscreen()}).catch(()=>{if(!disposed)setNative(false)})}
      catch{setNative(false)}
    }
    return()=>{
      disposed=true;document.removeEventListener('fullscreenchange',fullscreen);element.removeEventListener('keydown',key);window.removeEventListener('seal-before-native-back',close)
      if(document.fullscreenElement===element&&document.exitFullscreen)void document.exitFullscreen().catch(()=>{})
      for(const {node,inert,hidden}of background){node.inert=inert;if(hidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',hidden)}
      document.body.style.overflow=overflow;setNative(false);const target=focusTarget.current?.()??focus;if(target?.isConnected)target.focus({preventScroll:true})
    }
  },[root,active])
  return native
}
