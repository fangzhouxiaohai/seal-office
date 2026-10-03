// 本地文件打开助手：按扩展名把文件内容分流到对应模块的数据模型。
// 首页「打开文件」与最近文档点击共用同一条链路，避免两套行为不一致。
import { 桥接 } from './ipc/bridge'
import { Modal } from 'antd'
import { 净化富文本 } from './editor/sanitizeHtml'
import type { 文字页面设置 } from './office/docModel'
import type { Sheet } from './sheet/model'

export type 打开类型 = 'word' | 'table' | 'ppt' | 'pdf'

type 最近文档错误处理 = (选项: { title: string; content: string }) => void
let 最近文档错误弹窗: 最近文档错误处理 | null = null

/** 应用外壳提供随主题切换的弹窗实例；独立调用时仍保留错误提示。 */
export function 注册最近文档错误弹窗(处理: 最近文档错误处理): () => void {
  最近文档错误弹窗 = 处理
  return () => { if (最近文档错误弹窗 === 处理) 最近文档错误弹窗 = null }
}

export interface 本地文件内容 {
  类型: 打开类型
  /** word / table 的 HTML 内容 */
  内容?: string
  /** ppt 的演示文稿模型 */
  演示文稿?: unknown
  工作表列表?: Array<{ 名称: string; html: string }> | Sheet[]
  警告?: string[]
  页面设置?: 文字页面设置
  文件指纹?: string
}

