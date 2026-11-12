// 打开含内容风险文件时的选择：“仅查看”或“另存副本并编辑”。
//
// - 记住选择：按“文件路径 + 文件指纹”记在本机，同一文件再次打开不再询问，
//   但编辑区顶部的仅查看提示条仍会显示。文件内容变化（指纹不同）后重新询问。
// - 另存副本并编辑：打开链路只登记“待另存”，由对应编辑器在文档就绪后调用
//   自身现有的“另存为”流程，保证三种编辑器的保存校验、格式选择与原件保护一致。

import type { 本地文件内容 } from './fileOpen'

export type 打开选择 = '仅查看' | '另存副本'

const 存储键 = 'seal-open-choice:v1'
/** 记录上限：只保留最近的若干条，避免本机存储无限增长 */
const 记录上限 = 300

const 规范路径 = (路径: string) => 路径.replace(/\\/g, '/').toLowerCase()
const 记录键 = (路径: string, 指纹?: string) => `${规范路径(路径)}|${指纹 ?? ''}`

function 读取全部(): Record<string, 打开选择> {
  try {
    const 原文 = localStorage.getItem(存储键)
    if (!原文) return {}
    const 数据 = JSON.parse(原文)
    if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) return {}
    return Object.fromEntries(Object.entries(数据).filter(([, 值]) => 值 === '仅查看' || 值 === '另存副本')) as Record<string, 打开选择>
  } catch {
    // 本机存储不可用或内容损坏时不记忆，退回每次询问，不影响打开
    return {}
  }
}

export function 读取打开选择(路径: string, 指纹?: string): 打开选择 | null {
  return 读取全部()[记录键(路径, 指纹)] ?? null
}

export function 记住打开选择(路径: string, 指纹: string | undefined, 选择: 打开选择): void {
  try {
    const 全部 = 读取全部()
    delete 全部[记录键(路径, 指纹)]
    全部[记录键(路径, 指纹)] = 选择
    const 条目 = Object.entries(全部).slice(-记录上限)
    localStorage.setItem(存储键, JSON.stringify(Object.fromEntries(条目)))
  } catch {
    // 存储已满或被禁用时忽略：选择只是减少重复询问，不应阻断打开
  }
}

/** 已选择“另存副本并编辑”、等待编辑器执行另存的来源路径 */
const 待另存路径 = new Set<string>()

export function 登记待另存副本(路径: string): void {
  待另存路径.add(规范路径(路径))
}

/** 编辑器领取待另存请求；领取后即清除，避免重复弹出另存对话框 */
export function 领取待另存副本(路径: string | null | undefined): boolean {
  if (!路径) return false
  return 待另存路径.delete(规范路径(路径))
}

/** 关键内容缺失时只能查看的说明 */
export const 关键内容缺失说明 = '未能识别出可编辑的正文或数据，另存副本只会得到空白文件，因此本文件只能查看。'

const 空白文本 = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|\s|​/g, '') === ''
const 含可见对象 = (html: string) => /<(?:img|table|svg|video|audio|canvas|hr)\b/i.test(html)

/**
 * 关键内容缺失判据（满足任一即只给“仅查看”）：
 * 1. 解析器明确报告“文档内容为空”；
 * 2. 文字：正文没有任何文字，也没有图片、表格等可见对象；
 * 3. 表格：所有工作表都没有任何单元格内容；
 * 4. 演示：没有幻灯片，或所有幻灯片都没有任何对象与备注。
 * 只在存在内容风险时调用：此时空白结果说明内容全部未能导入，而不是原文件本来为空。
 */
export function 关键内容缺失(内容: 本地文件内容): boolean {
  if (内容.警告?.includes('文档内容为空')) return true
  if (内容.类型 === 'word') return 空白文本(内容.内容 ?? '') && !含可见对象(内容.内容 ?? '')
  if (内容.类型 === 'table') {
    const 表列表 = 内容.工作表列表
    if (!表列表?.length) return 空白文本(内容.内容 ?? '')
    return 表列表.every((表) => 'html' in 表
      ? 空白文本(表.html) && !含可见对象(表.html.replace(/<\/?(?:table|tbody|thead|tr|td|th|colgroup|col)\b[^>]*>/gi, ''))
      : Object.values((表 as { 单元格?: Record<string, { 原始值?: unknown; 公式?: unknown }> }).单元格 ?? {}).every((格) => (格.原始值 ?? '') === '' && !格.公式))
  }
  if (内容.类型 === 'ppt') {
    const 页列表 = (内容.演示文稿 as { 幻灯片列表?: Array<{ 对象列表?: unknown[]; 文本框列表?: unknown[]; 备注?: string }> } | undefined)?.幻灯片列表
    if (!Array.isArray(页列表) || 页列表.length === 0) return true
    return 页列表.every((页) => !(页.对象列表?.length) && !(页.文本框列表?.length) && !页.备注?.trim())
  }
  return false
}
