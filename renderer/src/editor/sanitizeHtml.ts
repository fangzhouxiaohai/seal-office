import DOMPurify from 'dompurify'

/** 保留文档排版标签与内联样式，同时阻止外部富文本携带脚本和交互控件。 */
export function 净化富文本(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // graphics.ts generates only passive SVG geometry and text. Keep these
    // exact elements/attributes across canvas input and native save/reopen;
    // enabling the complete SVG profile would allow unrelated active content.
    ADD_TAGS: ['svg', 'rect', 'line', 'polyline', 'circle', 'path', 'text'],
    ADD_ATTR: ['contenteditable', 'xmlns', 'viewBox', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'points', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'text-anchor', 'font-size'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'base'],
  })
}
