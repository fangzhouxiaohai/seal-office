import { 恢复导入图片 } from './ppt/render/resources'
// 本地文件打开助手：按扩展名把文件内容分流到对应模块的数据模型。
// 首页「打开文件」与最近文档点击共用同一条链路，避免两套行为不一致。
import { 桥接 } from './ipc/bridge'
import { Modal } from 'antd'
import { createElement } from 'react'
import { 净化富文本 } from './editor/sanitizeHtml'
import type { 文字页面设置 } from './office/docModel'
import type { Sheet } from './sheet/model'
import { 文档格式, 原生文档类型, 原生默认扩展 } from './fileFormats'
import { 从Html表格构建工作表 } from './sheet/sheetImport'
import { 收集演示资源标识 } from './ppt/model/migrations'
import type { 演示文稿 } from './ppt/deck'
import { 读取单文件网页 } from './office/mhtml'

export type 打开类型 = 'word' | 'table' | 'ppt' | 'pdf'

type 最近文档错误处理 = (选项: { title: string; content: string }) => void
let 最近文档错误弹窗: 最近文档错误处理 | null = null
type 导入确认处理 = (选项: Parameters<typeof Modal.confirm>[0]) => unknown
let 导入确认弹窗: 导入确认处理 | null = null
export function 注册导入确认弹窗(处理: 导入确认处理): () => void {
  导入确认弹窗 = 处理
  return () => { if (导入确认弹窗 === 处理) 导入确认弹窗 = null }
}

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
  /** 用户确认转换后，真实写入的专属副本路径。来源文件始终保持不变。 */
  打开路径?: string
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
  if (值.CSV来源 !== undefined && (!是记录(值.CSV来源) || !Array.isArray(值.CSV来源.行字段数) ||
    值.CSV来源.行字段数.length > Number(值.行数) || !值.CSV来源.行字段数.every(数 => Number.isInteger(数) && Number(数) >= 0 && Number(数) <= Number(值.列数)) ||
    !['\r\n', '\r', '\n'].includes(String(值.CSV来源.换行)) || typeof 值.CSV来源.BOM !== 'boolean' || typeof 值.CSV来源.末尾换行 !== 'boolean' ||
    (值.CSV来源.编码 !== undefined && !['utf8', 'utf16le', 'utf16be', 'gb18030'].includes(String(值.CSV来源.编码))))) return false
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
function Csv转表格Html(文本: string, 编码?: import('./ipc/bridge').文本编码, 分隔符 = ','): string {
  const BOM = 文本.startsWith('\uFEFF')
  if (BOM) 文本 = 文本.slice(1)
  let 换行: '\r\n' | '\r' | '\n' | undefined
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
    } else if (字符 === 分隔符 || 字符 === '\n' || 字符 === '\r') {
      if (字符 === 分隔符) {
        提交单元格()
      } else {
        换行 ??= 字符 === '\r' && 文本[位置 + 1] === '\n' ? '\r\n' : 字符 as '\r' | '\n'
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
  if (当前行.length > 0 || 单元格.length > 0 || (文本.length > 0 && !/[\r\n]$/.test(文本))) 提交行()
  const 行内容 = 行列表.map((行) => `<tr>${行.map((值) => `<td data-value-type="text">${转义Html(值)}</td>`).join('')}</tr>`).join('')
  const 来源 = encodeURIComponent(JSON.stringify({ 行字段数: 行列表.map(行 => 行.length), 换行: 换行 ?? '\r\n', 末尾换行: /[\r\n]$/.test(文本), BOM, ...(分隔符 !== ',' ? { 分隔符 } : {}), ...(编码 && 编码 !== 'utf8' ? { 编码 } : {}) }))
  return `<table data-seal-csv="${来源}"><tbody>${行内容}</tbody></table>`
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
  const 扩展 = (结果.扩展名 ?? '').replace(/^\./, '').toLowerCase() || 归一化扩展名(路径)
  if (结果.内容 === '' && ['docx', 'xlsx', 'pptx', 'pdf', 'doc', 'xls', 'ppt'].includes(扩展)) {
    throw new Error('文件为零字节，未包含有效的办公文件结构。如果文件来自旧版右键新建菜单，请更新海豹办公并刷新资源管理器后重新新建；现有文件没有可恢复的正文。')
  }
  if (结果.内容 === undefined || (结果.内容 === '' && !['csv', 'tsv', 'txt', 'md', 'html', 'htm'].includes(扩展))) {
    throw new Error('文件内容为空')
  }
  const 带文件指纹 = (内容: 本地文件内容): 本地文件内容 =>
    typeof 结果.文件指纹 === 'string' && 结果.文件指纹.length > 0
      ? { ...内容, 文件指纹: 结果.文件指纹 }
      : 内容
  const 兼容格式 = 文档格式.find(项 => 项.extension === 扩展 && 项.conversion)
  const OfficeXML = 扩展 === 'xml' && /urn:schemas-microsoft-com:office:spreadsheet|http:\/\/schemas.microsoft.com\/office\/word\/2003\/wordml/.test(结果.内容)
  if (兼容格式 && (!['xml', 'mht', 'mhtml'].includes(扩展) || OfficeXML)) {
    let 转换数据 = 结果.内容
    if (OfficeXML) {
      let 二进制 = ''
      for (const 字节 of new TextEncoder().encode(结果.内容)) 二进制 += String.fromCharCode(字节)
      转换数据 = btoa(二进制)
    }
    const 数据: any = await 桥接.office.readCompatible(扩展, 转换数据)
    if (!数据?.成功) throw new Error(数据?.错误 || '文档兼容转换失败')
    if (数据.类型 === 'ppt' && 数据.演示文稿) return 带文件指纹({ 类型: 'ppt', 演示文稿: await 恢复导入图片(数据), 警告: 数据.警告 ?? [] })
    if (['word', 'table'].includes(数据.类型) && typeof 数据.html === 'string') return 带文件指纹({
      类型: 数据.类型, 内容: 净化富文本(数据.html), 页面设置: 数据.页面设置,
      警告: OfficeXML ? [...(数据.警告 ?? []), 'Office XML 的样式和元数据通过兼容转换导入，请另存为 DOCX 或 XLSX；不能按普通 XML 文本覆盖来源'] : 数据.警告 ?? [],
      ...(Array.isArray(数据.工作表列表) ? { 工作表列表: 数据.工作表列表.map((表: { 名称: string; html: string }) => ({ ...表, html: 净化富文本(表.html) })) } : {}),
    })
    throw new Error('文档转换后未得到有效内容')
  }
  if (结果.二进制) {
    if(原生文档类型(扩展)){
      const 数据:any=await 桥接.office.readSeal(扩展,结果.内容)
      if(!数据?.成功)throw new Error(数据?.错误||'海豹文档读取失败')
      const 提示=Array.isArray(数据.警告)?{警告:数据.警告}:{}
      if(数据.类型==='word'&&typeof 数据.html==='string')return 带文件指纹({类型:'word',内容:净化富文本(数据.html),...提示,...(数据.页面设置?{页面设置:{...数据.页面设置,...(typeof 数据.页面设置.页眉Html==='string'?{页眉Html:净化富文本(数据.页面设置.页眉Html)}:{}),...(typeof 数据.页面设置.页脚Html==='string'?{页脚Html:净化富文本(数据.页面设置.页脚Html)}:{})}}:{})})
      if(数据.类型==='table'&&Array.isArray(数据.工作表列表)&&数据.工作表列表.length&&数据.工作表列表.every(是旧版工作表))return 带文件指纹({类型:'table',工作表列表:数据.工作表列表,...提示})
      if(数据.类型==='ppt'&&数据.演示文稿)return 带文件指纹({类型:'ppt',演示文稿:await 恢复导入图片(数据),...提示})
      if(数据.类型==='pdf'&&typeof 数据.PDF数据==='string')return 带文件指纹({类型:'pdf',内容:数据.PDF数据,...提示})
      throw new Error('海豹文档内容结构不正确，文件未打开')
    }
    if (扩展 === 'docx') {
      const 数据: any = await 桥接.office.readDocx(结果.内容)
      if (数据 && 数据.成功 && typeof 数据.html === 'string') {
        return 带文件指纹({ 类型: 'word', 内容: 净化富文本(数据.html), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}), ...(数据.页面设置 ? { 页面设置: 数据.页面设置 } : {}) })
      }
      throw new Error(数据?.错误 || '文字文档解析失败')
    }
    if (扩展 === 'xlsx') {
      const 数据: any = await 桥接.office.readXlsx(结果.内容)
      if (数据 && 数据.成功 && (typeof 数据.html === 'string' || Array.isArray(数据.工作表列表))) {
        if (Array.isArray(数据.工作表列表)) {
          if (数据.工作表列表.length === 0) throw new Error('表格文件没有工作表')
          const 工作表列表 = 数据.工作表列表.map((工作表: { 名称: string; html: string }) => ({ ...工作表, html: 净化富文本(工作表.html) }))
          return 带文件指纹({ 类型: 'table', 内容: 净化富文本(数据.html ?? 工作表列表[0].html), 工作表列表, ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) })
        }
        return 带文件指纹({ 类型: 'table', 内容: 净化富文本(数据.html), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) })
      }
      throw new Error(数据?.错误 || '表格文档解析失败')
    }
    if (扩展 === 'pptx') {
      const 数据: any = await 桥接.office.readPptx(结果.内容)
      if (数据 && 数据.成功 && 数据.演示文稿) {
        return 带文件指纹({ 类型: 'ppt', 演示文稿: await 恢复导入图片(数据), ...(Array.isArray(数据.警告) ? { 警告: 数据.警告 } : {}) })
      }
      throw new Error(数据?.错误 || '演示文稿解析失败')
    }
    if (扩展 === 'pdf' || 扩展 === 'ofd') {
      return 带文件指纹({ 类型: 'pdf', 内容: 结果.内容 })
    }
    throw new Error(`不支持打开 ${扩展 || '未知'} 格式的文件`)
  }
  if (['csv', 'tsv'].includes(扩展)) {
    return 带文件指纹({ 类型: 'table', 内容: Csv转表格Html(结果.内容, 结果.文本编码, 扩展 === 'tsv' ? '\t' : ',') })
  }
  if (扩展 === 'json') {
    const 工作表列表 = 解析旧版表格Json(结果.内容)
    if (工作表列表 !== null) return 带文件指纹({ 类型: 'table', 工作表列表 })
  }
  if (['txt', 'md', 'json', 'xml'].includes(扩展)) {
    return 带文件指纹({ 类型: 'word', 内容: 文本转Html(结果.内容), ...(结果.文本编码 && 结果.文本编码 !== 'utf8' ? { 警告: ['来源使用 ' + 结果.文本编码.toUpperCase() + ' 编码，请另存为 UTF-8 副本以保留原文件'] } : {}) })
  }
  if (['html', 'htm', 'mht', 'mhtml'].includes(扩展)) {
    return 带文件指纹({
      类型: 'word',
      内容: 净化富文本(['mht', 'mhtml'].includes(扩展) ? 读取单文件网页(结果.内容) : 结果.内容),
      警告: ['HTML 的页面样式、脚本及元数据未完整导入，不能直接覆盖来源文件'],
    })
  }
  throw new Error(`不支持打开 ${扩展 || '未知'} 格式的文件`)
}

