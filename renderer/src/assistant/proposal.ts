import { 净化富文本 } from '../editor/sanitizeHtml'
import { 解析地址 } from '../sheet/address'
import { 写入单元格, 读取单元格, type Sheet } from '../sheet/model'
import type { 演示文稿, 文本框 } from '../ppt/deck'

export type 文字修改 = { 种类: '文字替换'; 查找: string; 替换为: string }
export type 表格修改 = { 种类: '单元格写入'; 工作表: string; 地址: string; 原值: string; 新值: string }
export type 演示修改 = { 种类: '演示文本替换'; 页码: number; 文本框标识: string; 查找: string; 替换为: string }
export type 助手修改 = 文字修改 | 表格修改 | 演示修改
export type 助手回复 = { 回复: string; 修改: 助手修改[] }

function 有限文本(值: unknown, 字段: string, 可空 = false): string {
  if (typeof 值 !== 'string' || 值.length > 12000 || (!可空 && !值.trim())) throw new Error(`${字段}格式无效`)
  return 值
}

/** 仅接受固定的修改指令；模型输出不能直接运行任意命令。 */
export function 解析助手回复(原文: string): 助手回复 {
  const 文本 = 原文.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let 数据: unknown
  try { 数据 = JSON.parse(文本) }
  catch {
    if (文本.startsWith('{') || 文本.startsWith('[')) throw new Error('模型回复的修改格式无效，请重新描述需求')
    return { 回复: 有限文本(文本, '模型回复'), 修改: [] }
  }
  if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) throw new Error('模型回复格式无效')
  const 对象 = 数据 as Record<string, unknown>
  const 回复 = 有限文本(对象.回复, '模型回复')
  if (!Array.isArray(对象.修改) || 对象.修改.length > 20) throw new Error('模型修改数量无效')
  const 修改 = 对象.修改.map((项): 助手修改 => {
    if (!项 || typeof 项 !== 'object' || Array.isArray(项)) throw new Error('模型修改格式无效')
    const 指令 = 项 as Record<string, unknown>
    if (指令.种类 === '文字替换') return { 种类: '文字替换', 查找: 有限文本(指令.查找, '查找文本'), 替换为: 有限文本(指令.替换为, '替换文本', true) }
    if (指令.种类 === '单元格写入') return { 种类: '单元格写入', 工作表: 有限文本(指令.工作表, '工作表'), 地址: 有限文本(指令.地址, '单元格地址'), 原值: 有限文本(指令.原值, '原值', true), 新值: 有限文本(指令.新值, '新值', true) }
    if (指令.种类 === '演示文本替换') {
      if (!Number.isSafeInteger(指令.页码) || Number(指令.页码) < 1) throw new Error('幻灯片页码无效')
      return { 种类: '演示文本替换', 页码: Number(指令.页码), 文本框标识: 有限文本(指令.文本框标识, '文本框标识'), 查找: 有限文本(指令.查找, '查找文本'), 替换为: 有限文本(指令.替换为, '替换文本', true) }
    }
    throw new Error('模型返回了不支持的修改指令，未执行任何操作')
  })
  return { 回复, 修改 }
}

