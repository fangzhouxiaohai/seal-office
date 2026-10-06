import React from 'react'
import { 画布宽, 画布高 } from '../deck'

export type 演示工具 = '无' | '画笔' | '橡皮' | '激光笔'
export interface 笔画 { 点: Array<{ x: number; y: number }> }
export interface 批迹 { 颜色: string; 笔宽: number; 笔画: Array<Array<{ x: number; y: number }>> }

/** 把屏幕坐标换算成画布坐标，越界点裁剪到画布范围内。 */
export function 屏幕转画布(事件: { clientX: number; clientY: number }, 区域: DOMRect): { x: number; y: number } {
  const 比例 = Math.min(区域.width / 画布宽, 区域.height / 画布高)
  const 左 = 区域.left + (区域.width - 画布宽 * 比例) / 2, 上 = 区域.top + (区域.height - 画布高 * 比例) / 2
  const x = (事件.clientX - 左) / 比例, y = (事件.clientY - 上) / 比例
  return { x: Math.min(画布宽, Math.max(0, x)), y: Math.min(画布高, Math.max(0, y)) }
}

/** 临时批迹与激光笔：只覆盖在放映画面上，不写入文稿，也不进入静态导出。 */
export function 临时批迹层({ 工具, 颜色, 笔宽, 批迹, 激光位置, on批迹, on激光, on橡皮 }: {
  工具: 演示工具
  颜色: string
  笔宽: number
  批迹: 批迹
  激光位置: { x: number; y: number } | null
  on批迹: (更新: 批迹) => void
  on激光: (位置: { x: number; y: number } | null) => void
  on橡皮: (位置: { x: number; y: number }) => void
}) {
  const 绘制中 = React.useRef(false)
  void 颜色; void 笔宽
  if (工具 === '无') return null
  const 处理按下 = (事件: React.PointerEvent<SVGSVGElement>) => {
    事件.stopPropagation()
    const 点 = 屏幕转画布(事件, 事件.currentTarget.getBoundingClientRect())
    if (工具 === '橡皮') { on橡皮(点); return }
    if (工具 === '激光笔') { on激光(点); return }
    绘制中.current = true
    事件.currentTarget.setPointerCapture?.(事件.pointerId)
    on批迹({ ...批迹, 笔画: [...批迹.笔画, [点]] })
  }
  const 处理移动 = (事件: React.PointerEvent<SVGSVGElement>) => {
    const 点 = 屏幕转画布(事件, 事件.currentTarget.getBoundingClientRect())
    if (工具 === '激光笔') { on激光(点); return }
    if (!绘制中.current || 工具 !== '画笔') return
    const 笔画列表 = 批迹.笔画.map((笔画, 序号) => 序号 === 批迹.笔画.length - 1 ? [...笔画, 点] : 笔画)
    on批迹({ ...批迹, 笔画: 笔画列表 })
  }
  const 处理抬起 = (事件: React.PointerEvent<SVGSVGElement>) => {
    绘制中.current = false
    if (事件.currentTarget.hasPointerCapture?.(事件.pointerId)) 事件.currentTarget.releasePointerCapture?.(事件.pointerId)
  }
  return <svg className="wps-present-ink" viewBox={`0 0 ${画布宽} ${画布高}`} width="100%" height="100%"
    style={{ position: 'absolute', inset: 0, zIndex: 4, cursor: 工具 === '画笔' ? 'crosshair' : 工具 === '橡皮' ? 'cell' : 'none', touchAction: 'none' }}
    onPointerDown={处理按下} onPointerMove={处理移动} onPointerUp={处理抬起} onPointerCancel={处理抬起}>
    {批迹.笔画.map((笔画, 序号) => <polyline key={序号} points={笔画.map(点 => `${点.x},${点.y}`).join(' ')} fill="none" stroke={批迹.颜色} strokeWidth={批迹.笔宽} strokeLinecap="round" strokeLinejoin="round" />)}
    {工具 === '激光笔' && 激光位置 && <circle cx={激光位置.x} cy={激光位置.y} r={12} fill="#E34D59" opacity={0.75} />}
  </svg>
}

/** 橡皮命中的笔画整体移除，符合现场演示的直觉操作。 */
export function 橡皮移除(批迹: 批迹, 位置: { x: number; y: number }): 批迹 {
  const 命中 = (点: { x: number; y: number }) => Math.hypot(点.x - 位置.x, 点.y - 位置.y) <= Math.max(12, 批迹.笔宽 * 3)
  return { ...批迹, 笔画: 批迹.笔画.filter(笔画 => !笔画.some(命中)) }
}
