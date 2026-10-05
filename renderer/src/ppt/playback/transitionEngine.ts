import type { 切换设置 } from '../model/transitions'
import type { 对象动画 } from '../model/animations'
export function 切换帧(设置: 切换设置, 减少动态: boolean): Keyframe[] {
  if (减少动态 || ['无','切出','抽出'].includes(设置.效果)) return []
  const { 效果, 方向, 方式, 轴 } = 设置
  if (效果 === '淡入淡出') return [{ opacity: 0 }, { opacity: 1 }]
  if (效果 === '推进') return [{ translate: { 左: '100% 0', 右: '-100% 0', 上: '0 100%', 下: '0 -100%' }[方向] }, { translate: '0 0' }]
  if (效果 === '擦除') return [{ clipPath: { 左:'inset(0 0 0 100%)',右:'inset(0 100% 0 0)',上:'inset(100% 0 0 0)',下:'inset(0 0 100% 0)' }[方向] }, { clipPath: 'inset(0)' }]
  if (效果 === '形状') return 方式 === '外' ? [{ clipPath: 'inset(50%)' }, { clipPath: 'inset(0)' }] : []
  return 方式 === '外' ? [{ clipPath: 轴 === '水平' ? 'inset(50% 0)' : 'inset(0 50%)' }, { clipPath: 'inset(0)' }] : []
}
export function 离页帧(设置: 切换设置, 减少动态: boolean): Keyframe[] {
  if (减少动态) return []
  if (['推进','抽出'].includes(设置.效果)) return [{ translate:'0 0' }, { translate: {左:'-100% 0',右:'100% 0',上:'0 -100%',下:'0 100%'}[设置.方向] }]
  if (设置.方式==='内' && 设置.效果==='形状') return [{clipPath:'inset(0)'},{clipPath:'inset(50%)'}]
  if (设置.方式==='内' && 设置.效果==='分割') return [{clipPath:'inset(0)'},{clipPath:设置.轴==='水平'?'inset(50% 0)':'inset(0 50%)'}]
  return []
}
export function 动画帧(效果: 对象动画['效果'], 减少动态: boolean, 离页距离: number): Keyframe[] {
  if (减少动态 || 效果 === '出现') return []
  if (效果 === '淡入') return [{ opacity:0 },{ opacity:1 }]
  if (效果 === '淡出') return [{ opacity:1 },{ opacity:0 }]
  return 效果 === '进入' ? [{ translate:`0 ${离页距离}px` },{ translate:'0 0' }] : [{ translate:'0 0' },{ translate:`0 ${离页距离}px` }]
}
export function 运行帧(元素: HTMLElement, 帧: Keyframe[], 时长: number): Animation | undefined {
  if (!帧.length || !元素.animate) return undefined
  return 元素.animate(帧, { duration: 时长, fill:'both', easing:'linear' })
}
