// 扫描件导出：图片型 PDF、可搜索 PDF（图片 + 其下的文字层）、Word 文字稿、识别结果工作表。
// 可搜索 PDF 的文字层复用现有 PDF 编辑通道（桥接.pdf.editPage，桌面走主进程、移动与网页走同一份
// 共享核心），字体与字形校验沿用内置思源字体，不另起一套排版。
import { PDFDocument } from 'pdf-lib'
import { 创建工作表, 重算工作表, type Sheet, type SheetCell } from '../sheet/model'
import { 生成地址 } from '../sheet/address'
import type { 扫描页 } from './scanLibrary'
import type { 识别模板 } from './templates'
import { 异常定位, 解析数字, type 单据解析结果, type 异常项 } from './validation'

/** 导出页面宽度固定为 A4 宽（点），高度按图片比例 */
const 页面宽 = 595.28
const 页面尺寸 = (页: Pick<扫描页, '宽' | '高'>) => ({ 宽: 页面宽, 高: Math.max(36, 页面宽 * 页.高 / 页.宽) })

async function 嵌入图片(文档: PDFDocument, 页: 扫描页) {
  return 页.类型 === 'image/png' ? 文档.embedPng(页.图片) : 文档.embedJpg(页.图片)
}

export async function 生成图片PDF(页列表: 扫描页[]): Promise<Uint8Array> {
  if (!页列表.length) throw new Error('没有可导出的页面')
  const 文档 = await PDFDocument.create()
  文档.setProducer('海豹办公 Seal Office'); 文档.setCreator('海豹办公 Seal Office')
  for (const 页 of 页列表) {
    const 图片 = await 嵌入图片(文档, 页), 尺寸 = 页面尺寸(页)
    文档.addPage([尺寸.宽, 尺寸.高]).drawImage(图片, { x: 0, y: 0, width: 尺寸.宽, height: 尺寸.高 })
  }
  return 文档.save()
}

/** 整理文字层：去掉排版通道不接受的制表符与控制符，按页宽折行，字号从 10 逐级缩到 4 以放下全文 */
export function 整理文字层(原文: string, 宽: number, 高 = Infinity): { 文字: string; 字号: number; 截断: boolean } {
  const 段落 = 原文.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, 字 => 字 === '\n' ? 字 : '').normalize('NFC').replace(/\p{Mark}/gu, '').split('\n').map(行 => 行.trimEnd()).filter(行 => 行.trim())
  for (let 字号 = 10; 字号 >= 4; 字号 -= 1) {
    const 每行 = Math.max(1, Math.floor((宽 - 20) / (字号 * 1.05)))
    const 行列表 = 段落.flatMap(行 => { const 字 = Array.from(行), 结果: string[] = []; for (let 起 = 0; 起 < 字.length; 起 += 每行) 结果.push(字.slice(起, 起 + 每行).join('')); return 结果 })
    const 可容 = Math.max(1, Math.floor((高 - 20 - 字号) / (字号 * 1.2)) + 1)
    if (行列表.length <= 可容 || 字号 === 4) return { 文字: 行列表.slice(0, 可容).join('\n'), 字号, 截断: 行列表.length > 可容 }
  }
  return { 文字: '', 字号: 4, 截断: false }
}

type PDF编辑 = (数据: string, 操作: unknown) => Promise<{ 成功: boolean; 数据?: string; 错误?: string }>
const 转Base64 = (字节: Uint8Array) => { let 文本 = ''; for (let 起 = 0; 起 < 字节.length; 起 += 0x8000) 文本 += String.fromCharCode(...字节.subarray(起, 起 + 0x8000)); return btoa(文本) }
const 自Base64 = (文本: string) => Uint8Array.from(atob(文本), 字 => 字.charCodeAt(0))

/**
 * 可搜索 PDF：先在每页写入白色文字层，再把扫描图绘制在其上方。阅读器显示原图，文字可搜索、可复制。
 * 内置字体缺少的个别字符会被跳过并返回给界面提示，不会让整份导出失败。
 */
