import { 桥接 } from '../ipc/bridge'
/** 普通 OOXML 继续走原生编解码器，其余可写格式交给离线兼容引擎。 */
export async function 写出办公文档(类型: 'word' | 'table' | 'ppt', 路径: string, 模型: unknown, 进度提示?: () => (() => void) | void): Promise<any> {
  const 扩展 = 路径.match(/\.([^\\/.]+)$/)?.[1]?.toLowerCase()
  if (类型 === 'word' && 扩展 === 'docx') return 桥接.office.writeDocx(模型)
  if (类型 === 'table' && 扩展 === 'xlsx') return 桥接.office.writeXlsx(模型)
  if (类型 === 'ppt' && 扩展 === 'pptx') return 桥接.office.writePptx(模型)
  const 收起 = 进度提示?.()
  try { return await 桥接.office.writeCompatible(类型, 扩展 ?? '', 模型) }
  finally { 收起?.() }
}
