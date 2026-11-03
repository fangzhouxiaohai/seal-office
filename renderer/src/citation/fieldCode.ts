// 引文域代码：与 Zotero / Word 互换的字符串格式。
//
// Zotero 的 Word 插件把引文存成域，域代码分别为：
//   ITEM CSL_CITATION {json}       引文簇
//   BIBL {json} CSL_BIBLIOGRAPHY   参考文献表
// 见 zotero/chrome/content/zotero/xpcom/integration.js 的 Field.setCode。
// 只有逐字沿用这个格式，导出的 docx 交给 Word 才会被 Zotero 认作引文域，
// 用户在 Word 里也能继续刷新与换样式。

import type { 引文簇引用, 引文项 } from './types'

export type 域类别 = '引文' | '书目' | '未知'

export interface 解析后的引文域 {
  类别: '引文'
  簇: 引文簇引用
}

export interface 解析后的书目域 {
  类别: '书目'
  数据: { uncited?: 引文项[]; omitted?: 引文项[]; custom?: unknown }
}

export interface 未知域 {
  类别: '未知'
  原因: string
}

export type 域解析结果 = 解析后的引文域 | 解析后的书目域 | 未知域

/** 书目域的数据结构，与 Zotero 的 Bibliography.serialize 保持一致 */
export interface 书目域数据 {
  uncited?: 引文项[]
  omitted?: 引文项[]
  custom?: unknown
}

function 取花括号内容(代码: string): string {
  const 起 = 代码.indexOf('{')
  const 止 = 代码.lastIndexOf('}')
  if (起 === -1 || 止 <= 起) return ''
  return 代码.slice(起, 止 + 1)
}

/**
 * 解析 JSON，兼容 Zotero 源码里记录的两类历史脏数据：
 * 1) Zotero 2.x 曾把键名整体大写成 CITATIONITEMS；
 * 2) macOS Word 的「全部大写」会把域代码里的字符串一起大写。
 * 前者按 Zotero 的做法还原，后者无法无损还原，直接判为未知域并说明原因，
 * 而不是猜一份可能错误的题录。
 */
function 解析兼容Json(内容: string): unknown {
  try {
    return JSON.parse(内容)
  } catch {
    // Zotero 2.1b1 的损坏：{{ ,"unsorted":true}} 之类的多余花括号
    const 修补 = 内容.replace(/{{((?:\s*,?"unsorted":(?:true|false)|\s*,?"custom":"(?:(?:\\")?[^"]*\s*)*")*)}}/, '{$1}')
    try {
      return JSON.parse(修补)
    } catch {
      return null
    }
  }
}

function 规范化引文项(原值: unknown): 引文项 | null {
  if (!原值 || typeof 原值 !== 'object') return null
  const 源 = 原值 as Record<string, unknown>
  const id = typeof 源.id === 'string' ? 源.id : typeof 源.id === 'number' ? String(源.id) : ''
  if (!id) return null
  const 结果: 引文项 = { id }
  if (typeof 源.locator === 'string' && 源.locator) 结果.locator = 源.locator
  const 标签 = typeof 源.label === 'string' ? 源.label : typeof 源.locatorType === 'string' ? 源.locatorType : ''
  if (标签) 结果.label = 标签
  if (typeof 源.prefix === 'string' && 源.prefix) 结果.prefix = 源.prefix
  if (typeof 源.suffix === 'string' && 源.suffix) 结果.suffix = 源.suffix
  if (源['suppress-author'] === true || 源.suppressAuthor === true) 结果['suppress-author'] = true
  if (源['author-only'] === true || 源.authorOnly === true) 结果['author-only'] = true
  return 结果
}

function 规范化簇(原值: unknown): 引文簇引用 | null {
  if (!原值 || typeof 原值 !== 'object') return null
  const 源 = 原值 as Record<string, unknown>
  const 列表原文 = 源.citationItems ?? 源.CITATIONITEMS
  if (!Array.isArray(列表原文) || 列表原文.length === 0) return null
  const citationItems: 引文项[] = []
  for (const 一项 of 列表原文) {
    const 规范化 = 规范化引文项(一项)
    if (!规范化) return null
    citationItems.push(规范化)
  }
  const 属性 = (源.properties ?? 源.PROPERTIES ?? {}) as Record<string, unknown>
  const 序号 = Number(属性.noteIndex ?? 0)
  return {
    citationID: typeof 源.citationID === 'string' ? 源.citationID : typeof 源.CITATIONID === 'string' ? 源.CITATIONID : '',
    citationItems,
    properties: { noteIndex: Number.isFinite(序号) && 序号 >= 0 ? 序号 : 0 },
  }
}

