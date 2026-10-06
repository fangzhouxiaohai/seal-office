import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import React from 'react'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import { 播放画面 } from './PlaybackPage'
import { 播放控制器, type 播放快照 } from './controller'

const 原动画 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
afterEach(() => {
  if (原动画) Object.defineProperty(HTMLElement.prototype,'animate',原动画)
  else Reflect.deleteProperty(HTMLElement.prototype,'animate')
  vi.restoreAllMocks(); vi.useRealTimers()
})
it('暂停跳页立即暂停新切换，恢复后画面和控制器一起继续', () => {
  vi.useFakeTimers()
  const 活动: {playState:string; pause:ReturnType<typeof vi.fn>; play:ReturnType<typeof vi.fn>; cancel:ReturnType<typeof vi.fn>}[] = []
  Object.defineProperty(HTMLElement.prototype, 'animate', {configurable:true,value:vi.fn(() => {
    const 动画 = {playState:'running',pause:vi.fn(()=>{动画.playState='paused'}),play:vi.fn(()=>{动画.playState='running'}),cancel:vi.fn(()=>{动画.playState='idle'})}
    活动.push(动画)
    return 动画 as unknown as Animation
  })})
  const 文稿 = 创建演示文稿()
  文稿.幻灯片列表.push(创建幻灯片())
  文稿.幻灯片列表.forEach(页=>{页.切换={效果:'推进',持续毫秒:700,方向:'左',方式:'外',轴:'水平'}})
  let 控制:播放控制器
  function 示例() {
    const [状态,设置状态] = React.useState<播放快照>({索引:0,阶段:'等待',暂停:false,活动动画:[],完成动画:[],页代次:0})
    React.useEffect(()=>{控制=new 播放控制器(文稿,0,{更新:设置状态,翻页:()=>{},结束:()=>{},停止媒体:()=>{}});控制.开始();return()=>控制.销毁()},[])
    return <><button onClick={()=>控制.暂停(true)}>暂停</button><button onClick={()=>控制.跳转(1)}>跳页</button><button onClick={()=>控制.暂停(false)}>恢复</button><播放画面 文稿={文稿} 状态={状态} 缩放={1}/></>
  }
  const {getByText,unmount} = render(<示例/> )
  fireEvent.click(getByText('暂停'))
  const 旧动画 = [...活动]
  fireEvent.click(getByText('跳页'))
  const 新动画 = 活动.slice(旧动画.length)
  expect(新动画.length).toBeGreaterThan(0)
  expect(新动画.every(a=>a.playState==='paused')).toBe(true)
  expect(旧动画.every(a=>a.cancel.mock.calls.length>0)).toBe(true)
  vi.advanceTimersByTime(2000)
  expect(控制!.快照.阶段).toBe('切换')
  fireEvent.click(getByText('恢复'))
  expect(新动画.every(a=>a.playState==='running')).toBe(true)
  expect(控制!.快照.暂停).toBe(false)
  act(()=>vi.advanceTimersByTime(700))
  expect(控制!.快照.阶段).toBe('等待')
  unmount()
})
