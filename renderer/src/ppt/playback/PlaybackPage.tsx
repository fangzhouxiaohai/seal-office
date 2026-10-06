import React from 'react'
import type { 演示文稿, 幻灯片 } from '../deck'
import { SlideObjects, 背景样式, 页脚图层, type 图片地址表 } from '../render/SlideObjects'
import { 读取有效页脚, 读取页面尺寸 } from '../model/themes'
import { 解析页面背景 } from '../model/masters'
import { 读取切换 } from '../model/transitions'
import { 图表步数, 读取图表显示, type 图表显示 } from '../model/elements'
import { 切换帧, 离页帧, 动画帧, 运行帧 } from './transitionEngine'
import { 匹配平滑对象, 平滑帧, 平滑进入帧, 平滑退出帧 } from './morph'
import type { 播放快照 } from './controller'

function 对象画面({ 页, 状态, 图片地址, 页序号, 页脚, 页面尺寸, 仅标识, 放映 = true, on媒体失败 }: { 页: 幻灯片; 状态: 播放快照; 图片地址?: 图片地址表; 页序号: number; 页脚?: Parameters<typeof 页脚图层>[0]['页脚']; 页面尺寸: { 宽: number; 高: number }; 仅标识?: string[]; 放映?: boolean; on媒体失败?: (错误: unknown) => void }) {
  const 根 = React.useRef<HTMLDivElement>(null), 活动 = React.useRef<Animation[]>([])
  const 减少动态 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const [图表步, set图表步] = React.useState<Record<string, number>>({})
  const 暂停引用 = React.useRef(状态.暂停); 暂停引用.current = 状态.暂停
  // 图表分步：按图表自身的每步时长推进；暂停时冻结，完成后由控制器状态落到最终画面。
  React.useEffect(() => {
    const 分步 = (页.动画序列 ?? []).filter(a => a.效果 === '图表分步' && 状态.活动动画.includes(a.id))
    if (!分步.length) return
    const 计时器: ReturnType<typeof setInterval>[] = []
    for (const a of 分步) {
      const 图 = (页.对象列表 ?? []).find(项 => 项.id === a.对象标识)?.图表
      if (!图?.动态) continue
      const 总步 = 图表步数(图)
      if (!总步) continue
      let 已完成 = 0
      const 定时 = setInterval(() => {
        if (暂停引用.current) return
        已完成 += 1
        set图表步(旧 => ({ ...旧, [a.id]: Math.min(总步, 已完成) }))
        if (已完成 >= 总步) clearInterval(定时)
      }, 图.动态.每步毫秒)
      计时器.push(定时)
    }
    return () => 计时器.forEach(定时 => clearInterval(定时))
  }, [状态.活动动画.join(','), 状态.页代次, 页])
  const 图表显示表: Record<string, 图表显示> = {}
  for (const a of 页.动画序列 ?? []) {
    if (a.效果 !== '图表分步') continue
    const 图 = (页.对象列表 ?? []).find(项 => 项.id === a.对象标识)?.图表
    if (!图?.动态) continue
    const 总步 = 图表步数(图)
    const 完成 = 状态.完成动画.includes(a.id) ? 总步 : Math.min(总步, 图表步[a.id] ?? 0)
    const 显示 = 读取图表显示(图, 完成)
    if (显示) 图表显示表[a.对象标识] = 显示
  }
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
  }, [页, 状态, 图表步])
  React.useLayoutEffect(() => {
    const 节点 = Array.from(根.current?.querySelectorAll<HTMLElement>('[data-框标识],[data-对象标识]') ?? [])
    for (const a of 页.动画序列 ?? []) if (状态.活动动画.includes(a.id)) {
      const 元素 = 节点.find(n => (n.getAttribute('data-框标识') ?? n.getAttribute('data-对象标识')) === a.对象标识)
      if (元素) { const 动画 = 运行帧(元素, 动画帧(a.效果,减少动态,页面尺寸.高-parseFloat(元素.style.top)),a.持续毫秒); if (动画) { if (状态.暂停) 动画.pause(); 活动.current.push(动画) } }
    }
    return () => { 活动.current.forEach(a => a.cancel()); 活动.current = [] }
  }, [状态.活动动画.join(','), 状态.页代次, 页, 减少动态])
  React.useLayoutEffect(() => { 活动.current.forEach(a => 状态.暂停 ? a.pause() : a.play()) }, [状态.暂停, 状态.活动动画])
  return <div ref={根}><SlideObjects 幻灯片={页} 图片地址={图片地址} 图表显示={图表显示表} 仅标识={仅标识} 页脚={页脚} 页序号={页序号} 页面尺寸={页面尺寸} 放映={放映} on媒体失败={on媒体失败}/></div>
}
export function 播放画面({ 文稿, 状态, 缩放, 图片地址, on媒体失败 }: { 文稿: 演示文稿; 状态: 播放快照; 缩放: number; 图片地址?: 图片地址表; on媒体失败?: (错误: unknown) => void }) {
  const 当前 = React.useRef<HTMLDivElement>(null), 旧页 = React.useRef<HTMLDivElement>(null), 动画 = React.useRef<Animation[]>([])
  const 最近 = React.useRef(状态), 前页 = React.useRef<播放快照 | null>(null)
  if (最近.current.页代次 !== 状态.页代次) 前页.current = 最近.current
  最近.current = 状态
  const 页 = 文稿.幻灯片列表[状态.索引], 设置 = 读取切换(页)
  const 页面尺寸 = 读取页面尺寸(文稿), 页脚 = 读取有效页脚(文稿, 页, 状态.索引), 背景 = 解析页面背景(文稿, 页), 减少动态 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const 平滑中 = 设置.效果 === '平滑' && 状态.阶段 === '切换' && 前页.current !== null && 前页.current.索引 !== 状态.索引
  const 匹配 = React.useMemo(() => 平滑中 && 前页.current ? 匹配平滑对象(文稿.幻灯片列表[前页.current.索引], 页) : null, [状态.页代次, 平滑中])
  React.useLayoutEffect(() => {
    if (状态.阶段 !== '切换') return
    for (const [元素, 帧] of [[当前.current, 切换帧(设置,减少动态)], [旧页.current, 离页帧(设置,减少动态)]] as const) {
      if (元素) { const a = 运行帧(元素,帧,设置.持续毫秒); if (a) { if (状态.暂停) a.pause(); 动画.current.push(a) } }
    }
    return () => { 动画.current.forEach(a=>a.cancel()); 动画.current=[] }
  }, [状态.页代次, 状态.阶段 === '切换'])
  // 平滑：按稳定标识插值；类型变化对象按旧对象淡出与新对象淡入处理。
  React.useLayoutEffect(() => {
    if (!匹配) return
    const 运行: Animation[] = []
    const 查 = (标识: string) => 当前.current?.querySelector<HTMLElement>(`[data-框标识="${标识}"],[data-对象标识="${标识}"]`) ?? null
    for (const 配对 of 匹配.配对) {
      const 元素 = 查(配对.标识)
      const a = 元素 && 运行帧(元素, 平滑帧(配对, 配对.前旋转, 配对.后旋转, 减少动态), 设置.持续毫秒)
      if (a) 运行.push(a)
    }
    for (const 标识 of 匹配.进入) {
      const 元素 = 查(标识)
      const a = 元素 && 运行帧(元素, 平滑进入帧(减少动态), 设置.持续毫秒)
      if (a) 运行.push(a)
    }
    const 旧层动画 = 旧页.current && 运行帧(旧页.current, 平滑退出帧(减少动态), 设置.持续毫秒)
    if (旧层动画) 运行.push(旧层动画)
    if (状态.暂停) 运行.forEach(a => a.pause())
    动画.current.push(...运行)
    return () => { 运行.forEach(a => a.cancel()); 动画.current = 动画.current.filter(a => !运行.includes(a)) }
  }, [状态.页代次, 匹配 !== null])
  React.useLayoutEffect(() => { 动画.current.forEach(a=>状态.暂停 ? a.pause() : a.play()) },[状态.暂停])
  const 样式 = { width:页面尺寸.宽, height:页面尺寸.高, ...背景样式(背景, 图片地址, 页.背景色) }
  const 前景旧页 = 设置.效果 === '抽出' || (['分割','形状'].includes(设置.效果) && 设置.方式 === '内')
  return <div className="wps-playback-stage" style={{ width:页面尺寸.宽, height:页面尺寸.高, transform:`scale(${缩放})` }}>
    {状态.阶段 === '切换' && <div ref={旧页} className="wps-playback-layer" style={{ ...样式, background:前页.current ? 文稿.幻灯片列表[前页.current.索引].背景色 : 'black', zIndex:前景旧页 ? 2 : 0 }}>{前页.current && <对象画面 页={文稿.幻灯片列表[前页.current.索引]} 状态={{...前页.current,活动动画:[]}} 图片地址={图片地址} 页序号={前页.current.索引} 页脚={读取有效页脚(文稿, 文稿.幻灯片列表[前页.current.索引], 前页.current.索引)} 页面尺寸={页面尺寸} 仅标识={匹配?.退出} on媒体失败={on媒体失败}/>}</div>}
    <div ref={当前} className={`wps-playback-layer wps-slideshow__page${设置.效果==='推进' ? ' wps-slideshow__page--push':设置.效果==='淡入淡出'?' wps-slideshow__page--fade':''}`} style={{ ...样式, zIndex:1 }}><对象画面 key={状态.页代次} 页={页} 状态={状态} 图片地址={图片地址} 页序号={状态.索引} 页脚={页脚} 页面尺寸={页面尺寸} on媒体失败={on媒体失败}/></div>
  </div>
}
