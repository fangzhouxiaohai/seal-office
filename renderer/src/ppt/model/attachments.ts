import type { 演示对象 } from '../deck'

/** 附件与嵌入对象共用资源链路；本机不执行任何宏或脚本。 */
export const 附件资源类型 = 'application/vnd.openxmlformats-officedocument.oleObject'

const 宏扩展名 = new Set(['docm', 'dotm', 'xlsm', 'xltm', 'pptm', 'potm', 'ppam', 'xlam', 'doc', 'xls', 'ppt'])
const 标识 = () => `attachment-${crypto.randomUUID()}`

/** 按扩展名给出风险结论；真实字节校验在主进程加入资源时执行。 */
export function 读取附件风险(文件名: string): { 宏风险: boolean; 说明: string } {
  const 扩展名 = typeof 文件名 === 'string' && 文件名.includes('.') ? 文件名.split('.').pop()!.toLowerCase() : ''
  const 宏风险 = 宏扩展名.has(扩展名)
  return { 宏风险, 说明: 宏风险 ? '该扩展名可能包含宏或脚本，本机只保存字节、不执行内容' : '本机只保存字节，打开需使用对应程序' }
}

export function 创建附件(文件名: string, 显示名称: string, 资源标识: string, 字节数: number): 演示对象 {
  if (typeof 文件名 !== 'string' || !文件名.trim() || 文件名.length > 255) throw new Error('附件文件名不能为空')
  if (typeof 显示名称 !== 'string' || !显示名称.trim() || 显示名称.length > 255) throw new Error('附件显示名称不能为空')
  if (!/^[0-9a-f]{64}$/i.test(资源标识)) throw new Error('附件资源标识无效')
  if (!Number.isSafeInteger(字节数) || 字节数 <= 0) throw new Error('附件字节数无效')
  return { id: 标识(), 类型: '附件', x: 140, y: 220, width: 240, height: 120, 附件: { 文件名, 显示名称, 资源标识, 字节数 } }
}

export function 更新附件显示名称(对象: 演示对象, 显示名称: string): 演示对象 {
  if (对象.类型 !== '附件' || !对象.附件) throw new Error('请选择附件对象')
  if (typeof 显示名称 !== 'string' || !显示名称.trim() || 显示名称.length > 255) throw new Error('附件显示名称无效')
  return { ...对象, 附件: { ...对象.附件, 显示名称 } }
}

export function 格式化字节数(字节数: number): string {
  if (字节数 < 1024) return `${字节数} 字节`
  if (字节数 < 1024 * 1024) return `${(字节数 / 1024).toFixed(1)} KB`
  return `${(字节数 / 1024 / 1024).toFixed(1)} MB`
}

export const 附件最大字节 = 50 * 1024 * 1024

/** 读取真实文件字节并转 base64；超过单项限制时明确报错。 */
export async function 读取文件Base64(文件: File): Promise<string> {
  if (!文件 || 文件.size === 0) throw new Error('附件内容为空')
  if (文件.size > 附件最大字节) throw new Error('附件超过单个 50MB 限制')
  const 缓冲 = typeof 文件.arrayBuffer === 'function' ? await 文件.arrayBuffer() : await new Promise<ArrayBuffer>((完成, 拒绝) => {
    const 读取器 = new FileReader()
    读取器.onload = () => (读取器.result instanceof ArrayBuffer ? 完成(读取器.result) : 拒绝(new Error('附件读取失败')))
    读取器.onerror = () => 拒绝(new Error('附件读取失败，请检查文件是否可访问'))
    读取器.readAsArrayBuffer(文件)
  })
  const 字节 = new Uint8Array(缓冲)
  let 二进制 = ''
  const 块 = 0x8000
  for (let 位置 = 0; 位置 < 字节.length; 位置 += 块) 二进制 += String.fromCharCode(...字节.subarray(位置, 位置 + 块))
  return btoa(二进制)
}

/** 导出附件字节：写盘由浏览器下载完成，内容与嵌入字节一致。 */
export function 下载二进制Base64(数据: string, 文件名: string, 类型 = 'application/octet-stream'): void {
  const 二进制 = atob(数据)
  const 字节 = new Uint8Array(二进制.length)
  for (let 位置 = 0; 位置 < 二进制.length; 位置 += 1) 字节[位置] = 二进制.charCodeAt(位置)
  const 地址 = URL.createObjectURL(new Blob([字节], { type: 类型 }))
  const 链接 = document.createElement('a')
  链接.href = 地址
  链接.download = 文件名
  链接.click()
  setTimeout(() => URL.revokeObjectURL(地址), 0)
}
