import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { 播放控制器, type 播放快照 } from './controller'
import { 播放画面 } from './PlaybackPage'
import { 标记放映开始 } from '../presentationState'
import { 画布宽, 画布高, type 演示文稿 } from '../deck'
import type { 图片地址表 } from '../render/SlideObjects'

interface Props {
  文稿: 演示文稿
  起始索引: number
  /** 自定义放映或页码范围计算出的放映顺序；缺省时按常规可见页播放 */
  序列?: number[]
  图片地址?: 图片地址表
  on退出: () => void
}

/**
 * 窗口阅读视图：在编辑窗口内的只读播放，与整屏放映共用播放控制器与呈现层，
 * 保留返回编辑、页码与暂停控制；不请求系统全屏，退出后恢复原焦点与助手输入。
 */
export default function 阅读视图({ 文稿, 起始索引, 序列, 图片地址, on退出 }: Props) {
  const 根 = useRef<HTMLDivElement>(null)
  const 控制 = useRef<播放控制器 | null>(null)
  const 退出引用 = useRef(on退出)
  退出引用.current = on退出
  const [状态, set状态] = useState<播放快照 | null>(null)
  const [缩放, set缩放] = useState(1)
  const [错误, set错误] = useState<string | null>(null)

  useEffect(() => {
    const 原焦点 = document.activeElement
    const 释放放映 = 标记放映开始()
    根.current?.focus()
    return () => {
      释放放映()
      if (原焦点 instanceof HTMLElement && 原焦点.isConnected) 原焦点.focus()
    }
  }, [])

  useEffect(() => {
    let 实例: 播放控制器
    try {
      实例 = new 播放控制器(文稿, 起始索引, {
        更新: set状态,
        翻页: () => {},
        结束: () => 退出引用.current(),
        停止媒体: () => 根.current?.querySelectorAll('audio,video').forEach((节点) => {
          const 媒体 = 节点 as HTMLMediaElement
          媒体.pause()
          媒体.currentTime = 0
        }),
      }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, 序列 ? { 序列 } : {})
    } catch (失败) {
      set错误(失败 instanceof Error ? 失败.message : '无法开始阅读视图')
      return
    }
    控制.current = 实例
    实例.开始()
    return () => { 实例.销毁(); 控制.current = null }
  }, [文稿, 起始索引])

  useLayoutEffect(() => {
    const 更新 = () => set缩放(Math.min(1, (根.current?.clientWidth ?? 画布宽) / 画布宽))
    更新()
    const 观察器 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(更新)
    if (根.current) 观察器?.observe(根.current)
    return () => 观察器?.disconnect()
  }, [])

  useEffect(() => {
    const 处理按键 = (事件: KeyboardEvent) => {
      // 隔离编辑器的保存、增删页与标签切换快捷键；阅读视图自行处理翻页
      事件.stopImmediatePropagation()
      if (事件.key === 'Escape') { 事件.preventDefault(); 退出引用.current(); return }
      if (!['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(事件.key)) return
      事件.preventDefault()
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(事件.key)) 控制.current?.单击()
      else 控制.current?.后退()
    }
    document.addEventListener('keydown', 处理按键, true)
    return () => document.removeEventListener('keydown', 处理按键, true)
  }, [])

  const 顺序 = 序列 ?? 文稿.幻灯片列表.map((_, 索引) => 索引).filter((索引) => !文稿.幻灯片列表[索引].隐藏)
  const 位置 = 状态 ? 顺序.indexOf(状态.索引) : 0
  const 序号 = 位置 >= 0 ? 位置 : 0

  return (
    <section className="wps-reading" role="region" aria-label="阅读视图" ref={根} tabIndex={-1}>
      <header className="wps-reading__bar">
        <span className="wps-reading__mode">阅读视图（窗口内播放）</span>
        <span className="wps-reading__page">{状态 ? `${序号 + 1} / ${顺序.length}` : `1 / ${顺序.length}`}</span>
      </header>
      {错误
        ? <p className="wps-reading__error" role="alert">{错误}</p>
        : <div className="wps-reading__stage" style={{ height: 画布高 * 缩放 }}>
            {状态 ? <播放画面 文稿={文稿} 状态={状态} 缩放={缩放} 图片地址={图片地址} /> : null}
          </div>}
      <footer className="wps-reading__controls">
        <button type="button" onClick={() => 控制.current?.后退()} disabled={!状态 || 序号 === 0}>上一页</button>
        <button type="button" onClick={() => 控制.current?.单击()} disabled={!状态 || 序号 >= 顺序.length - 1}>下一页</button>
        <button type="button" onClick={() => 控制.current?.暂停(!状态?.暂停)} disabled={!状态}>{状态?.暂停 ? '继续' : '暂停'}</button>
        <button type="button" onClick={() => 退出引用.current()}>返回编辑</button>
      </footer>
    </section>
  )
}
