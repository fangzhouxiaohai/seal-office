// Ctrl+滚轮缩放：把滚轮的滚动量按步长折算成页面缩放，并拦下浏览器的整页缩放。
import { useEffect, useRef } from 'react'

export interface 缩放范围 {
  下限: number
  上限: number
  步长: number
}

/** 各模块沿用状态栏既有的缩放范围，避免两处取值漂移 */
export const 文字缩放范围: 缩放范围 = { 下限: 0.5, 上限: 2, 步长: 0.1 }
export const 表格缩放范围: 缩放范围 = { 下限: 0.5, 上限: 2, 步长: 0.1 }
export const 演示缩放范围: 缩放范围 = { 下限: 0.1, 上限: 4, 步长: 0.1 }
export const 阅读缩放范围: 缩放范围 = { 下限: 0.5, 上限: 2, 步长: 0.25 }

/** 累积到该像素量走一步；鼠标滚轮一格通常约 100，触控板与捏合会给出更小的增量 */
const 每步像素 = 100

/** 只有按住 Ctrl（或 macOS 的 Command）才是缩放；Alt 组合留给系统与编辑器自身 */
export function 是缩放滚轮(事件: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  return Boolean((事件.ctrlKey || 事件.metaKey) && !事件.altKey)
}

/** 把按行、按页的滚动量折算成像素，便于统一累加 */
export function 折算滚动像素(事件: { deltaY: number; deltaMode?: number }): number {
  const 原始 = Number.isFinite(事件.deltaY) ? 事件.deltaY : 0
  switch (事件.deltaMode ?? 0) {
    case 1:
      return 原始 * 16
    case 2:
      return 原始 * 每步像素
    default:
      return 原始
  }
}

/**
 * 生成滚轮缩放处理器：累积滚动量，够一步就按步长调整并返回新值。
 * 向上滚（负 deltaY）放大、向下滚缩小，与浏览器习惯一致；已在边界或不足一步返回 null。
 */
export function 创建滚轮缩放(范围: 缩放范围): (事件: { deltaY: number; deltaMode?: number }, 当前: number) => number | null {
  if (!Number.isFinite(范围.下限) || !Number.isFinite(范围.上限) || !Number.isFinite(范围.步长) ||
      范围.下限 <= 0 || 范围.上限 <= 范围.下限 || 范围.步长 <= 0) {
    throw new Error('缩放范围无效')
  }
  let 累计 = 0
  return (事件, 当前) => {
    累计 += 折算滚动像素(事件)
    const 步数 = Math.trunc(累计 / 每步像素)
    if (步数 === 0) return null
    // 已消费的滚动量从累计中扣除，到边界后继续滚动不会积压成突然跳变
    累计 -= 步数 * 每步像素
    if (!Number.isFinite(当前)) return null
    const 目标 = Math.min(范围.上限, Math.max(范围.下限, 当前 - 步数 * 范围.步长))
    const 取整 = Number(目标.toFixed(2))
    return 取整 === 当前 ? null : 取整
  }
}

/**
 * 把 Ctrl+滚轮接到某个缩放状态上。
 * 事件挂在 window 上并声明 passive:false，这样在编辑区内按住 Ctrl 滚动时
 * 既改变页面缩放，也不会让浏览器把整个界面一起缩放。
 */
export function use滚轮缩放(当前: number, 提交: (值: number) => void, 范围: 缩放范围): void {
  // 用 ref 保存最新值，避免每次缩放都重新挂监听
  const 最新 = useRef({ 当前, 提交 })
  最新.current = { 当前, 提交 }
  const { 下限, 上限, 步长 } = 范围
  useEffect(() => {
    const 处理 = 创建滚轮缩放({ 下限, 上限, 步长 })
    const 监听 = (事件: WheelEvent) => {
      if (!是缩放滚轮(事件)) return
      const 下一个 = 处理(事件, 最新.current.当前)
      事件.preventDefault()
      if (下一个 !== null) 最新.current.提交(下一个)
    }
    window.addEventListener('wheel', 监听, { passive: false })
    return () => window.removeEventListener('wheel', 监听)
  }, [下限, 上限, 步长])
}
