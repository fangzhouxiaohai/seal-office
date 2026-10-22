import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MobileAssistantLauncher from './MobileAssistantLauncher'
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals()})
it('桌面海豹悬浮球鼠标拖动不误打开，点击打开，方向键移动，窗口缩小时保持可见',()=>{
  vi.stubGlobal('PointerEvent',class extends MouseEvent {pointerId=1;isPrimary=true})
  const open=vi.fn();render(<MobileAssistantLauncher desktop disabled={false} onOpen={open}/>)
  const button=screen.getByRole('button',{name:'打开智能助手'}) as HTMLButtonElement
  button.setPointerCapture=vi.fn();button.hasPointerCapture=()=>true;button.releasePointerCapture=vi.fn()
  expect(button).toHaveClass('assistant-desktop-launcher');expect(button.querySelector('svg')).not.toBeNull()
  const start=parseFloat(button.style.left)
  fireEvent.pointerDown(button,{button:0,clientX:start,clientY:200})
  fireEvent.pointerMove(button,{clientX:start-100,clientY:240})
  fireEvent.pointerUp(button,{clientX:start-100,clientY:240})
  expect(parseFloat(button.style.left)).toBe(start-100)
  fireEvent.click(button);expect(open).not.toHaveBeenCalled()
  fireEvent.click(button);expect(open).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(button,{key:'ArrowLeft'});expect(parseFloat(button.style.left)).toBe(start-116)
  expect(localStorage.getItem('seal.desktop.assistant.position.v1')).not.toBeNull()
  expect(localStorage.getItem('seal.mobile.assistant.position.v1')).toBeNull()
  vi.stubGlobal('innerWidth',320);fireEvent(window,new Event('resize'))
  expect(parseFloat(button.style.left)).toBeLessThanOrEqual(252)
})