/** All interactive open entrances pass this gate before creating an editor tab. */
export async function 准备打开本地文件(路径: string): Promise<本地文件内容 | null> {
  let 内容: 本地文件内容
  try { 内容 = await 读取本地文件内容(路径) }
  catch (错误) {
    const 原因 = 错误 instanceof Error ? 错误.message : '文件内容无法识别'
    if (原生文档类型(路径) || !/加密|password|encrypt|解密|无法识别|格式|解析|不支持|损坏|文件内容为空|零字节|zip|central directory|invalid|corrupt/i.test(原因)) throw 错误
    await new Promise<void>(完成 => {
      ;(导入确认弹窗 ?? Modal.confirm)({
        title: '文件未打开：无法完整识别内容',
        content: createElement('div', null,
          createElement('p', null, 原因),
          createElement('p', null, '未创建编辑标签，也未修改原文件。专有格式、未知结构或加密文件不能作为已完整导入的文档打开。')),
        okText: '查看转换方法', cancelText: '取消打开', maskClosable: false,
        onOk: () => {
          Modal.info({title:'转换文件后重新打开',content:'请在原软件中使用正确密码打开文件，再导出为未加密的 DOCX、XLSX、PPTX 或 PDF。重新选择导出文件后，海豹办公会检查内容；能够识别的内容可另存为 .sldoc、.slxls、.slppt 或 .spdf。无法解密或读取的内容不能通过更改后缀恢复。'})
          完成()
        }, onCancel: () => { 完成() },
      })
    })
    return null
  }
  if (原生文档类型(路径) || !内容.警告?.length) return 内容
  const 警告 = [...new Set(内容.警告)]
  const 确认 = await new Promise<boolean>(完成 => {
    ;(导入确认弹窗 ?? Modal.confirm)({
      title: '此文件需要转换后打开',
      content: createElement('div', null,
        createElement('p', null, '当前尚不能完整识别以下内容，文件还未进入编辑器。'),
        createElement('ul', null, 警告.map((项, 索引) => createElement('li', { key: 索引 }, 项))),
        createElement('p', null, '可将已识别的内容另存为海豹专属格式后打开。上列内容可能在副本中缺失或改变；原文件保持不变。若需要完整原貌，请取消并使用原软件处理。')),
      okText: '转换为海豹格式', cancelText: '取消打开', maskClosable: false,
      onOk: () => { 完成(true) }, onCancel: () => { 完成(false) },
    })
  })
  if (!确认) return null
  const 扩展 = 原生默认扩展[内容.类型]
  const 默认名称 = 基准文件名(路径).replace(/\.[^.]+$/, '') + '.' + 扩展
  const 选择 = await 桥接.showSaveDialog(默认名称, 内容.类型)
  if (!选择) return null
  const 目标 = /\.[^\\/]+$/.test(选择) ? 选择 : 选择 + '.' + 扩展
  if (原生文档类型(目标) !== 内容.类型) throw new Error(`转换副本请选择 .${扩展} 格式`)
  if (目标.replace(/\\/g, '/').toLowerCase() === 路径.replace(/\\/g, '/').toLowerCase()) throw new Error('转换副本必须使用不同路径，原文件未修改')
  let 模型: unknown
  if (内容.类型 === 'word') 模型 = { html: 内容.内容 ?? '', 页面设置: 内容.页面设置, 警告 }
  else if (内容.类型 === 'table') {
    const 表列表 = 内容.工作表列表 ?? [{ 名称: 'Sheet1', html: 内容.内容 ?? '' }]
    const 工作表列表 = 表列表.map(表 => 'html' in 表
      ? 从Html表格构建工作表(表.html, 表.名称, (表 as any).页面设置, (表 as any).元数据) : 表)
    if (!工作表列表.length || 工作表列表.some(表 => !表)) throw new Error('未得到有效工作表，转换未执行')
    模型 = { 工作表列表, 警告 }
  } else if (内容.类型 === 'ppt') {
    const 文稿 = 内容.演示文稿 as 演示文稿
    const 标识 = 收集演示资源标识(文稿)
    const 资源 = 标识.length ? await 桥接.presentationResources.export(标识) : { 成功: true, 条目: [] }
    if (!资源.成功 || !资源.条目) throw new Error(资源.错误 || '图片资源不可用，转换未执行')
    模型 = { 演示文稿: 文稿, 资源条目: 资源.条目, 警告 }
  } else 模型 = { PDF数据: 内容.内容, 警告 }
  const 生成 = await 桥接.office.writeSeal(内容.类型, 模型)
  if (!生成?.成功 || !生成.数据) throw new Error(生成?.错误 || '转换专属格式失败')
  const 保存 = await 桥接.saveToFile(目标, 生成.数据, '二进制')
  if (!保存.成功) { if (保存.已取消) return null; throw new Error(保存.错误 || '转换副本写入失败') }
  // Read the actual saved bytes instead of opening the in-memory intermediate.
  const 已保存 = await 读取本地文件内容(目标)
  return { ...已保存, 打开路径: 目标 }
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
  return (文档格式.find(项 => 项.extension === 扩展)?.type ?? 'word') as 打开类型
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
  loading?: (文本: string, 时长?: number) => (() => void)
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
  消息: 消息接口,
  modal: 弹窗接口,
  打开: (类型: 打开类型, 内容: unknown, 路径: string, 警告?: string[], 页面设置?: 文字页面设置, 文件指纹?: string) => void
): Promise<boolean> {
  const 扩展 = 归一化扩展名(文件路径)
  const 格式 = 文档格式.find(项 => 项.extension === 扩展)
  const 收起提示 = 格式?.conversion && !('ooxml' in 格式 && 格式.ooxml) && !('text' in 格式 && 格式.text)
    ? 消息.loading?.('正在转换并打开文档，首次处理可能需要稍等…', 0) : undefined
  try {
    if (typeof 文件路径 !== 'string' || 文件路径.trim() === '') throw new Error('未提供有效的文件路径')
    const 内容 = await 准备打开本地文件(文件路径)
    if (!内容) return false
    文件路径 = 内容.打开路径 ?? 文件路径
    if (内容.类型 === 'ppt') {
      if (内容.文件指纹) 打开('ppt', 内容.演示文稿, 文件路径, 内容.警告, undefined, 内容.文件指纹)
      else 打开('ppt', 内容.演示文稿, 文件路径, 内容.警告)
    } else if (内容.类型 === 'pdf') {
      if (内容.文件指纹) 打开('pdf', 内容.内容, 文件路径, 内容.警告, undefined, 内容.文件指纹)
      else 打开('pdf', 内容.内容, 文件路径, 内容.警告)
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
  } finally {
    收起提示?.()
  }
}
