import React from 'react'
import { 画布宽, 画布高, type 演示文稿, type 幻灯片 } from '../deck'
import { SlideObjects, type 图片地址表 } from '../render/SlideObjects'
import { 读取切换 } from '../model/transitions'
import { 切换帧, 离页帧, 动画帧, 运行帧 } from './transitionEngine'
import type { 播放快照 } from './controller'

function 对象画面({ 页, 状态, 图片地址, 放映 = true, on媒体失败 }: { 页: 幻灯片; 状态: 播放快照; 图片地址?: 图片地址表; 放映?: boolean; on媒体失败?: (错误: unknown) => void }) {
  const 根 = React.useRef<HTMLDivElement>(null), 活动 = React.useRef<Animation[]>([])
  const 减少动态 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  React.useLayoutEffect(() => {
    const 节点 = Array.from(根.current?.querySelectorAll<HTMLElement>('[data-框标识],[data-对象标识]') ?? [])
    for (const 节点项 of 节点) {
      const 标识 = 节点项.getAttribute('data-框标识') ?? 节点项.getAttribute('data-对象标识'), 序列 = (页.动画序列 ?? []).filter(a => a.对象标识 === 标识)
      let 显示 = !序列.length || ['淡出','退出'].includes(序列[0].效果)
      for (const a of 序列) {
        if (状态.完成动画.includes(a.id)) 显示 = !['淡出','退出'].includes(a.效果)
        if (状态.活动动画.includes(a.id)) 显示 = true
      }
      节点项.style.visibility = 显示 ? 'visible' : 'hidden'
    }
  }, [页, 状态])
  React.useLayoutEffect(() => {
    const 节点 = Array.from(根.current?.querySelectorAll<HTMLElement>('[data-框标识],[data-对象标识]') ?? [])
    for (const a of 页.动画序列 ?? []) if (状态.活动动画.includes(a.id)) {
      const 元素 = 节点.find(n => (n.getAttribute('data-框标识') ?? n.getAttribute('data-对象标识')) === a.对象标识)
      if (元素) { const 动画 = 运行帧(元素, 动画帧(a.效果,减少动态,画布高-parseFloat(元素.style.top)),a.持续毫秒); if (动画) { if (状态.暂停) 动画.pause(); 活动.current.push(动画) } }
    }
    return () => { 活动.current.forEach(a => a.cancel()); 活动.current = [] }
  }, [状态.活动动画.join(','), 状态.页代次, 页, 减少动态])
  React.useLayoutEffect(() => { 活动.current.forEach(a => 状态.暂停 ? a.pause() : a.play()) }, [状态.暂停, 状态.活动动画])
  return <div ref={根}><SlideObjects 幻灯片={页} 图片地址={图片地址} 放映={放映} on媒体失败={on媒体失败}/></div>
}
export function 播放画面({ 文稿, 状态, 缩放, 图片地址, on媒体失败 }: { 文稿: 演示文稿; 状态: 播放快照; 缩放: number; 图片地址?: 图片地址表; on媒体失败?: (错误: unknown) => void }) {
  const 当前 = React.useRef<HTMLDivElement>(null), 旧页 = React.useRef<HTMLDivElement>(null), 动画 = React.useRef<Animation[]>([])
  const 最近 = React.useRef(状态), 前页 = React.useRef<播放快照 | null>(null)
  if (最近.current.页代次 !== 状态.页代次) 前页.current = 最近.current
  最近.current = 状态
  const 页 = 文稿.幻灯片列表[状态.索引], 设置 = 读取切换(页), 减少动态 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  React.useLayoutEffect(() => {
    if (状态.阶段 !== '切换') return
    for (const [元素, 帧] of [[当前.current, 切换帧(设置,减少动态)], [旧页.current, 离页帧(设置,减少动态)]] as const) {
      if (元素) { const a = 运行帧(元素,帧,设置.持续毫秒); if (a) { if (状态.暂停) a.pause(); 动画.current.push(a) } }
    }
    return () => { 动画.current.forEach(a=>a.cancel()); 动画.current=[] }
  }, [状态.页代次, 状态.阶段 === '切换'])
  React.useLayoutEffect(() => { 动画.current.forEach(a=>状态.暂停 ? a.pause() : a.play()) },[状态.暂停])
  const 样式 = { width:画布宽, height:画布高, background:页.背景色 }
  const 前景旧页 = 设置.效果 === '抽出' || (['分割','形状'].includes(设置.效果) && 设置.方式 === '内')
  return <div className="wps-playback-stage" style={{ width:画布宽, height:画布高, transform:`scale(${缩放})` }}>
    {状态.阶段 === '切换' && <div ref={旧页} className="wps-playback-layer" style={{ ...样式, background:前页.current ? 文稿.幻灯片列表[前页.current.索引].背景色 : 'black', zIndex:前景旧页 ? 2 : 0 }}>{前页.current && <对象画面 页={文稿.幻灯片列表[前页.current.索引]} 状态={{...前页.current,活动动画:[]}} 图片地址={图片地址} on媒体失败={on媒体失败}/>}</div>}
    <div ref={当前} className={`wps-playback-layer wps-slideshow__page${设置.效果==='推进' ? ' wps-slideshow__page--push':设置.效果==='淡入淡出'?' wps-slideshow__page--fade':''}`} style={{ ...样式, zIndex:1 }}><对象画面 key={状态.页代次} 页={页} 状态={状态} 图片地址={图片地址} on媒体失败={on媒体失败}/></div>
  </div>
}
