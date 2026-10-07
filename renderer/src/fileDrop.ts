// 拖入文件打开：从系统拖放数据里取出本地路径，并按可打开的扩展名分流。
import { 归一化扩展名 } from './fileOpen'

/** 与「打开文件」对话框一致的可打开格式 */
export const 可拖入扩展名 = ['docx', 'xlsx', 'pptx', 'pdf', 'csv', 'json', 'txt', 'md', 'html', 'htm'] as const

export interface 拖入文件分组 {
  可打开: string[]
  不支持: string[]
}

/** 拖放数据是否携带系统文件（而不是页面内拖动的文字、图片或幻灯片） */
export function 携带文件(数据: DataTransfer | null | undefined): boolean {
  if (!数据) return false
  return Array.from(数据.types ?? []).includes('Files')
}

/**
 * 取出拖入文件的本地路径。Electron 25 在渲染进程的 File 上提供 path；
 * 没有路径的条目（如从浏览器拖来的内存文件）无法按本地文件打开，直接忽略。
 */
export function 读取拖入路径(数据: DataTransfer | null | undefined): string[] {
  if (!数据) return []
  const 路径列表: string[] = []
  for (const 文件 of Array.from(数据.files ?? [])) {
    const 路径 = (文件 as File & { path?: unknown }).path
    if (typeof 路径 === 'string' && 路径.trim() !== '' && !路径列表.includes(路径)) 路径列表.push(路径)
  }
  return 路径列表
}

/** 按扩展名把拖入的路径分成可打开与不支持两组，保持拖入顺序 */
export function 分组拖入文件(路径列表: string[]): 拖入文件分组 {
  const 可打开: string[] = []
  const 不支持: string[] = []
  for (const 路径 of 路径列表) {
    const 扩展 = 归一化扩展名(路径)
    if ((可拖入扩展名 as readonly string[]).includes(扩展)) 可打开.push(路径)
    else 不支持.push(路径)
  }
  return { 可打开, 不支持 }
}

/**
 * 拖放位置是否落在编辑区自己的投放区里（如幻灯片舞台接收图片）。
 * 这些区域有自己的拖放语义，窗口级的「拖入即打开」不再介入，提示层也不显示。
 */
export function 在局部投放区(目标: EventTarget | null): boolean {
  const 元素 = 目标 as Element | null
  if (元素 === null || typeof 元素.closest !== 'function') return false
  return 元素.closest('[data-seal-dropzone]') !== null
}