/** 判断域代码属于哪一类 */
export function 识别域类别(代码: string): 域类别 {
  const 规范 = 代码.trim()
  if (/^ITEM\s+CSL_CITATION\b/.test(规范) || /^CITATION\b/.test(规范)) return '引文'
  if (/^BIBL\b/.test(规范)) return '书目'
  return '未知'
}

/** 解析域代码。任何无法确定的情况都返回「未知」并给出中文原因 */
export function 解析域代码(代码: string): 域解析结果 {
  if (typeof 代码 !== 'string' || 代码.trim().length === 0) {
    return { 类别: '未知', 原因: '域代码为空' }
  }
  const 类别 = 识别域类别(代码)
  if (类别 === '未知') {
    return { 类别: '未知', 原因: '不是 Zotero 引文域或参考文献表域' }
  }
  const 内容 = 取花括号内容(代码)
  if (!内容) {
    return { 类别: '未知', 原因: '域代码缺少数据部分' }
  }
  const 数据 = 解析兼容Json(内容)
  if (数据 === null) {
    const 全大写 = /"CITATIONITEMS"|"CITATIONID"/.test(代码)
    return {
      类别: '未知',
      原因: 全大写
        ? '域代码曾被「全部大写」格式破坏，无法还原题录信息'
        : '域代码中的数据不是合法 JSON',
    }
  }
  if (类别 === '书目') {
    const 源 = 数据 as Record<string, unknown>
    const 书目数据: 书目域数据 = {}
    for (const 键 of ['uncited', 'omitted'] as const) {
      const 列表 = 源[键]
      if (Array.isArray(列表)) 书目数据[键] = 列表.map(规范化引文项).filter((项): 项 is 引文项 => 项 !== null)
    }
    if (源.custom !== undefined) 书目数据.custom = 源.custom
    return { 类别: '书目', 数据: 书目数据 }
  }
  const 簇 = 规范化簇(数据)
  if (!簇) {
    // 大写破坏的域在 JSON 层仍可解析，但题录信息已随字符串一起被转成大写，
    // 猜测只会把错误题录写进参考文献表，因此如实判为未知并说明原因。
    if (/"CITATIONITEMS"|"CITATIONID"|"ITEMDATA"/.test(代码)) {
      return { 类别: '未知', 原因: '域代码曾被「全部大写」格式破坏，无法还原题录信息' }
    }
    return { 类别: '未知', 原因: '域代码中没有可用的引用条目' }
  }
  return { 类别: '引文', 簇 }
}

/** 生成引文域代码。citationID 由文档模型保证唯一 */
export function 序列化引文域(簇: 引文簇引用): string {
  if (!Array.isArray(簇.citationItems) || 簇.citationItems.length === 0) {
    throw new Error('引文域至少需要一条引用')
  }
  return `ITEM CSL_CITATION ${JSON.stringify({
    citationID: 簇.citationID,
    citationItems: 簇.citationItems,
    properties: { noteIndex: 簇.properties?.noteIndex ?? 0 },
  })}`
}

/** 生成参考文献表域代码 */
export function 序列化书目域(数据: 书目域数据 = {}): string {
  const 载荷: Record<string, unknown> = {}
  if (数据.uncited?.length) 载荷.uncited = 数据.uncited
  if (数据.omitted?.length) 载荷.omitted = 数据.omitted
  if (数据.custom !== undefined) 载荷.custom = 数据.custom
  return `BIBL ${JSON.stringify(载荷)} CSL_BIBLIOGRAPHY`
}

/** 转为纯文本：取消链接时保留可见文字，去掉域 */
export function 提取可见文字(内容html: string): string {
  return 内容html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}
