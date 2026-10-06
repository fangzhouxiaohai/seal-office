// 讲义与备注母版设置：每页张数、页眉页脚、日期与页码、备注排版。
// 纯函数实现，界面、导出与回归共用同一套规则。
import type { 演示文稿, 幻灯片 } from '../deck'

export type 讲义张数 = 1 | 2 | 3 | 4 | 6 | 9
export type 备注排版 = '幻灯片加备注' | '仅备注'

export interface 讲义设置 {
  每页张数: 讲义张数
  页眉: string
  页脚: string
  显示日期: boolean
  显示页码: boolean
}

export interface 备注设置 {
  排版: 备注排版
  页眉: string
  页脚: string
  显示日期: boolean
  显示页码: boolean
}

export const 讲义张数列表: 讲义张数[] = [1, 2, 3, 4, 6, 9]

export const 默认讲义设置: 讲义设置 = { 每页张数: 6, 页眉: '', 页脚: '', 显示日期: false, 显示页码: true }

export const 默认备注设置: 备注设置 = { 排版: '幻灯片加备注', 页眉: '', 页脚: '', 显示日期: false, 显示页码: true }

const 文本上限 = 120

function 校验文本(值: unknown, 名称: string): void {
  if (typeof 值 !== 'string') throw new Error(`${名称}必须是文本`)
  if (值.length > 文本上限) throw new Error(`${名称}过长：最多 ${文本上限} 个字符`)
}

function 校验开关(值: unknown, 名称: string): void {
  if (typeof 值 !== 'boolean') throw new Error(`${名称}必须是开关状态`)
}

/** 校验讲义设置，越界或类型不符时给出真实原因 */
export function 校验讲义设置(设置: 讲义设置): void {
  if (!设置 || typeof 设置 !== 'object') throw new Error('讲义设置无效')
  if (!讲义张数列表.includes(设置.每页张数)) throw new Error('讲义每页张数只支持 1、2、3、4、6、9')
  校验文本(设置.页眉, '讲义页眉')
  校验文本(设置.页脚, '讲义页脚')
  校验开关(设置.显示日期, '讲义日期开关')
  校验开关(设置.显示页码, '讲义页码开关')
}

/** 校验备注设置 */
export function 校验备注设置(设置: 备注设置): void {
  if (!设置 || typeof 设置 !== 'object') throw new Error('备注设置无效')
  if (设置.排版 !== '幻灯片加备注' && 设置.排版 !== '仅备注') throw new Error('备注排版只支持「幻灯片加备注」或「仅备注」')
  校验文本(设置.页眉, '备注页眉')
  校验文本(设置.页脚, '备注页脚')
  校验开关(设置.显示日期, '备注日期开关')
  校验开关(设置.显示页码, '备注页码开关')
}

/** 日期显示为 YYYY-MM-DD（按本机时区），与常见讲义页眉一致 */
export function 格式化日期(时间: Date): string {
  const 年 = 时间.getFullYear()
  const 月 = String(时间.getMonth() + 1).padStart(2, '0')
  const 日 = String(时间.getDate()).padStart(2, '0')
  return `${年}-${月}-${日}`
}

/** 替换页眉页脚中的 <日期> 与 <页码> 占位符；未使用占位符时返回原文本 */
export function 读取讲义占位符(模板: string, 页码: number, 时间: Date = new Date()): string {
  if (typeof 模板 !== 'string' || 模板.length === 0) return ''
  return 模板.replace(/<日期>/g, 格式化日期(时间)).replace(/<页码>/g, String(页码))
}

/** 讲义网格：1 张一行一列，2/3 张单列，4/6 张两列，9 张三列 */
export function 讲义网格(张数: 讲义张数): { 列数: number; 行数: number } {
  if (张数 === 2) return { 列数: 1, 行数: 2 }
  if (张数 === 3) return { 列数: 1, 行数: 3 }
  if (张数 === 4) return { 列数: 2, 行数: 2 }
  if (张数 === 6) return { 列数: 2, 行数: 3 }
  if (张数 === 9) return { 列数: 3, 行数: 3 }
  return { 列数: 1, 行数: 1 }
}

export interface 讲义项 {
  序号: number
  页: 幻灯片
}

/** 按讲义每页张数分页；隐藏页不进入讲义，最后一页不足也成页 */
export function 规划讲义页(文稿: 演示文稿, 设置: 讲义设置): 讲义项[][] {
  校验讲义设置(设置)
  const 可见 = 文稿.幻灯片列表.map((页, 序号) => ({ 序号, 页 })).filter(项 => !项.页.隐藏)
  if (可见.length === 0) throw new Error('没有可输出的页面：请取消至少一页的隐藏状态')
  const 页列表: 讲义项[][] = []
  for (let 起点 = 0; 起点 < 可见.length; 起点 += 设置.每页张数) {
    页列表.push(可见.slice(起点, 起点 + 设置.每页张数))
  }
  return 页列表
}
