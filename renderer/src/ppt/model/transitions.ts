import type { 幻灯片, 演示文稿 } from '../deck'
export const 基础切换 = ['无', '淡入淡出', '推进', '切出', '擦除', '形状', '抽出', '分割'] as const
export interface 切换设置 { 效果: typeof 基础切换[number]; 持续毫秒: number; 方向: '左'|'右'|'上'|'下'; 方式: '内'|'外'; 轴: '水平'|'垂直' }
export interface 换片设置 { 单击: boolean; 自动毫秒?: number }
export function 读取切换(页: 幻灯片): 切换设置 {
  return 页.切换 ?? { 效果: (页.过渡效果 ?? '无') as 切换设置['效果'], 持续毫秒: 500, 方向: '左', 方式: '外', 轴: '水平' }
}
export function 校验播放参数(页: 幻灯片) {
  for (const 键 of ['切换','换片'] as const) if (页[键] !== undefined && (!页[键] || typeof 页[键] !== 'object' || Array.isArray(页[键]))) throw new Error('播放参数无效：设置必须为完整对象')
  const 设置 = 读取切换(页)
  if (!基础切换.includes(设置.效果) || !Number.isInteger(设置.持续毫秒) || 设置.持续毫秒 < 0 || 设置.持续毫秒 > 60000 || !['左','右','上','下'].includes(设置.方向) || !['内','外'].includes(设置.方式) || !['水平','垂直'].includes(设置.轴)) throw new Error('切换参数无效：请检查效果、方向和持续时间')
  if (页.隐藏 !== undefined && typeof 页.隐藏 !== 'boolean') throw new Error('隐藏页面状态无效')
  if (页.换片 && (typeof 页.换片.单击 !== 'boolean' || (页.换片.自动毫秒 !== undefined && (!Number.isInteger(页.换片.自动毫秒) || 页.换片.自动毫秒 < 100 || 页.换片.自动毫秒 > 86400000)))) throw new Error('自动换片时间必须介于 0.1 秒和 86400 秒之间')
}
export function 应用全部切换(文稿: 演示文稿, 页: 幻灯片): 演示文稿 {
  校验播放参数(页)
  return { ...文稿, 幻灯片列表: 文稿.幻灯片列表.map(项 => ({ ...项, 切换: { ...读取切换(页) }, 过渡效果: undefined, 换片: 页.换片 ? { ...页.换片 } : undefined })) }
}
