// Ctrl+滚轮缩放：把滚轮的滚动量按档位折算成页面缩放，并拦下浏览器的整页缩放。
// 缩放按固定百分比档位行走：最小 8.33%，最大 6400%，避免高倍时需要滚上百次。
import { useEffect, useRef } from 'react'

/** 所有文件首次打开使用四倍显示；打印纸张尺寸不受影响。 */
export const 默认文件缩放 = 4

export interface 缩放范围 {
  下限: number
  上限: number
  /** 相邻档位之间的比例；保留字段以兼容既有调用 */
  步长: number
}

/** 缩放百分比档位（百分数）：从 8.33% 到 6400% */
export const 缩放档位百分比 = [
  8.33, 12.5, 25, 33, 50, 66, 75, 90, 100,
  110, 125, 150, 175, 200, 250, 300, 400, 500, 600,
  800, 1000, 1200, 1600, 2000, 2400, 3200, 4000, 4800, 6400,
] as const

const 百分比下限 = 缩放档位百分比[0]
const 百分比上限 = 缩放档位百分比[缩放档位百分比.length - 1]

/** 四类文件统一使用同一区间；步长字段保留为 0，实际按档位行走 */
export const 文字缩放范围: 缩放范围 = { 下限: 百分比下限 / 100, 上限: 百分比上限 / 100, 步长: 0 }
export const 表格缩放范围: 缩放范围 = { 下限: 百分比下限 / 100, 上限: 百分比上限 / 100, 步长: 0 }
export const 演示缩放范围: 缩放范围 = { 下限: 百分比下限 / 100, 上限: 百分比上限 / 100, 步长: 0 }
export const 阅读缩放范围: 缩放范围 = { 下限: 百分比下限 / 100, 上限: 百分比上限 / 100, 步长: 0 }

/** 累积到该像素量走一档；鼠标滚轮一格通常约 100，触控板与捏合会给出更小的增量 */
const 每档像素 = 100

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
      return 原始 * 每档像素
    default:
      return 原始
  }
}

/** 缩放比例的百分比文本：整数档位不带小数，8.33% 这类档位保留两位并去掉末尾的 0 */
export function 缩放百分比文本(缩放: number): string {
  if (!Number.isFinite(缩放)) return '100%'
  const 百分比 = 缩放 * 100
  const 取整 = Math.round(百分比)
  if (Math.abs(百分比 - 取整) < 0.005) return `${取整}%`
  return `${百分比.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

/** 找到与当前缩放最接近的档位下标；介于两档之间时取更接近的一档 */
export function 档位下标(缩放: number): number {
  let 最近 = 0
  let 最小差 = Number.POSITIVE_INFINITY
  缩放档位百分比.forEach((百分比, 下标) => {
    const 差 = Math.abs(百分比 / 100 - 缩放)
    if (差 < 最小差) { 最小差 = 差; 最近 = 下标 }
  })
  return 最近
}

/** 放大一档；已是最大档时返回 null，供调用方判断“到边界了” */
export function 放大一档(缩放: number): number | null {
  const 当前 = 档位下标(缩放)
  const 目标 = Math.min(缩放档位百分比.length - 1, 当前 + 1)
  if (当前 >= 缩放档位百分比.length - 1 && 缩放 >= 百分比上限 / 100) return null
  const 值 = 缩放档位百分比[目标] / 100
  return 值 === 缩放 ? null : 值
}

/** 缩小一档；已是最小档时返回 null */
export function 缩小一档(缩放: number): number | null {
  const 当前 = 档位下标(缩放)
  const 目标 = Math.max(0, 当前 - 1)
  if (当前 <= 0 && 缩放 <= 百分比下限 / 100) return null
  const 值 = 缩放档位百分比[目标] / 100
  return 值 === 缩放 ? null : 值
}

/** 把任意取值吸附到最近的档位并钳制在区间内 */
export function 吸附档位(缩放: number): number {
  const 下标 = 档位下标(Math.min(Math.max(缩放, 百分比下限 / 100), 百分比上限 / 100))
  return 缩放档位百分比[下标] / 100
}

/**
 * 生成滚轮缩放处理器：累积滚动量，够一档就沿档位表移动并返回新值。
 * 向上滚（负 deltaY）放大、向下滚缩小，与浏览器习惯一致；已在边界或不足一档返回 null。
 */
export function 创建滚轮缩放(范围: 缩放范围): (事件: { deltaY: number; deltaMode?: number }, 当前: number) => number | null {
  if (!Number.isFinite(范围.下限) || !Number.isFinite(范围.上限) ||
      范围.下限 <= 0 || 范围.上限 <= 范围.下限) {
    throw new Error('缩放范围无效')
  }
  let 累计 = 0
  return (事件, 当前) => {
    累计 += 折算滚动像素(事件)
    const 档数 = Math.trunc(累计 / 每档像素)
    if (档数 === 0) return null
    // 已消费的滚动量从累计中扣除，到边界后继续滚动不会积压成突然跳变
    累计 -= 档数 * 每档像素
    if (!Number.isFinite(当前)) return null
    let 结果 = 当前
    for (let 次 = 0; 次 < Math.abs(档数); 次 += 1) {
      const 下一个 = 档数 > 0 ? 缩小一档(结果) : 放大一档(结果)
      if (下一个 === null) break
      结果 = 下一个
    }
    const 钳制 = Math.min(范围.上限, Math.max(范围.下限, 结果))
    return 钳制 === 当前 ? null : 钳制
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
  const { 下限, 上限 } = 范围
  useEffect(() => {
    const 处理 = 创建滚轮缩放({ 下限, 上限, 步长: 0 })
    const 监听 = (事件: WheelEvent) => {
      if (!是缩放滚轮(事件)) return
      const 下一个 = 处理(事件, 最新.current.当前)
      事件.preventDefault()
      if (下一个 !== null) 最新.current.提交(下一个)
    }
    window.addEventListener('wheel', 监听, { passive: false })
    return () => window.removeEventListener('wheel', 监听)
  }, [下限, 上限])
}