function 转义Html(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function 文本转Html(文本: string): string {
  const 片段 = 文本.split(/(\r\n|\n|\r)/)
  const 换行名称 = (换行: string): 'crlf' | 'cr' | 'lf' => 换行 === '\r\n' ? 'crlf' : 换行 === '\r' ? 'cr' : 'lf'
  const 计数 = { crlf: 0, cr: 0, lf: 0 }
  for (let 索引 = 1; 索引 < 片段.length; 索引 += 2) 计数[换行名称(片段[索引])] += 1
  const 默认换行 = (Object.keys(计数) as Array<keyof typeof 计数>).reduce((当前, 候选) =>
    计数[候选] > 计数[当前] ? 候选 : 当前, 换行名称(片段[1] ?? '\n'))
  const 行列表: string[] = []
  for (let 索引 = 0; 索引 < 片段.length; 索引 += 2) {
    const 行 = 片段[索引]
    const 后续换行 = 片段[索引 + 1]
    const 属性 = ` data-seal-line-ending="${默认换行}"${后续换行 ? ` data-seal-break="${换行名称(后续换行)}"` : ''}`
    行列表.push(`<p${属性}>${行.length > 0 ? 转义Html(行) : '<br>'}</p>`)
  }
  return 行列表.join('')
}

function 是记录(值: unknown): 值 is Record<string, unknown> {
  return typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
}

/** 旧版表格由完整工作表模型数组组成；普通 JSON 仍可作为文字打开。 */
function 是旧版工作表(值: unknown): 值 is Sheet {
  if (!是记录(值) || typeof 值.id !== 'string' || !值.id || typeof 值.name !== 'string' || !值.name ||
    !Number.isInteger(值.行数) || !Number.isInteger(值.列数) || Number(值.行数) < 1 || Number(值.列数) < 1 ||
    !Array.isArray(值.列宽) || !值.列宽.every((宽) => typeof 宽 === 'number' && Number.isFinite(宽) && 宽 > 0) ||
    !Array.isArray(值.行高) || !值.行高.every((高) => typeof 高 === 'number' && Number.isFinite(高) && 高 > 0) ||
    !Array.isArray(值.合并区域) || !值.合并区域.every((区域) => typeof 区域 === 'string') ||
    !是记录(值.单元格)) return false
  if (值.页面设置 !== undefined && (!是记录(值.页面设置) ||
    typeof 值.页面设置.页边距 !== 'string' || typeof 值.页面设置.方向 !== 'string' || typeof 值.页面设置.纸张大小 !== 'string')) return false
  if (值.图片 !== undefined && !Array.isArray(值.图片)) return false
  return Object.entries(值.单元格).every(([地址, 单元]) =>
    /^[A-Z]+[1-9]\d*$/.test(地址) && 是记录(单元) &&
    typeof 单元.原始值 === 'string' && typeof 单元.显示值 === 'string' && 是记录(单元.格式))
}

function 解析旧版表格Json(原文: string): Sheet[] | null {
  let 数据: unknown
  try { 数据 = JSON.parse(原文) } catch { return null }
  if (!Array.isArray(数据)) return null
  const 疑似工作表 = 数据.some((项) => 是记录(项) &&
    (('单元格' in 项 && ['行数', '列数', '列宽', '行高', '合并区域'].some((字段) => 字段 in 项)) ||
      ('行数' in 项 && '列数' in 项 && '列宽' in 项)))
  if (!疑似工作表) return null
  if (数据.length === 0 || !数据.every(是旧版工作表)) throw new Error('旧版表格文件结构不正确，文件未打开')
  return 数据
}

/** 按 CSV 引号规则解析，避免逗号及换行落在引号中时错列。 */
function Csv转表格Html(文本: string): string {
  const 行列表: string[][] = []
  let 当前行: string[] = []
  let 单元格 = ''
  let 引号内 = false
  let 引号已结束 = false
  const 提交单元格 = () => {
    当前行.push(单元格)
    单元格 = ''
    引号已结束 = false
  }
  const 提交行 = () => {
    提交单元格()
    行列表.push(当前行)
    当前行 = []
  }
  for (let 位置 = 0; 位置 < 文本.length; 位置 += 1) {
    const 字符 = 文本[位置]
    if (引号内) {
      if (字符 === '"') {
        if (文本[位置 + 1] === '"') {
          单元格 += '"'
          位置 += 1
        } else {
          引号内 = false
          引号已结束 = true
        }
      } else {
        单元格 += 字符
      }
    } else if (字符 === ',' || 字符 === '\n' || 字符 === '\r') {
      if (字符 === ',') {
        提交单元格()
      } else {
        提交行()
        if (字符 === '\r' && 文本[位置 + 1] === '\n') 位置 += 1
      }
    } else if (字符 === '"' && 单元格.length === 0 && !引号已结束) {
      引号内 = true
    } else if (引号已结束 || 字符 === '"') {
      throw new Error('CSV 文件引号格式无效')
    } else {
      单元格 += 字符
    }
  }
  if (引号内) throw new Error('CSV 文件引号未闭合')
  if (当前行.length > 0 || 单元格.length > 0 || !/[\r\n]$/.test(文本)) 提交行()
  const 行内容 = 行列表.map((行) => `<tr>${行.map((值) => `<td data-value-type="text">${转义Html(值)}</td>`).join('')}</tr>`).join('')
  return `<table><tbody>${行内容}</tbody></table>`
}

/** 从路径取小写扩展名（不含点） */
export function 归一化扩展名(路径: string): string {
  const 匹配 = 路径.match(/\.([^\\/.]+)$/)
  return 匹配 === null ? '' : 匹配[1].toLowerCase()
}

/** 读取本地文件并解析为模块内容；不支持的格式返回 null */
export async function 读取本地文件内容(路径: string): Promise<本地文件内容> {
  const 结果 = await 桥接.readFile(路径)
  if (!结果.成功) {
    throw new Error(结果.错误 || '文件读取失败')
  }
  if (结果.内容 === undefined || 结果.内容 === '') {
    throw new Error('文件内容为空')
  }
  const 带文件指纹 = (内容: 本地文件内容): 本地文件内容 =>
    typeof 结果.文件指纹 === 'string' && 结果.文件指纹.length > 0
      ? { ...内容, 文件指纹: 结果.文件指纹 }
      : 内容
  const 扩展 = (结果.扩展名 ?? '').replace(/^\./, '').toLowerCase() || 归一化扩展名(路径)
  if (结果.二进制) {
    if (扩展 === 'docx') {
      const 数据: any = await 桥接.office.readDocx(结果.内容)
      if (数据 && 数据.成功 && typeof 数据.html === 'string') {
        return 带文件指纹({ 类型: 'word', 内容: 净化富文本(数据.html), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}), ...(数据.页面设置 ? { 页面设置: 数据.页面设置 } : {}) })
      }
      throw new Error(数据?.错误 || '文字文档解析失败')
    }
    if (扩展 === 'xlsx') {
      const 数据: any = await 桥接.office.readXlsx(结果.内容)
      if (数据 && 数据.成功 && typeof 数据.html === 'string') {
        if (Array.isArray(数据.工作表列表)) {
          if (数据.工作表列表.length === 0) throw new Error('表格文件没有工作表')
          const 工作表列表 = 数据.工作表列表.map((工作表: { 名称: string; html: string }) => ({ ...工作表, html: 净化富文本(工作表.html) }))
          return 带文件指纹({ 类型: 'table', 内容: 净化富文本(数据.html), 工作表列表, ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) })
        }
        return 带文件指纹({ 类型: 'table', 内容: 净化富文本(数据.html), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) })
      }
      throw new Error(数据?.错误 || '表格文档解析失败')
    }
    if (扩展 === 'pptx') {
      const 数据: any = await 桥接.office.readPptx(结果.内容)
      if (数据 && 数据.成功 && 数据.演示文稿) {
        return 带文件指纹({ 类型: 'ppt', 演示文稿: 数据.演示文稿, ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) })
      }
      throw new Error(数据?.错误 || '演示文稿解析失败')
    }
    if (扩展 === 'pdf') {
      return 带文件指纹({ 类型: 'pdf', 内容: 结果.内容 })
    }
    throw new Error(`不支持打开 ${扩展 || '未知'} 格式的文件`)
  }
  if (扩展 === 'csv') {
    return 带文件指纹({ 类型: 'table', 内容: Csv转表格Html(结果.内容) })
  }
  if (扩展 === 'json') {
    const 工作表列表 = 解析旧版表格Json(结果.内容)
    if (工作表列表 !== null) return 带文件指纹({ 类型: 'table', 工作表列表 })
  }
  if (['txt', 'md', 'json'].includes(扩展)) {
    return 带文件指纹({ 类型: 'word', 内容: 文本转Html(结果.内容) })
  }
  if (['html', 'htm'].includes(扩展)) {
    return 带文件指纹({
      类型: 'word',
      内容: 净化富文本(结果.内容),
      警告: ['HTML 的页面样式、脚本及元数据未完整导入，不能直接覆盖来源文件'],
    })
  }
  throw new Error(`不支持打开 ${扩展 || '未知'} 格式的文件`)
}

