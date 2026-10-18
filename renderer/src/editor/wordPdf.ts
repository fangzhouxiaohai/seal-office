import type { 文档模型 } from '../office/docModel'
import { 导出为Html } from './exportDoc'

/** Select before conversion. Native-only content must never fall back after a
 * converter error; ordinary text/images/notes retain the existing offline path. */
export function wordPdfRoute(html: string, model: 文档模型): 'html' | 'native' {
  const root = document.createElement('div'); root.innerHTML = html
  const page = model.页面设置
  if (page?.分栏 && page.分栏 !== '一栏' || page?.文字方向 === '竖排') return 'native'
  if (root.querySelector('[data-seal-ooxml-locked],[data-seal-native-protected],[data-seal-revision-type],[data-seal-paragraph-revision],[data-seal-format-change],[data-seal-field]')) return 'native'
  for (const node of root.querySelectorAll<HTMLElement>('[data-seal-revision-catalog]')) {
    try { const entries = JSON.parse(decodeURIComponent(node.dataset.sealRevisionCatalog!)); if (!Array.isArray(entries) || entries.length) return 'native' } catch { return 'native' }
  }
  const sections = root.querySelectorAll<HTMLElement>('[data-seal-section-layout]')
  if (sections.length > 1 || model.源包 && !sections.length) return 'native'
  for (const node of sections) {
    try {
      const layout = JSON.parse(decodeURIComponent(node.dataset.sealSectionLayout!))
      if (Number(layout.分栏?.数量 ?? 1) > 1 || ['oddPage', 'evenPage'].includes(layout.类型)) return 'native'
      for (const key of ['页眉Html', '页脚Html']) if (layout[key] && ['first', 'even'].some(kind => Object.prototype.hasOwnProperty.call(layout[key], kind))) return 'native'
    } catch { return 'native' }
  }
  for (const html of [page?.页眉Html, page?.页脚Html]) if (html) {
    const part = document.createElement('div'); part.innerHTML = html
    if (part.querySelector('[data-seal-native-protected],[data-seal-revision-type],[data-seal-format-change],[data-seal-field]')) return 'native'
  }
  return 'html'
}

/** The metadata package is neither visible text nor offline PDF input. Notes
 * and embedded images remain in the rendered content, as in the prior path. */
export function wordPdfHtml(html: string, model: 文档模型, title: string): string {
  const root = document.createElement('div'); root.innerHTML = html
  root.querySelectorAll('[data-seal-docx-package],[data-seal-ooxml-empty],[hidden]').forEach(node => node.remove())
  for (const node of root.querySelectorAll('*')) for (const attribute of Array.from(node.attributes)) if (attribute.name.startsWith('data-seal-') || ['contenteditable', 'spellcheck'].includes(attribute.name)) node.removeAttribute(attribute.name)
  const page = model.页面设置
  return 导出为Html(title, root.innerHTML, page?.页眉Html ?? '', page?.页脚Html ?? '', page?.水印 ?? '无')
}
