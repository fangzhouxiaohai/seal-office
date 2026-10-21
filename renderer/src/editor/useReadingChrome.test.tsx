import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useReadingChrome } from './useReadingChrome'

function Reader({active=true}:{active?:boolean}) {
  const root=useRef<HTMLElement>(null),chrome=useReadingChrome(root,active)
  return <section ref={root} tabIndex={-1} data-testid="reader" data-reading-controls={chrome.visible?'visible':'hidden'} data-auto={chrome.autoHide}>
    <header data-reading-chrome hidden={!chrome.visible}><button>返回</button><input aria-label="页码"/></header>
    <div data-testid="page">阅读正文<a href="#note">正文链接</a></div>
    <footer data-reading-chrome hidden={!chrome.visible}><button>下一页</button></footer>
  </section>
}
const point=(x=100,y=120)=>({identifier:1,clientX:x,clientY:y})
const advance=(time:number)=>act(()=>{vi.advanceTimersByTime(time)})
function tap(target:HTMLElement,x=100,y=120) {
  fireEvent.touchStart(target,{touches:[point(x,y)]})
  fireEvent.touchEnd(target,{touches:[]})
}
beforeEach(()=>{
  vi.useFakeTimers()
  vi.spyOn(window,'matchMedia').mockImplementation(query=>({matches:true,media:query,onchange:null,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:vi.fn()}))
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})
describe('移动全屏阅读操作栏',()=>{
  it('默认隐藏，双击显示顶底栏，3秒无操作再次隐藏',()=>{
    render(<Reader/>);const root=screen.getByTestId('reader'),page=screen.getByTestId('page')
    expect(root).toHaveAttribute('data-reading-controls','hidden')
    expect(screen.queryByRole('button',{name:'返回'})).toBeNull()
    fireEvent.click(page);expect(root).toHaveAttribute('data-reading-controls','hidden')
    fireEvent.doubleClick(page)
    expect(screen.getByRole('button',{name:'返回'})).toBeVisible()
    expect(screen.getByRole('button',{name:'下一页'})).toBeVisible()
    advance(2999);expect(root).toHaveAttribute('data-reading-controls','visible')
    advance(1);expect(root).toHaveAttribute('data-reading-controls','hidden')
  })
  it('真实双击触摸显示操作，滑动和双指手势不误触也不拦截原生单指滚动',()=>{
    render(<Reader/>);const root=screen.getByTestId('reader'),page=screen.getByTestId('page')
    tap(page);advance(150);tap(page)
    expect(root).toHaveAttribute('data-reading-controls','visible')
    advance(3000)
    tap(page);advance(100)
    fireEvent.touchStart(page,{touches:[point()]})
    const move=new TouchEvent('touchmove',{touches:[point(30,120)] as unknown as Touch[],bubbles:true,cancelable:true})
    fireEvent(page,move);fireEvent.touchEnd(page,{touches:[]})
    expect(move.defaultPrevented).toBe(false)
    expect(root).toHaveAttribute('data-reading-controls','hidden')
    fireEvent.touchStart(page,{touches:[point(),{...point(200),identifier:2}]})
    fireEvent.touchEnd(page,{touches:[]});advance(50);tap(page)
    expect(root).toHaveAttribute('data-reading-controls','hidden')
    fireEvent.touchCancel(page);advance(400);tap(page);advance(100);tap(page)
    expect(root).toHaveAttribute('data-reading-controls','visible')
  })
  it('长按、距离过远、正文链接和工具按钮的双击不会作为页面双击',()=>{
    render(<Reader/>);const root=screen.getByTestId('reader'),page=screen.getByTestId('page')
    fireEvent.touchStart(page,{touches:[point()]});advance(350);fireEvent.touchEnd(page,{touches:[]});tap(page)
    expect(root).toHaveAttribute('data-reading-controls','hidden')
    advance(400);tap(page);advance(100);tap(page,300)
    expect(root).toHaveAttribute('data-reading-controls','hidden')
    fireEvent.doubleClick(screen.getByRole('link',{name:'正文链接'}))
    expect(root).toHaveAttribute('data-reading-controls','hidden')
  })
  it('操作工具栏后重新计算3秒，按住按钮期间不突然隐藏，隐藏时移开指针焦点',()=>{
    render(<Reader/>);const root=screen.getByTestId('reader'),page=screen.getByTestId('page')
    fireEvent.doubleClick(page);advance(2500)
    const next=screen.getByRole('button',{name:'下一页'})
    fireEvent.pointerDown(next);act(()=>next.focus());advance(4000)
    expect(root).toHaveAttribute('data-reading-controls','visible')
    fireEvent.pointerUp(next);advance(2999);expect(root).toHaveAttribute('data-reading-controls','visible')
    advance(1);expect(root).toHaveAttribute('data-reading-controls','hidden');expect(root).toHaveFocus()
  })
  it('Tab可显示并聚焦工具栏，键盘焦点和输入法编辑不会被计时器隐藏',()=>{
    render(<Reader/>);const root=screen.getByTestId('reader')
    act(()=>root.focus());fireEvent.keyDown(root,{key:'Tab'});advance(20)
    expect(screen.getByRole('button',{name:'返回'})).toHaveFocus()
    advance(3500);expect(root).toHaveAttribute('data-reading-controls','visible')
    const input=screen.getByRole('textbox',{name:'页码'})
    fireEvent.pointerDown(input);act(()=>input.focus());fireEvent.pointerUp(input)
    fireEvent.compositionStart(input);advance(5000);expect(input).toBeVisible()
    fireEvent.compositionEnd(input);act(()=>root.focus());advance(3000)
    expect(root).toHaveAttribute('data-reading-controls','hidden')
  })
  it('退出全屏恢复普通工具栏，卸载后取消隐藏计时器',()=>{
    const {rerender,unmount}=render(<Reader/>);fireEvent.doubleClick(screen.getByTestId('page'))
    expect(vi.getTimerCount()).toBe(1)
    rerender(<Reader active={false}/>);expect(screen.getByRole('button',{name:'返回'})).toBeVisible()
    expect(vi.getTimerCount()).toBe(0)
    rerender(<Reader/>);expect(screen.queryByRole('button',{name:'返回'})).toBeNull()
    fireEvent.doubleClick(screen.getByTestId('page'));unmount();expect(vi.getTimerCount()).toBe(0)
  })
  it('桌面全屏保留常驻操作栏',()=>{
    vi.spyOn(window,'matchMedia').mockImplementation(query=>({matches:false,media:query,onchange:null,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),dispatchEvent:vi.fn()}))
    render(<Reader/>);advance(6000)
    expect(screen.getByRole('button',{name:'返回'})).toBeVisible()
    expect(screen.getByTestId('reader')).toHaveAttribute('data-auto','false')
  })
})
