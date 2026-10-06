import type { 幻灯片 } from '../deck'

export interface 平滑几何 { x: number; y: number; width: number; height: number }
export interface 平滑配对 { 标识: string; 类型: string; 前: 平滑几何; 后: 平滑几何; 前旋转: number; 后旋转: number }
export interface 平滑匹配 { 配对: 平滑配对[]; 进入: string[]; 退出: string[]; 类型变化: string[] }

interface 条目 { 标识: string; 类型: string; 几何: 平滑几何; 旋转: number }

function 收集(页: 幻灯片): 条目[] {
  return [
    ...页.文本框列表.map(框 => ({ 标识: 框.id, 类型: '文本框', 几何: { x: 框.x, y: 框.y, width: 框.width, height: 框.height }, 旋转: 0 })),
    ...(页.对象列表 ?? []).map(对象 => ({ 标识: 对象.id, 类型: 对象.类型, 几何: { x: 对象.x, y: 对象.y, width: 对象.width, height: 对象.height }, 旋转: 对象.旋转 ?? 0 })),
  ]
}

/**
 * 平滑切换的稳定对象匹配：按页面内的稳定标识配对。
 * 规则：标识与类型都一致才插值；只在后页出现为进入；只在前页出现为退出；
 * 标识相同但类型变化时不做插值，旧对象退出、新对象进入。
 */
export function 匹配平滑对象(前页: 幻灯片, 后页: 幻灯片): 平滑匹配 {
  const 前 = new Map(收集(前页).map(项 => [项.标识, 项]))
  const 后 = new Map(收集(后页).map(项 => [项.标识, 项]))
  const 配对: 平滑配对[] = [], 进入: string[] = [], 退出: string[] = [], 类型变化: string[] = []
  for (const [标识, 项] of 后) {
    const 原 = 前.get(标识)
    if (!原) { 进入.push(标识); continue }
    if (原.类型 !== 项.类型) { 类型变化.push(标识); 退出.push(标识); 进入.push(标识); continue }
    配对.push({ 标识, 类型: 项.类型, 前: 原.几何, 后: 项.几何, 前旋转: 原.旋转, 后旋转: 项.旋转 })
  }
  for (const 标识 of 前.keys()) if (!后.has(标识)) 退出.push(标识)
  return { 配对, 进入, 退出, 类型变化 }
}

const 数 = (值: number) => Number(值.toFixed(4))

/** 一致几何不生成动画；减少动态效果时直接落到最终画面。 */
export function 平滑帧(配对: 平滑配对, 前旋转: number, 后旋转: number, 减少动态: boolean): Keyframe[] {
  if (减少动态) return []
  const 平移x = 配对.前.x - 配对.后.x, 平移y = 配对.前.y - 配对.后.y
  const 缩放x = 配对.后.width ? 配对.前.width / 配对.后.width : 1
  const 缩放y = 配对.后.height ? 配对.前.height / 配对.后.height : 1
  if (!平移x && !平移y && 缩放x === 1 && 缩放y === 1 && 前旋转 === 后旋转) return []
  return [
    { transform: `translate(${数(平移x)}px, ${数(平移y)}px) rotate(${数(前旋转)}deg) scale(${数(缩放x)}, ${数(缩放y)})` },
    { transform: `translate(0px, 0px) rotate(${数(后旋转)}deg) scale(1, 1)` },
  ]
}

export function 平滑进入帧(减少动态: boolean): Keyframe[] {
  return 减少动态 ? [] : [{ opacity: 0 }, { opacity: 1 }]
}
export function 平滑退出帧(减少动态: boolean): Keyframe[] {
  return 减少动态 ? [] : [{ opacity: 1 }, { opacity: 0 }]
}
