// 单据文本结构化解析：把 OCR 抄录文本（逐行文字、Markdown 或空格分隔的表格）按模板解析为
// 表头字段与明细行。完全基于识别文本的规则解析，不生成任何文本中不存在的值。
import { 单据模板列表, 识别模板列表, type 识别模板, type 识别字段 } from './templates'
import type { 单据解析结果, 解析行 } from './validation'

const 高置信度 = 0.9, 低置信度 = 0.3, 不可辨认置信度 = 0.2
const 不可辨认 = /\[无法辨认\]|�|\?{2,}|？{2,}/

const 全部别名 = [...new Set(识别模板列表.flatMap(模板 => [...模板.表头字段, ...模板.明细字段]).flatMap(字段 => 字段.别名))].sort((甲, 乙) => 乙.length - 甲.length)
const 是汉字 = (字: string | undefined) => !!字 && /[㐀-鿿]/u.test(字)

interface 标签位置 { 开始: number; 结束: number; 别名: string }

/** 找出一行中“标签：值”的标签位置；标签前须为行首或非汉字，避免“价税合计”误命中“合计” */
function 查找标签(行: string): 标签位置[] {
  const 结果: 标签位置[] = []
  let 位置 = 0
  while (位置 < 行.length) {
    let 命中: 标签位置 | null = null
    if (位置 === 0 || !是汉字(行[位置 - 1])) {
      for (const 别名 of 全部别名) {
        if (!行.startsWith(别名, 位置)) continue
        const 后续 = 行.slice(位置 + 别名.length).match(/^\s*[:：]/)
        if (后续) { 命中 = { 开始: 位置, 结束: 位置 + 别名.length + 后续[0].length, 别名 }; break }
      }
    }
    if (命中) { 结果.push(命中); 位置 = 命中.结束 } else 位置 += 1
  }
  return 结果
}

function 匹配字段(文本: string, 字段列表: 识别字段[]): 识别字段 | null {
  const 规范 = 文本.replace(/[\s:：*]/g, '')
  if (!规范) return null
  return 字段列表.find(字段 => 字段.别名.some(别名 => 别名.replace(/\s/g, '') === 规范)) ?? null
}

const 是分隔行 = (行: string) => /^\s*\|?\s*:?-{2,}/.test(行)
function 拆分单元格(行: string): string[] {
  if (行.includes('|')) return 行.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(格 => 格.trim())
  return 行.trim().split(/\t|\s+/).filter(Boolean)
}

function 置信度(文本: string): number { return 不可辨认.test(文本) ? 不可辨认置信度 : 高置信度 }
const 空行 = (): 解析行 => ({ 值: {}, 置信度: {} })

interface 表格结构 { 表头行: number; 结束行: number; 列: Array<识别字段 | null> }

function 查找表格(行列表: string[], 模板: 识别模板): 表格结构 | null {
  if (!模板.明细字段.length) return null
  for (let 序号 = 0; 序号 < 行列表.length; 序号++) {
    if (查找标签(行列表[序号]).length) continue
    const 列 = 拆分单元格(行列表[序号]).map(格 => 匹配字段(格, 模板.明细字段))
    if (列.filter(Boolean).length < 2) continue
    let 结束 = 序号 + 1
    while (结束 < 行列表.length && 行列表[结束].trim() && !查找标签(行列表[结束]).length) 结束 += 1
    return { 表头行: 序号, 结束行: 结束, 列 }
  }
  return null
}

function 提取表头(行列表: string[], 模板: 识别模板, 跳过: Set<number>): 解析行 {
  const 结果 = 空行()
  行列表.forEach((行, 序号) => {
    if (跳过.has(序号)) return
    const 标签列表 = 查找标签(行)
    标签列表.forEach((标签, 位置) => {
      const 字段 = 匹配字段(标签.别名, 模板.表头字段)
      if (!字段 || 结果.值[字段.键] !== undefined) return
      const 值 = 行.slice(标签.结束, 标签列表[位置 + 1]?.开始 ?? 行.length).replace(/\|/g, ' ').trim()
      if (!值) return
      结果.值[字段.键] = 值
      结果.置信度[字段.键] = 置信度(值)
    })
  })
  return 结果
}

function 计算命中(文本: string, 模板: 识别模板): number {
  const 行列表 = 文本.split(/\r?\n/)
  const 表格 = 查找表格(行列表, 模板)
  const 跳过 = new Set<number>(表格 ? Array.from({ length: 表格.结束行 - 表格.表头行 }, (_, 偏移) => 表格.表头行 + 偏移) : [])
  const 表头 = 提取表头(行列表, 模板, 跳过)
  return Object.keys(表头.值).length + (表格 ? new Set(表格.列.filter(Boolean).map(字段 => 字段!.键)).size : 0)
}

