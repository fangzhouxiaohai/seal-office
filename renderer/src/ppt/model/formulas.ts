import { 解析公式表达式 as 解析主进程公式 } from '../../../../main/office/pptx/formulaSyntax.js'
import type { 演示对象 } from '../deck'

export interface 公式节点 {
  类型: string
  文本?: string
  底?: 公式节点[]
  幂?: 公式节点[]
  下?: 公式节点[]
  分子?: 公式节点[]
  分母?: 公式节点[]
  内容?: 公式节点[]
}

export const 默认公式表达式 = 'E = m c^2'
export const 默认公式字号 = 28
export const 默认公式颜色 = '#1A1D24'

/** 解析为界面可渲染的节点树；不支持的结构直接抛错，由面板显示真实原因。 */
export function 解析公式节点(表达式: string): 公式节点[] {
  return 解析主进程公式(表达式) as 公式节点[]
}

const 标识 = () => `formula-${crypto.randomUUID()}`

export function 创建公式(表达式 = 默认公式表达式, 字号 = 默认公式字号, 颜色 = 默认公式颜色): 演示对象 {
  解析公式节点(表达式)
  return { id: 标识(), 类型: '公式', x: 140, y: 200, width: 360, height: 110, 公式: { 表达式, 字号, 颜色 } }
}

export function 更新公式(对象: 演示对象, 修改: Partial<{ 表达式: string; 字号: number; 颜色: string }>): 演示对象 {
  if (对象.类型 !== '公式' || !对象.公式) throw new Error('请选择公式对象')
  const 公式 = { ...对象.公式, ...修改 }
  if (typeof 公式.表达式 !== 'string' || !公式.表达式.trim()) throw new Error('公式表达式不能为空')
  if (!Number.isFinite(公式.字号) || 公式.字号 <= 0) throw new Error('公式字号无效')
  if (!/^#[0-9a-f]{6}$/i.test(公式.颜色)) throw new Error('公式颜色无效')
  解析公式节点(公式.表达式)
  return { ...对象, 公式 }
}