/** 取路径中的文件名（兼容反斜杠与正斜杠分隔） */
export function 基准文件名(路径: string): string {
  const 规整 = 路径.split('\\').join('/')
  const 部件 = 规整.split('/').filter((项) => 项.length > 0)
  return 部件.length > 0 ? 部件[部件.length - 1] : 路径
}

/** 按扩展名推断所属文档类型 */
export function 扩展转类型(路径: string): 打开类型 {
  const 扩展 = 归一化扩展名(路径)
  if (扩展 === 'xlsx' || 扩展 === 'et' || 扩展 === 'csv') return 'table'
  if (扩展 === 'pptx' || 扩展 === 'dps') return 'ppt'
  if (扩展 === 'pdf') return 'pdf'
  return 'word'
}

/** 记录最近打开/保存的文件；失败不撤销已完成的文件操作。 */
export async function 记录最近文档(路径: string, 名称: string, 类型: 打开类型, 置顶?: boolean): Promise<boolean> {
  try {
    const 结果 = await 桥接.recentAdd({ 路径, 名称, 类型, 置顶, 时间: Date.now() })
    if (!结果.成功) throw new Error(结果.错误 || '无法写入最近文档记录')
    return true
  } catch (错误) {
    const 原因 = 错误 instanceof Error ? 错误.message : '无法写入最近文档记录'
    const 选项 = { title: '最近文档记录未更新', content: `文件操作已完成，但最近文档列表未更新：${原因}` }
    if (最近文档错误弹窗) 最近文档错误弹窗(选项)
    else Modal.warning(选项)
    return false
  }
}

/** 消息提示的最小接口（兼容 antd message） */
interface 消息接口 {
  info: (文本: string) => void
  success: (文本: string) => void
}

interface 弹窗接口 {
  error: (选项: { title: string; content: string }) => void
}

/**
 * 弹出系统打开对话框并按扩展名分流打开；首页「打开」按钮与空状态共用此链路。
 * @param 打开 - 通常传 store.createDoc
 */
export async function 通过对话框打开文件(
  message: 消息接口,
  modal: 弹窗接口,
  打开: (类型: 打开类型, 内容: unknown, 路径: string, 警告?: string[], 页面设置?: 文字页面设置, 文件指纹?: string) => void
): Promise<boolean> {
  if (!桥接.可用) {
    modal.error({ title: '打开文件失败', content: '当前环境不支持打开文件功能，请使用打包后的版本' })
    return false
  }
  try {
    const 文件路径 = await 桥接.showOpenDialog()
    if (!文件路径) return false
    return await 通过路径打开文件(文件路径, message, modal, 打开)
  } catch (错误) {
    modal.error({ title: '打开文件失败', content: 错误 instanceof Error ? 错误.message : '未知错误' })
    return false
  }
}

/** 系统文件关联与打开对话框共用解析、标签创建和最近记录链路。 */
export async function 通过路径打开文件(
  文件路径: string,
  _消息: 消息接口,
  modal: 弹窗接口,
  打开: (类型: 打开类型, 内容: unknown, 路径: string, 警告?: string[], 页面设置?: 文字页面设置, 文件指纹?: string) => void
): Promise<boolean> {
  try {
    if (typeof 文件路径 !== 'string' || 文件路径.trim() === '') throw new Error('未提供有效的文件路径')
    const 内容 = await 读取本地文件内容(文件路径)
    if (内容.类型 === 'ppt') {
      if (内容.文件指纹) 打开('ppt', 内容.演示文稿, 文件路径, 内容.警告, undefined, 内容.文件指纹)
      else 打开('ppt', 内容.演示文稿, 文件路径, 内容.警告)
    } else if (内容.类型 === 'pdf') {
      打开('pdf', 内容.内容, 文件路径, 内容.警告)
    } else {
      const 初始内容 = 内容.类型 === 'table' ? (内容.工作表列表 ?? 内容.内容) : 内容.内容
      if (内容.文件指纹) 打开(内容.类型, 初始内容, 文件路径, 内容.警告, 内容.页面设置, 内容.文件指纹)
      else if (内容.类型 === 'word' && 内容.页面设置) 打开('word', 内容.内容, 文件路径, 内容.警告, 内容.页面设置)
      else 打开(内容.类型, 初始内容, 文件路径, 内容.警告)
    }
    await 记录最近文档(文件路径, 基准文件名(文件路径), 内容.类型)
    return true
  } catch (错误) {
    modal.error({ title: '打开文件失败', content: 错误 instanceof Error ? 错误.message : '未知错误' })
    return false
  }
}
