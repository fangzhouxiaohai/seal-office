import { 读取本地文件内容 } from '../fileOpen'
import { 载入PDF } from '../pdf/pdfLoader'
import type { DocItem } from '../mock/recentDocs'

const 缓存 = new Map<string, { 版本: string; 文字: string }>()

function html文字(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
}

function 模型文字(值: unknown): string {
  if (typeof 值 === 'string') return 值.startsWith('data:') || 值.length > 100000 ? '' : 值
  if (Array.isArray(值)) return 值.map(模型文字).join(' ')
  if (!值 || typeof 值 !== 'object') return ''
  return Object.entries(值).filter(([键]) => !['图片', 'image', 'data', 'base64', '资源'].includes(键)).map(([, 项]) => 模型文字(项)).join(' ')
}

/** 读取应用可打开的文件格式，供首页最近文档正文搜索复用。 */
export async function 读取搜索文字(文档: DocItem): Promise<string> {
  if (!文档.路径) return ''
  const 版本 = `${文档.updatedAt}:${文档.size}`
  const 已有 = 缓存.get(文档.路径)
  if (已有?.版本 === 版本) return 已有.文字
  const 内容 = await 读取本地文件内容(文档.路径)
  let 文字 = ''
  if (内容.类型 === 'pdf' && 内容.内容) {
    const 加载 = await 载入PDF(内容.内容)
    try {
      const 页文字: string[] = []
      for (let 页码 = 1; 页码 <= 加载.文档.numPages; 页码 += 1) {
        const 页面 = await 加载.文档.getPage(页码)
        const 结果 = await 页面.getTextContent()
        页文字.push(结果.items.map((项) => 'str' in 项 ? 项.str : '').join(' '))
      }
      文字 = 页文字.join('\n')
    } finally { 加载.关闭() }
  } else if (内容.类型 === 'ppt') 文字 = 模型文字(内容.演示文稿)
  else if (内容.工作表列表) 文字 = 内容.工作表列表.map((表) => 'html' in 表 ? html文字(表.html) : 模型文字(表.单元格)).join(' ')
  else 文字 = html文字(内容.内容 || '')
  缓存.set(文档.路径, { 版本, 文字 })
  return 文字
}

export function 搜索片段(文字: string, 关键词: string): string | null {
  const 位置 = 文字.toLocaleLowerCase().indexOf(关键词.toLocaleLowerCase())
  if (位置 < 0) return null
  return 文字.slice(Math.max(0, 位置 - 30), Math.min(文字.length, 位置 + 关键词.length + 65)).replace(/\s+/g, ' ').trim()
}
