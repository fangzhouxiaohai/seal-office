import type { 文字页面设置 } from '../office/docModel'
export interface CollaborativeWord { html: string; source: string; 页面设置?: 文字页面设置 }
export function splitWordModel(html: string, 页面设置?: 文字页面设置): CollaborativeWord {
  const box = document.createElement('div'); box.innerHTML = html
  const metadata = Array.from(box.querySelectorAll('[data-seal-docx-package]')); const source = metadata.map(node => node.outerHTML).join(''); metadata.forEach(node => node.remove())
  return { html: box.innerHTML, source, 页面设置 }
}
export const joinWordModel = (model: CollaborativeWord) => model.source + model.html
/** All local input is browser-serialized HTML. A repaired remote parse signals
 * a concurrent tag/attribute conflict and must not silently replace the draft. */
export function validateWordModel(model: CollaborativeWord): string | null {
  if (!model || typeof model.html !== 'string' || typeof model.source !== 'string' || model.html.length > 30_000_000 || model.source.length > 29_000_000) return '协作文档模型无效或超过限制'
  const box = document.createElement('div'); box.innerHTML = model.html
  const stack: string[] = [], voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
  const tokens = /<!--[\s\S]*?-->|<\/?[a-z][a-z0-9:-]*(?:\s+[a-z_:][a-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?)*\s*\/?>/gi
  let position = 0, match: RegExpExecArray | null, malformed = false
  while ((match = tokens.exec(model.html))) {
    if (model.html.slice(position, match.index).includes('<')) { malformed = true; break }
    position = tokens.lastIndex; if (match[0].startsWith('<!--')) continue
    const name = match[0].match(/^<\/?([a-z0-9:-]+)/i)![1].toLowerCase()
    if (match[0].startsWith('</')) { if (stack.pop() !== name) { malformed = true; break } }
    else if (!voids.has(name)) { if (/\/>$/.test(match[0])) { malformed = true; break } stack.push(name) }
  }
  if (malformed || stack.length || model.html.slice(position).includes('<') || box.querySelector('script,iframe,object,embed,form,input,style,[data-seal-docx-package]')) return '并发编辑产生了HTML结构冲突；本机草稿已保留，请重新连接后处理'
  for (const element of Array.from(box.querySelectorAll('*'))) for (const attribute of Array.from(element.attributes)) if (/^on/i.test(attribute.name) || /^(?:href|src)$/i.test(attribute.name) && /^\s*(?:javascript|vbscript):/i.test(attribute.value)) return '协作文档包含不安全内容'
  const sourceBox = document.createElement('div'); sourceBox.innerHTML = model.source
  if (Array.from(sourceBox.childNodes).some(node => !(node instanceof HTMLElement) || !node.hasAttribute('data-seal-docx-package') || node.childNodes.length || !node.hidden || node.getAttribute('contenteditable') !== 'false')) return '协作文档来源元数据无效'
  if (sourceBox.children.length > 1) return '协作文档来源元数据重复'
  return null
}
