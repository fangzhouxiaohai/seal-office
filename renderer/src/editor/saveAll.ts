// 关闭前的“保存后退出”：按类型把每个未保存文档写入原路径或用户新选的路径。
// 复用与手动保存相同的转换、指纹与保真规则，避免退出时写出与手动保存不一致的文件。
import type { 文字页面设置 } from '../office/docModel'
import { htmlToDocxModel } from './commands'
import { 导出为Xlsx } from '../sheet/sheetExport'
import { 构建演示保存模型 } from '../ppt/saveModel'
import { 收集演示资源标识 } from '../ppt/model/migrations'
import { 桥接 } from '../ipc/bridge'
import type { Sheet } from '../sheet/model'
import type { 演示文稿 } from '../ppt/deck'

export type 待保存类型 = 'word' | 'table' | 'ppt'

export interface 待保存文档 {
  标识: string
  名称: string
  类型: 待保存类型
  路径: string | null
  html?: string
  页面设置?: 文字页面设置
  表格模型?: Sheet[]
  演示模型?: 演示文稿
  文件指纹?: string
  /** 导入来源路径：与来源同名且导入时有警告时不允许直接覆盖 */
  来源路径?: string
  警告?: string[]
}

export interface 保存成功项 { 标识: string; 名称: string; 路径: string; 文件指纹?: string }
export interface 保存失败项 { 标识: string; 名称: string; 原因: string }
export interface 保存全部结果 {
  已保存: 保存成功项[]
  失败: 保存失败项[]
  /** 用户在“另存为”里取消：中止本次保存，交由用户重新选择 */
  已取消: boolean
}

const 文字保存扩展 = new Set(['.docx', '.txt', '.md', '.json', '.html', '.htm', '.pdf'])

function 是同一路径(左: string, 右: string): boolean {
  return 左.replace(/\\/g, '/').toLowerCase() === 右.replace(/\\/g, '/').toLowerCase()
}

/** 按类型补齐或校验扩展名；无法保存的格式返回 null */
export function 规范保存路径(类型: 待保存类型, 路径: string): string | null {
  const 扩展 = 路径.match(/\.[^\\/]+$/)?.[0]?.toLowerCase()
  if (类型 === 'word') {
    if (扩展 === undefined) return `${路径}.docx`
    return 文字保存扩展.has(扩展) ? 路径 : null
  }
  if (类型 === 'table') {
    if (扩展 === undefined) return `${路径}.xlsx`
    return 扩展 === '.xlsx' ? 路径 : null
  }
  if (扩展 === undefined) return `${路径}.pptx`
  return 扩展 === '.pptx' ? 路径 : null
}

function 格式提示(类型: 待保存类型): string {
  if (类型 === 'word') return '文字文档只能保存为 DOCX、纯文本、网页或 PDF 格式'
  if (类型 === 'table') return '表格只能保存为 XLSX 格式'
  return '演示文稿只能保存为 PPTX 格式'
}

/** 转换与写盘可能抛出非 Error（例如 DOMException），这里统一取到可读原因 */
function 描述错误(错误: unknown, 兜底: string): string {
  if (错误 instanceof Error && 错误.message) return 错误.message
  if (typeof 错误 === 'string' && 错误) return 错误
  const 消息 = (错误 as { message?: unknown } | null)?.message
  return typeof 消息 === 'string' && 消息 ? 消息 : 兜底
}

/** 写入一个文档，成功时返回新的文件指纹 */
async function 写出文档(文档: 待保存文档, 路径: string): Promise<string | undefined> {
  if (文档.类型 === 'word') {
    const 模型 = htmlToDocxModel(文档.html ?? '', 文档.页面设置)
    if (模型.未覆盖.length > 0) throw new Error(`含尚无法写入 DOCX 的内容：${模型.未覆盖.join('、')}`)
    const 结果: any = await 桥接.office.writeDocx(模型)
    if (!结果?.成功 || !结果.数据) throw new Error(结果?.错误 || '文档格式转换失败')
    const 字节 = Uint8Array.from(atob(结果.数据), (字符) => 字符.charCodeAt(0))
    const 保存 = await 桥接.saveToFile(路径, 字节, '二进制', 文档.文件指纹)
    if (!保存.成功) throw new Error(保存.错误 || '文件写入失败')
    return 保存.文件指纹
  }
  if (文档.类型 === 'table') {
    const 模型 = 导出为Xlsx(文档.表格模型 ?? [])
    if (模型 === null) throw new Error('工作表为空，没有可保存的内容')
    const 结果: any = await 桥接.office.writeXlsx(模型)
    if (!结果?.成功 || !结果.数据) throw new Error(结果?.错误 || '表格格式转换失败')
    const 保存 = await 桥接.saveToFile(路径, 结果.数据, '二进制', 文档.文件指纹)
    if (!保存.成功) throw new Error(保存.错误 || '文件写入失败')
    return 保存.文件指纹
  }
  const 文稿 = 文档.演示模型
  if (!文稿) throw new Error('演示文稿内容缺失，无法保存')
  const 标识列表 = 收集演示资源标识(文稿)
  const 资源 = 标识列表.length > 0 ? await 桥接.presentationResources.export(标识列表) : { 成功: true, 条目: [] }
  if (!资源.成功 || !资源.条目) throw new Error(资源.错误 || '图片资源导出失败')
  const 结果: any = await 桥接.office.writePptx(构建演示保存模型(文稿, 资源.条目))
  if (!结果?.成功 || !结果.数据) throw new Error(结果?.错误 || '生成演示文稿文件失败')
  const 保存 = await 桥接.saveToFile(路径, 结果.数据, '二进制', 文档.文件指纹)
  if (!保存.成功) throw new Error(保存.错误 || '文件写入失败')
  return 保存.文件指纹
}

/**
 * 依次保存传入的文档；单个文档失败不打断其余文档，便于退出前尽量保留内容。
 * 用户在“另存为”对话框取消时停止后续文档并把 已取消 置为 true。
 */
export async function 保存全部文档(列表: 待保存文档[]): Promise<保存全部结果> {
  const 已保存: 保存成功项[] = []
  const 失败: 保存失败项[] = []
  let 已取消 = false
  for (const 文档 of 列表) {
    try {
      if (文档.来源路径 && 文档.路径 && (文档.警告?.length ?? 0) > 0 && 是同一路径(文档.路径, 文档.来源路径)) {
        throw new Error('导入时有未完整导入的内容，已阻止覆盖来源文件，请另存为副本')
      }
      let 路径 = 文档.路径
      if (!路径) {
        const 选择 = await 桥接.showSaveDialog(文档.名称, 文档.类型)
        if (!选择) { 已取消 = true; break }
        路径 = 选择
      }
      const 规范路径 = 规范保存路径(文档.类型, 路径)
      if (规范路径 === null) throw new Error(格式提示(文档.类型))
      const 文件指纹 = await 写出文档(文档, 规范路径)
      已保存.push({ 标识: 文档.标识, 名称: 文档.名称, 路径: 规范路径, ...(文件指纹 ? { 文件指纹 } : {}) })
    } catch (错误) {
      失败.push({ 标识: 文档.标识, 名称: 文档.名称, 原因: 描述错误(错误, '保存失败') })
    }
  }
  return { 已保存, 失败, 已取消 }
}