/** 只替换唯一文本节点中的原文，保留文字周边的标签与格式。 */
export function 预览文字修改(html: string, 修改: 文字修改[]): string {
  const 根 = document.createElement('div')
  根.innerHTML = 净化富文本(html)
  for (const 项 of 修改) {
    if (!项.查找 || 项.查找.length > 12000 || 项.替换为.length > 12000) throw new Error('文字修改内容无效')
    const 遍历器 = document.createTreeWalker(根, NodeFilter.SHOW_TEXT)
    const 匹配: Array<{ 节点: Text; 位置: number }> = []
    let 节点: Node | null
    while ((节点 = 遍历器.nextNode()) !== null) {
      const 原文 = 节点.textContent ?? ''
      let 位置 = 原文.indexOf(项.查找)
      while (位置 >= 0) {
        匹配.push({ 节点: 节点 as Text, 位置 })
        位置 = 原文.indexOf(项.查找, 位置 + 项.查找.length)
      }
    }
    if (匹配.length === 0) throw new Error(`未找到需要修改的原文：${项.查找.slice(0, 40)}`)
    if (匹配.length !== 1) throw new Error(`原文不是唯一匹配，已阻止误改：${项.查找.slice(0, 40)}`)
    const { 节点: 命中节点, 位置 } = 匹配[0]
    const 原文 = 命中节点.textContent ?? ''
    命中节点.textContent = 原文.slice(0, 位置) + 项.替换为 + 原文.slice(位置 + 项.查找.length)
  }
  return 净化富文本(根.innerHTML)
}

export function 预览表格修改(工作表列表: Sheet[], 修改: 表格修改[]): Sheet[] {
  let 候选 = 工作表列表
  for (const 项 of 修改) {
    const 下标 = 候选.findIndex((表) => 表.name === 项.工作表)
    if (下标 < 0) throw new Error(`找不到工作表：${项.工作表}`)
    const 表 = 候选[下标]
    const 地址 = 项.地址.trim().toUpperCase()
    const 位置 = 解析地址(地址)
    if (!位置 || 位置.行 >= 表.行数 || 位置.列 >= 表.列数) throw new Error(`单元格地址超出工作表范围：${项.地址}`)
    if (读取单元格(表, 地址).原始值 !== 项.原值) throw new Error(`${表.name} 的 ${地址} 内容已变化，无法应用修改`)
    候选 = 候选.map((原表, 索引) => 索引 === 下标 ? 写入单元格(原表, 地址, 项.新值) : 原表)
  }
  return 候选
}

function 替换文本框(框: 文本框, 查找: string, 替换为: string): 文本框 {
  const 位置 = 框.text.indexOf(查找)
  if (位置 < 0) throw new Error('指定文本框中未找到原文')
  if (框.text.indexOf(查找, 位置 + 查找.length) >= 0) throw new Error('文本框中的原文不是唯一匹配')
  const 新文本 = 框.text.slice(0, 位置) + 替换为 + 框.text.slice(位置 + 查找.length)
  if (!框.片段列表?.length) return { ...框, text: 新文本 }
  const 命中 = 框.片段列表.map((片段, 索引) => ({ 索引, 位置: 片段.文本.indexOf(查找) })).filter((项) => 项.位置 >= 0)
  if (命中.length !== 1) throw new Error('原文跨越多个格式片段，无法在保留格式的前提下自动修改')
  const 片段列表 = 框.片段列表.map((片段, 索引) => 索引 === 命中[0].索引
    ? { ...片段, 文本: 片段.文本.slice(0, 命中[0].位置) + 替换为 + 片段.文本.slice(命中[0].位置 + 查找.length) }
    : 片段)
  return { ...框, text: 新文本, 片段列表 }
}

export function 预览演示修改(文稿: 演示文稿, 修改: 演示修改[]): 演示文稿 {
  let 候选 = 文稿
  for (const 项 of 修改) {
    const 页 = 候选.幻灯片列表[项.页码 - 1]
    if (!页) throw new Error(`幻灯片页码超出范围：${项.页码}`)
    const 框 = 页.文本框列表.find((目标) => 目标.id === 项.文本框标识)
    if (!框) throw new Error(`第 ${项.页码} 页找不到指定文本框`)
    const 新框 = 替换文本框(框, 项.查找, 项.替换为)
    候选 = { ...候选, 幻灯片列表: 候选.幻灯片列表.map((原页, 索引) => 索引 === 项.页码 - 1
      ? { ...原页, 文本框列表: 原页.文本框列表.map((原框) => 原框.id === 框.id ? 新框 : 原框) }
      : 原页) }
  }
  return 候选
}