/** 按模板解析一张单据的识别文本 */
export function 解析单据文本(文本: string, 模板: 识别模板, 来源: string): 单据解析结果 {
  const 行列表 = 文本.split(/\r?\n/)
  const 表格 = 查找表格(行列表, 模板)
  const 跳过 = new Set<number>()
  const 明细: 解析行[] = []
  if (表格) {
    for (let 序号 = 表格.表头行; 序号 < 表格.结束行; 序号++) 跳过.add(序号)
    for (let 序号 = 表格.表头行 + 1; 序号 < 表格.结束行; 序号++) {
      const 行 = 行列表[序号]
      if (是分隔行(行)) continue
      const 单元格 = 拆分单元格(行)
      if (!单元格.some(Boolean)) continue
      const 错位 = 单元格.length !== 表格.列.length
      const 结果 = 空行()
      表格.列.forEach((字段, 列号) => {
        if (!字段) return
        const 值 = 单元格[列号] ?? ''
        结果.值[字段.键] = 值
        结果.置信度[字段.键] = 错位 ? 低置信度 : 置信度(值)
      })
      明细.push(结果)
    }
  }
  const 表头 = 提取表头(行列表, 模板, 跳过)
  const 命中 = Object.keys(表头.值).length + (表格 ? new Set(表格.列.filter(Boolean).map(字段 => 字段!.键)).size : 0)
  const 字段总数 = 模板.表头字段.length + 模板.明细字段.length
  const 模板匹配 = 命中 >= Math.min(2, 字段总数)
  return { 来源, 模板标识: 模板.标识, 表头: 模板匹配 ? 表头 : 空行(), 明细: 模板匹配 ? 明细 : [], 模板匹配, 原文: 文本 }
}

/** 按命中字段数推荐单据类型；命中少于 2 个字段时不推荐 */
export function 推荐模板(文本: string, 候选: 识别模板[] = 单据模板列表): 识别模板 | null {
  let 最佳: 识别模板 | null = null, 最高 = 1
  for (const 模板 of 候选) {
    const 分数 = 计算命中(文本, 模板) + (文本.includes(模板.名称) ? 0.5 : 0)
    if (分数 > 最高) { 最高 = 分数; 最佳 = 模板 }
  }
  return 最佳
}

const 题号规则 = /^\s*(?:([一二三四五六七八九十]+)\s*[、.．]|(\d{1,3})\s*[.、．)）](?!\d)|[（(]\s*(\d{1,3})\s*[)）])\s*(.*)$/

/** 试卷：整页文字按题号拆成“题号 + 题目”行，题干续行（选项、图注）并入上一题；题号之前的“字段：值”作为表头 */
function 解析试卷文本(文本: string, 模板: 识别模板, 来源: string): 单据解析结果 {
  const 行列表 = 文本.split(/\r?\n/), 明细: 解析行[] = [], 表头行 = new Set<number>()
  let 当前: 解析行 | null = null
  行列表.forEach((行, 序号) => {
    const 命中 = 行.match(题号规则)
    if (命中) {
      const 题目 = 命中[4].trim()
      当前 = { 值: { 题号: 命中[1] ?? 命中[2] ?? 命中[3], 题目 }, 置信度: { 题号: 高置信度, 题目: 置信度(题目) } }
      明细.push(当前)
    } else if (当前 && 行.trim()) {
      const 题 = 当前 as 解析行
      题.值.题目 = 题.值.题目 ? 题.值.题目 + '\n' + 行.trim() : 行.trim()
      题.置信度.题目 = Math.min(题.置信度.题目, 置信度(行))
    } else if (!当前) 表头行.add(序号)
  })
  const 跳过 = new Set(行列表.map((_, 序号) => 序号).filter(序号 => !表头行.has(序号)))
  return { 来源, 模板标识: 模板.标识, 表头: 提取表头(行列表, 模板, 跳过), 明细, 模板匹配: 明细.length > 0, 原文: 文本 }
}

/** 统一入口：按模板分类选择解析方式（单据与证件按字段，试卷按题号） */
export function 解析识别文本(文本: string, 模板: 识别模板, 来源: string): 单据解析结果 {
  return 模板.分类 === '试卷' ? 解析试卷文本(文本, 模板, 来源) : 解析单据文本(文本, 模板, 来源)
}
