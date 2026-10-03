import DOMPurify from 'dompurify'

/** 保留文档排版标签与内联样式，同时阻止外部富文本携带脚本和交互控件。 */
export function 净化富文本(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'base'],
  })
}
