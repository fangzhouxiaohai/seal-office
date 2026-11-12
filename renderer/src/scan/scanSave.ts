// 识别结果保存：桌面与移动工作台沿用 showSaveDialog + saveToFile（移动端保存时交给系统分享），
// 网页版直接下载，不在浏览器存储中留存副本（网页版不提供扫描件库）。
import { 桥接 } from '../ipc/bridge'
import { 当前扫描平台 } from './platform'
import { 字节转Base64 } from './recognition'

const 类型映射 = { pdf: 'application/pdf', word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', table: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const
export type 导出类型 = keyof typeof 类型映射

export const 安全文件名 = (名称: string) => 名称.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '扫描件'

/** 返回实际保存的文件名；用户取消时返回 null */
export async function 保存导出文件(文件名: string, 字节: Uint8Array, 类型: 导出类型): Promise<string | null> {
  const 名称 = 安全文件名(文件名)
  if (当前扫描平台() === 'web') {
    const 地址 = URL.createObjectURL(new Blob([字节 as BlobPart], { type: 类型映射[类型] })), 链接 = document.createElement('a')
    链接.href = 地址; 链接.download = 名称; 链接.rel = 'noopener'; document.body.appendChild(链接); 链接.click(); 链接.remove()
    setTimeout(() => URL.revokeObjectURL(地址), 60000)
    return 名称
  }
  const 路径 = await 桥接.showSaveDialog(名称, 类型)
  if (!路径) return null
  const 结果 = await 桥接.saveToFile(路径, 字节转Base64(字节), '二进制')
  if (!结果.成功) throw new Error(结果.错误 || '文件保存失败')
  return 路径.split(/[\\/]/).pop() || 名称
}

export const 自Base64 = (文本: string) => Uint8Array.from(atob(文本), 字 => 字.charCodeAt(0))

export function 格式化大小(字节: number): string {
  if (字节 < 1024) return `${字节} B`
  if (字节 < 1024 * 1024) return `${(字节 / 1024).toFixed(1)} KB`
  return `${(字节 / 1024 / 1024).toFixed(1)} MB`
}
