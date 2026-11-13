// 为尚未支持 Markdown 的旧客户端生成可读说明；发行页仍保留 Markdown 原文。
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const 解析器 = unified().use(remarkParse).use(remarkGfm)

function 行内(节点) {
  if (节点.type === 'html') return ''
  if (节点.type === 'break') return '\n'
  if (节点.type === 'image') return 节点.alt || ''
  if (typeof 节点.value === 'string') return 节点.value
  return (节点.children || []).map(行内).join('')
}

function 段落(节点) {
  if (节点.type === 'html' || 节点.type === 'thematicBreak') return ''
  if (节点.type === 'root' || 节点.type === 'blockquote') return (节点.children || []).map(段落).filter(Boolean).join('\n\n')
  if (节点.type === 'list') return (节点.children || []).map(段落).filter(Boolean).join('\n')
  if (节点.type === 'listItem') return (节点.children || []).map(段落).filter(Boolean).join('\n')
  return 行内(节点).trim()
}

export function 转为旧版说明(文本) {
  if (typeof 文本 !== 'string') throw new TypeError('更新说明必须是文字')
  return 段落(解析器.parse(文本)).trim()
}
