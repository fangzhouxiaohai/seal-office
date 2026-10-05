import type { 幻灯片 } from '../deck'
export const 基础动画 = ['出现', '淡入', '淡出', '进入', '退出'] as const
export interface 对象动画 { id: string; 对象标识: string; 效果: typeof 基础动画[number]; 触发: '单击'|'同时'|'之后'; 持续毫秒: number }
export function 校验动画(页: 幻灯片) {
  if (页.动画) throw new Error('旧动画没有对象引用，无法可靠保存，请重新设置对象动画')
  if (页.动画序列 !== undefined && !Array.isArray(页.动画序列)) throw new Error('动画序列无效')
  const 标识 = new Set<string>(), 对象 = new Set([...页.文本框列表, ...页.对象列表 ?? []].filter(项 => !('类型' in 项) || !['组合','媒体'].includes(项.类型)).map(项 => 项.id))
  for (const 项 of 页.动画序列 ?? []) {
    if (!项 || !项.id || 标识.has(项.id) || !对象.has(项.对象标识) || !基础动画.includes(项.效果) || !['单击','同时','之后'].includes(项.触发) || !Number.isInteger(项.持续毫秒) || 项.持续毫秒 < 0 || 项.持续毫秒 > 60000) throw new Error('动画参数或对象引用无效')
    标识.add(项.id)
  }
}
export function 动画分组(序列: 对象动画[]) {
  const 组: 对象动画[][] = []
  for (const 项 of 序列) { if (项.触发 === '同时' && 组.length) 组[组.length - 1].push(项); else 组.push([项]) }
  return 组
}
