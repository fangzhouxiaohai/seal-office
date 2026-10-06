import type { 切换设置 } from '../model/transitions'
import type { 对象动画 } from '../model/animations'

/** 轮辐：按辐条根数逐扇区展开，返回扇区多边形裁剪帧。 */
export function 扇形点(覆盖角: number, 半径 = 75): string {
  const 段 = Math.max(2, Math.ceil(覆盖角 / 15))
  const 点 = ['50% 50%']
  for (let i = 0; i <= 段; i++) {
    const 角 = (-90 + 覆盖角 * i / 段) * Math.PI / 180
    点.push(`${(50 + 半径 * Math.cos(角)).toFixed(2)}% ${(50 + 半径 * Math.sin(角)).toFixed(2)}%`)
  }
  return 点.join(', ')
}
export function 轮辐帧(辐条: number): Keyframe[] {
  const 步 = Math.max(1, Math.min(12, Math.round(辐条)))
  const 帧: Keyframe[] = [{ clipPath: 'circle(0% at 50% 50%)' }]
  for (let i = 1; i <= 步; i++) 帧.push({ clipPath: `polygon(${扇形点(Math.min(360, 360 * i / 步) + (i === 步 ? 0.01 : 0))})` })
  return 帧
}
/** 百叶窗与梳理：按轴使用条带遮罩展开。梳理条带更细，作为效果差异。 */
export function 条带帧(轴: '水平' | '垂直', 细: boolean): Keyframe[] {
  const 宽 = 细 ? 4 : 8, 方向 = 轴 === '水平' ? 'to right' : 'to bottom'
  const 遮罩 = `repeating-linear-gradient(${方向}, #000 0 ${宽}%, transparent ${宽}% ${宽 * 2}%)`
  return 轴 === '水平'
    ? [{ maskImage: 遮罩, maskSize: '0% 100%' }, { maskImage: 遮罩, maskSize: '100% 100%' }]
    : [{ maskImage: 遮罩, maskSize: '100% 0%' }, { maskImage: 遮罩, maskSize: '100% 100%' }]
}

export function 切换帧(设置: 切换设置, 减少动态: boolean): Keyframe[] {
  if (减少动态 || ['无','切出','抽出','平滑'].includes(设置.效果)) return []
  const { 效果, 方向, 方式, 轴 } = 设置
  if (效果 === '淡入淡出') return [{ opacity: 0 }, { opacity: 1 }]
  if (效果 === '推进') return [{ translate: { 左: '100% 0', 右: '-100% 0', 上: '0 100%', 下: '0 -100%' }[方向] }, { translate: '0 0' }]
  if (效果 === '擦除') return [{ clipPath: { 左:'inset(0 0 0 100%)',右:'inset(0 100% 0 0)',上:'inset(100% 0 0 0)',下:'inset(0 0 100% 0)' }[方向] }, { clipPath: 'inset(0)' }]
  if (效果 === '形状') return 方式 === '外' ? [{ clipPath: 'inset(50%)' }, { clipPath: 'inset(0)' }] : []
  if (效果 === '溶解') return [{ opacity: 0 }, { opacity: .35 }, { opacity: .7 }, { opacity: 1 }]
  if (效果 === '涟漪') return [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }]
  if (效果 === '新闻快报') return [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }, { opacity: 1 }]
  if (效果 === '轮辐') return 轮辐帧(设置.辐条 ?? 4)
  if (效果 === '百叶窗') return 条带帧(轴, false)
  if (效果 === '梳理') return 条带帧(轴, true)
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
  if (减少动态 || 效果 === '出现' || 效果 === '图表分步') return []
  if (效果 === '淡入') return [{ opacity:0 },{ opacity:1 }]
  if (效果 === '淡出') return [{ opacity:1 },{ opacity:0 }]
  return 效果 === '进入' ? [{ translate:`0 ${离页距离}px` },{ translate:'0 0' }] : [{ translate:'0 0' },{ translate:`0 ${离页距离}px` }]
}
export function 运行帧(元素: HTMLElement, 帧: Keyframe[], 时长: number): Animation | undefined {
  if (!帧.length || !元素.animate) return undefined
  return 元素.animate(帧, { duration: 时长, fill:'both', easing:'linear' })
}
