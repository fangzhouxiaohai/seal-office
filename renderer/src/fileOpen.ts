// 本地文件打开助手：按扩展名把文件内容分流到对应模块的数据模型。
// 首页「打开文件」与最近文档点击共用同一条链路，避免两套行为不一致。
import { 桥接 } from './ipc/bridge'
import { Modal } from 'antd'
import { 净化富文本 } from './editor/sanitizeHtml'

export type 打开类型 = 'word' | 'table' | 'ppt' | 'pdf'

export interface 本地文件内容 {
  类型: 打开类型
  /** word / table 的 HTML 内容 */
  内容?: string
  /** ppt 的演示文稿模型 */
  演示文稿?: unknown
  工作表列表?: Array<{ 名称: string; html: string }>
  警告?: string[]
}

function 转义Html(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function 文本转Html(文本: string): string {
  return 文本.split(/\r\n|\n|\r/).map((行) => `<p>${行.length > 0 ? 转义Html(行) : '<br>'}</p>`).join('')
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
  const 行内容 = 行列表.map((行) => `<tr>${行.map((值) => `<td>${转义Html(值)}</td>`).join('')}</tr>`).join('')
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
  const 扩展 = (结果.扩展名 ?? '').replace(/^\./, '').toLowerCase() || 归一化扩展名(路径)
  if (结果.二进制) {
    if (扩展 === 'docx') {
      const 数据: any = await 桥接.office.readDocx(结果.内容)
      if (数据 && 数据.成功 && typeof 数据.html === 'string') {
        return { 类型: 'word', 内容: 净化富文本(数据.html), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) }
      }
      throw new Error(数据?.错误 || '文字文档解析失败')
    }
    if (扩展 === 'xlsx') {
      const 数据: any = await 桥接.office.readXlsx(结果.内容)
      if (数据 && 数据.成功 && typeof 数据.html === 'string') {
        if (Array.isArray(数据.工作表列表)) {
          if (数据.工作表列表.length === 0) throw new Error('表格文件没有工作表')
          const 工作表列表 = 数据.工作表列表.map((工作表: { 名称: string; html: string }) => ({ ...工作表, html: 净化富文本(工作表.html) }))
          return { 类型: 'table', 内容: 净化富文本(数据.html), 工作表列表, ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) }
        }
        return { 类型: 'table', 内容: 净化富文本(数据.html), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) }
      }
      throw new Error(数据?.错误 || '表格文档解析失败')
    }
    if (扩展 === 'pptx') {
      const 数据: any = await 桥接.office.readPptx(结果.内容)
      if (数据 && 数据.成功 && 数据.演示文稿) {
        return { 类型: 'ppt', 演示文稿: 数据.演示文稿, ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) }
      }
      throw new Error(数据?.错误 || '演示文稿解析失败')
    }
    if (扩展 === 'pdf') {
      return { 类型: 'pdf', 内容: 结果.内容 }
    }
    throw new Error(`不支持打开 ${扩展 || '未知'} 格式的文件`)
  }
  if (扩展 === 'csv') {
    return { 类型: 'table', 内容: Csv转表格Html(结果.内容) }
  }
  if (['txt', 'md', 'json'].includes(扩展)) {
    return { 类型: 'word', 内容: 文本转Html(结果.内容) }
  }
  if (['html', 'htm'].includes(扩展)) {
    return { 类型: 'word', 内容: 净化富文本(结果.内容) }
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

/** 记录最近打开/保存的文件（主进程持久化到 userData/recent.json） */
export async function 记录最近文档(路径: string, 名称: string, 类型: 打开类型, 置顶?: boolean): Promise<void> {
  try {
    const 结果 = await 桥接.recentAdd({ 路径, 名称, 类型, 置顶, 时间: Date.now() })
    if (!结果.成功) throw new Error(结果.错误 || '无法写入最近文档记录')
  } catch (错误) {
    Modal.error({ title: '最近文档记录失败', content: 错误 instanceof Error ? 错误.message : '无法写入最近文档记录' })
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
  打开: (类型: 打开类型, 内容: unknown, 路径: string, 警告?: string[]) => void
): Promise<boolean> {
  if (!桥接.可用) {
    message.info('当前环境不支持打开文件功能，请使用打包后的版本')
    return false
  }
  try {
    const 文件路径 = await 桥接.showOpenDialog()
    if (!文件路径) return false
    const 内容 = await 读取本地文件内容(文件路径)
    if (内容.类型 === 'ppt') {
      打开('ppt', 内容.演示文稿, 文件路径, 内容.警告)
      message.success('演示文稿已打开')
    } else if (内容.类型 === 'pdf') {
      打开('pdf', 内容.内容, 文件路径, 内容.警告)
      message.success('PDF 文件已打开')
    } else {
      打开(内容.类型, 内容.类型 === 'table' ? (内容.工作表列表 ?? 内容.内容) : 内容.内容, 文件路径, 内容.警告)
      message.success(内容.类型 === 'word' ? '文档已打开' : '表格已打开')
    }
    await 记录最近文档(文件路径, 基准文件名(文件路径), 内容.类型)
    return true
  } catch (错误) {
    modal.error({ title: '打开文件失败', content: 错误 instanceof Error ? 错误.message : '未知错误' })
    return false
  }
}