export async function 生成可搜索PDF(页列表: 扫描页[], 编辑: PDF编辑): Promise<{ 数据: Uint8Array; 跳过字符: string[]; 截断页: number[] }> {
  if (!页列表.length) throw new Error('没有可导出的页面')
  if (!页列表.some(页 => 页.文字.trim())) throw new Error('扫描件还没有识别文字，请先识别后再导出可搜索 PDF')
  const 空白 = await PDFDocument.create()
  页列表.forEach(页 => { const 尺寸 = 页面尺寸(页); 空白.addPage([尺寸.宽, 尺寸.高]) })
  let 数据 = 转Base64(await 空白.save())
  const 跳过 = new Set<string>(), 截断页: number[] = []
  for (const [序号, 页] of 页列表.entries()) {
    const 尺寸 = 页面尺寸(页), 文字层 = 整理文字层(页.文字, 尺寸.宽, 尺寸.高)
    if (文字层.截断) 截断页.push(序号 + 1)
    let 文字 = 文字层.文字
    for (let 次数 = 0; 文字.trim() && 次数 < 50; 次数++) {
      const 结果 = await 编辑(数据, { 类型: 'text', 页码: 序号 + 1, x: 10, y: 10, 文字, 字号: 文字层.字号, 颜色: '#ffffff' })
      if (结果.成功 && 结果.数据) { 数据 = 结果.数据; break }
      const 缺字 = 结果.错误?.match(/不含「(.+?)」/u)?.[1]
      if (!缺字) throw new Error(结果.错误 || `第 ${序号 + 1} 页文字层写入失败`)
      跳过.add(缺字); 文字 = 文字.split(缺字).join('')
    }
  }
  const 文档 = await PDFDocument.load(自Base64(数据))
  文档.setProducer('海豹办公 Seal Office'); 文档.setCreator('海豹办公 Seal Office')
  for (const [序号, 页] of 页列表.entries()) {
    const 图片 = await 嵌入图片(文档, 页), 页面 = 文档.getPage(序号)
    页面.drawImage(图片, { x: 0, y: 0, width: 页面.getWidth(), height: 页面.getHeight() })
  }
  return { 数据: await 文档.save(), 跳过字符: [...跳过], 截断页 }
}

const 转义 = (文本: string) => 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 识别文字转为文字文档 HTML：每行一段，页与页之间插入分页符 */
export function 生成文字Html(页文字: string[]): string {
  return 页文字.map(文字 => 文字.split(/\r?\n/).map(行 => 行.trim()).filter(Boolean).map(行 => `<p>${转义(行)}</p>`).join('')).join('<div class="wps-page-break"></div>')
}

const 错误底色 = '#FDE2E2', 待确认底色 = '#FFF4CE'

/** 把已确认的识别结果写成一张工作表：每张单据的明细逐行展开，表头字段随行重复，异常格高亮并附批注 */
export function 生成识别工作表(结果列表: 单据解析结果[], 模板: 识别模板, 异常清单: 异常项[]): Sheet {
  const 列 = [{ 键: '来源', 名称: '来源', 类型: '文本' as const, 表头: true }, ...模板.表头字段.map(字段 => ({ ...字段, 表头: true })), ...模板.明细字段.map(字段 => ({ ...字段, 表头: false }))]
  const 行列表 = 结果列表.filter(结果 => 结果.模板匹配).flatMap(结果 => (结果.明细.length ? 结果.明细 : [null]).map((明细, 序号) => ({ 结果, 明细, 行号: 明细 ? 序号 + 1 : null })))
  const 工作表 = 创建工作表(模板.名称, Math.max(100, 行列表.length + 1), Math.max(26, 列.length))
  const 单元格: Record<string, SheetCell> = {}
  列.forEach((字段, 列号) => { 单元格[生成地址(0, 列号)] = { 原始值: 字段.名称, 显示值: 字段.名称, 值类型: '文本', 格式: { 加粗: true } } })
  行列表.forEach(({ 结果, 明细, 行号 }, 行序) => {
    列.forEach((字段, 列号) => {
      const 原值 = 字段.键 === '来源' ? 结果.来源 : ((字段.表头 ? 结果.表头.值[字段.键] : 明细?.值[字段.键]) ?? '').trim()
      if (!原值 && 字段.键 !== '来源') {
        const 异常 = 异常定位(异常清单, 结果.来源, 字段.表头 ? null : 行号, 字段.键)
        if (!异常) return
      }
      const 数字 = 字段.类型 === '数字' ? 解析数字(原值) : null
      const 原始值 = 数字 !== null ? String(数字) : 原值
      const 单元: SheetCell = { 原始值, 显示值: 原始值, 格式: {} }
      if (数字 === null) 单元.值类型 = '文本'
      const 异常 = 异常定位(异常清单, 结果.来源, 字段.表头 ? null : 行号, 字段.键)
      if (异常) { 单元.格式 = { 填充颜色: 异常.级别 === '错误' ? 错误底色 : 待确认底色 }; 单元.批注 = 异常.说明 }
      单元格[生成地址(行序 + 1, 列号)] = 单元
    })
  })
  return 重算工作表({ ...工作表, 单元格, 列宽: 工作表.列宽.map((宽, 列号) => 列号 < 列.length ? Math.max(宽, 110) : 宽), 冻结: { 行: 1, 列: 0 } })
}
