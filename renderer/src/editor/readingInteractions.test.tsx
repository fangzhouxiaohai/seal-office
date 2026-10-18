import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useReadingFullscreen, useReadingPinch } from './readingInteractions'
beforeEach(()=>{Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{configurable:true,value:()=>Promise.reject(new Error('unsupported in jsdom'))})})
afterEach(()=>{vi.restoreAllMocks();Reflect.deleteProperty(HTMLElement.prototype,'requestFullscreen');document.body.style.overflow='';Reflect.deleteProperty(document,'fullscreenElement')})
const touch=(x:number,y=100)=>({identifier:x,clientX:x,clientY:y})
function Pinch(){const ref=useRef<HTMLDivElement>(null),[scale,setScale]=useState(1);useReadingPinch(ref,{enabled:true,scale,onScale:setScale,min:.5,max:3});return <div ref={ref} data-testid="viewport"><input aria-label="不接管输入"/><output>{scale}</output></div>}
it('preserves native single-finger scroll, scales around the pinch midpoint, clamps and suppresses the remaining finger',async()=>{
  render(<Pinch/>);const area=screen.getByTestId('viewport');area.scrollLeft=40;area.scrollTop=80
  const single=new TouchEvent('touchmove',{touches:[touch(80)] as unknown as Touch[],bubbles:true,cancelable:true});fireEvent(area,single);expect(single.defaultPrevented).toBe(false)
  fireEvent.touchStart(area,{touches:[touch(50),touch(150)]});fireEvent.touchMove(area,{touches:[touch(0),touch(200)]})
  expect(screen.getByText('2')).toBeInTheDocument();await waitFor(()=>{expect(area.scrollLeft).toBe(180);expect(area.scrollTop).toBe(260)})
  const remaining=new TouchEvent('touchmove',{touches:[touch(100)] as unknown as Touch[],bubbles:true,cancelable:true});fireEvent(area,remaining);expect(remaining.defaultPrevented).toBe(true)
  fireEvent.touchMove(area,{touches:[touch(-500),touch(500)]});expect(screen.getByText('3')).toBeInTheDocument()
  fireEvent.touchCancel(area);const next=new TouchEvent('touchmove',{touches:[touch(80)] as unknown as Touch[],bubbles:true,cancelable:true});fireEvent(area,next);expect(next.defaultPrevented).toBe(false)
})
it('does not intercept IME or touches in native inputs',()=>{
  render(<Pinch/>);const area=screen.getByTestId('viewport'),input=screen.getByLabelText('不接管输入')
  fireEvent.touchStart(input,{touches:[touch(50),touch(150)]});fireEvent.touchMove(input,{touches:[touch(0),touch(200)]});expect(screen.getByText('1')).toBeInTheDocument()
  fireEvent.compositionStart(area);fireEvent.touchStart(area,{touches:[touch(50),touch(150)]});fireEvent.touchMove(area,{touches:[touch(0),touch(200)]});expect(screen.getByText('1')).toBeInTheDocument()
  fireEvent.compositionEnd(area);fireEvent.touchStart(area,{touches:[touch(50),touch(150)]});fireEvent.touchMove(area,{touches:[touch(0),touch(200)]});expect(screen.getByText('2')).toBeInTheDocument()
})
function Fullscreen(){const ref=useRef<HTMLElement>(null),[open,setOpen]=useState(false);const native=useReadingFullscreen(ref,open,()=>setOpen(false));return <><button onClick={()=>setOpen(true)}>进入阅读</button>{open&&createPortal(<section ref={ref} tabIndex={-1} data-testid="full" data-native={native}><button>首个</button><button onClick={()=>setOpen(false)}>退出</button></section>,document.body)}</>}
it('falls back after denied system fullscreen, traps focus, consumes native back and restores focus/body/inert state',async()=>{
  const request=vi.fn().mockRejectedValue(new Error('not allowed'));vi.spyOn(HTMLElement.prototype,'requestFullscreen').mockImplementation(request)
  const {container}=render(<Fullscreen/>),button=screen.getByText('进入阅读');button.focus();fireEvent.click(button)
  const full=screen.getByTestId('full');await waitFor(()=>expect(request).toHaveBeenCalledOnce());expect(full).toHaveFocus();expect(container).toHaveAttribute('aria-hidden','true');expect(document.body.style.overflow).toBe('hidden')
  fireEvent.keyDown(full,{key:'Tab'});expect(screen.getByText('首个')).toHaveFocus();fireEvent.keyDown(screen.getByText('首个'),{key:'Tab',shiftKey:true});expect(screen.getByText('退出')).toHaveFocus()
  const back=new Event('seal-before-native-back',{cancelable:true});fireEvent(window,back);expect(back.defaultPrevented).toBe(true)
  expect(screen.queryByTestId('full')).toBeNull();expect(button).toHaveFocus();expect(container).not.toHaveAttribute('aria-hidden');expect(document.body.style.overflow).toBe('')
})
it('system fullscreen exit closes the reader and IME Escape cannot close it',async()=>{
  vi.spyOn(HTMLElement.prototype,'requestFullscreen').mockImplementation(function(this:HTMLElement){Object.defineProperty(document,'fullscreenElement',{configurable:true,value:this});return Promise.resolve()})
  render(<Fullscreen/>);fireEvent.click(screen.getByText('进入阅读'));await waitFor(()=>expect(screen.getByTestId('full')).toHaveAttribute('data-native','true'))
  fireEvent.keyDown(screen.getByTestId('full'),{key:'Escape',isComposing:true});expect(screen.getByTestId('full')).toBeInTheDocument()
  Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null});fireEvent(document,new Event('fullscreenchange'));expect(screen.queryByTestId('full')).toBeNull()
})
