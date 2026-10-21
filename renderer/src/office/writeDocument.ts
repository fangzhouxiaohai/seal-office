import { 桥接 } from '../ipc/bridge'
import { 原生文档类型 } from '../fileFormats'
/** 普通 OOXML 继续走原生编解码器，其余可写格式交给离线兼容引擎。 */
export async function 写出办公文档(类型: 'word' | 'table' | 'ppt', 路径: string, 模型: unknown, 进度提示?: () => (() => void) | void, 原生数据?: unknown): Promise<any> {
  const 扩展 = 路径.match(/\.([^\\/.]+)$/)?.[1]?.toLowerCase()
  if(原生文档类型(路径)) {
    const expected=原生文档类型(路径)
    if(expected!==类型||!原生数据)throw new Error('海豹专属格式的数据类型不匹配')
    return 桥接.office.writeSeal(类型,原生数据)
  }
  if (类型 === 'word' && 扩展 === 'docx') return 桥接.office.writeDocx(模型)
  if (类型 === 'table' && 扩展 === 'xlsx') return 桥接.office.writeXlsx(模型)
  if (类型 === 'ppt' && 扩展 === 'pptx') return 桥接.office.writePptx(模型)
  const 收起 = 进度提示?.()
  try { return await 桥接.office.writeCompatible(类型, 扩展 ?? '', 模型) }
  finally { 收起?.() }
}

/** PDF processing owns the complete final PDF bytes, including page objects and annotations. */
export async function 写出PDF文档(路径: string, PDF数据: string, 警告?: string[]): Promise<any> {
  if (原生文档类型(路径) === 'pdf') return 桥接.office.writeSeal('pdf', { PDF数据, ...(警告?.length ? { 警告 } : {}) })
  if (/\.pdf$/i.test(路径)) return { 成功: true, 数据: PDF数据 }
  throw new Error('请选择海豹 PDF（.spdf）或 PDF（.pdf）格式')
}
