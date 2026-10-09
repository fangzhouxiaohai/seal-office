/**
 * Persist the supported text/paragraph appearance, including browser defaults.
 * The measuring tree contains no resources, event attributes or executable tags.
 * The source tree stays detached and retains images and unsupported-content checks.
 */
import type { 文字页面设置 } from './docModel'

function 正文宽度(设置?: 文字页面设置): number {
  const 尺寸 = ({ A4: [794, 1123], A5: [559, 794], B5: [665, 945], Letter: [816, 1056] } as Record<string, number[]>)[设置?.纸张 || 'A4'] || [794, 1123]
  const 自定义 = 设置?.纸张 === '自定义' && 设置.原始纸张
  const 纸宽 = 自定义 ? 自定义.宽 / 15 : 尺寸[设置?.纸张方向 === '横向' ? 1 : 0]
  const 边距 = ({ 常规: 90, 窄: 36, 适中: 72, 宽: 144 } as Record<string, number>)[设置?.页边距 || '常规'] ?? 90
  const 边距总和 = 设置?.页边距 === '自定义' && 设置.原始页边距 ? (设置.原始页边距.左 + 设置.原始页边距.右) / 15 : 边距 * 2
  const 边框 = 设置?.页面边框 === '三维' ? 10 : ['方框', '阴影'].includes(设置?.页面边框 || '') ? 4 : 0
  return Math.max(1, 纸宽 - 边距总和 - 边框)
}
const 字符样式 = ['font-size', 'font-family', 'font-weight', 'font-style'] as const
const 探针样式 = [...字符样式, 'line-height', 'text-align', 'text-indent', 'letter-spacing',
  'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'vertical-align', 'text-decoration',
  'width', 'height', 'padding', 'border', 'border-collapse', 'border-spacing', 'background-color',
  ...['top', 'right', 'bottom', 'left'].flatMap(side => [`padding-${side}`, `border-${side}`,
    `border-${side}-width`, `border-${side}-style`, `border-${side}-color`])]
const 安全标签 = new Set('p div h1 h2 h3 h4 h5 h6 li ul ol blockquote section article span font b strong i em u s strike del sup sub small big br img table tbody thead tfoot tr td th'.split(' '))
const 段落标签 = new Set('P H1 H2 H3 H4 H5 H6 LI'.split(' '))

export function 固定文档显示格式(来源: HTMLElement, 部分: '正文' | '页眉' | '页脚' = '正文', 设置?: 文字页面设置): void {
  const 探针 = document.createElement('div')
  探针.className = 部分 === '正文' ? 'wps-editor-canvas__content' : 部分 === '页眉' ? 'wps-editor-canvas__header' : 'wps-editor-canvas__footer'
  const 字号 = 部分 === '正文' ? 14 : 12, 行高 = 部分 === '正文' ? 1.75 : 1.4
  探针.style.cssText = `position:fixed;left:-100000px;top:0;width:${正文宽度(设置)}px;visibility:hidden;pointer-events:none;font-size:${字号}px;line-height:${行高};`
  if (部分 === '正文' && 设置?.分栏 && 设置.分栏 !== '一栏') {
    探针.style.columnCount = 设置.分栏 === '三栏' ? '3' : '2'
    探针.style.columnGap = '24px'
  }
  探针.style.fontFamily = getComputedStyle(document.body).fontFamily || '"Microsoft YaHei", "PingFang SC", Arial, sans-serif'
  来源.style.fontSize = `${字号}px`
  来源.style.fontFamily = 探针.style.fontFamily
  探针.setAttribute('aria-hidden', 'true')
  const 对应: Array<[HTMLElement, HTMLElement]> = []
  const 建探针 = (节点: Node): Node => {
    if (!(节点 instanceof HTMLElement)) return document.createTextNode(节点.nodeType === Node.TEXT_NODE ? 节点.textContent || '' : '')
    const 标签 = 节点.tagName.toLowerCase()
    const 副本 = document.createElement(安全标签.has(标签) ? 标签 : 'span')
    副本.className = 节点.className
    for (const 属性 of ['align', 'face', 'size', 'color', 'width', 'height', 'colspan', 'rowspan']) {
      const 值 = 节点.getAttribute(属性)
      if (值 !== null) 副本.setAttribute(属性, 值)
    }
    for (const 属性 of Array.from(节点.style)) {
      if (探针样式.includes(属性)) 副本.style.setProperty(属性, 节点.style.getPropertyValue(属性))
    }
    节点.childNodes.forEach(子 => 副本.appendChild(建探针(子)))
    对应.push([节点, 副本])
    return 副本
  }
  来源.childNodes.forEach(节点 => 探针.appendChild(建探针(节点)))
  document.body.appendChild(探针)
  try {
    for (const [节点, 副本] of 对应) {
      const 样式 = getComputedStyle(副本)
      if (typeof 样式.getPropertyValue !== 'function') continue
      for (const 属性 of 字符样式) {
        const 值 = 样式.getPropertyValue(属性)
        // Real Chromium resolves font sizes to px. Do not treat unresolved em or
        // keywords from non-layout test environments as absolute measurements.
        if (值 && (属性 !== 'font-size' || /^\d+(?:\.\d+)?px$/.test(值))) 节点.style.setProperty(属性, 值)
      }
      if (['TABLE', 'TD', 'TH'].includes(节点.tagName)) {
        for (const 属性 of ['width', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
          'border-collapse', 'border-spacing', 'background-color', 'vertical-align',
          ...['top', 'right', 'bottom', 'left'].flatMap(side => [`border-${side}-width`, `border-${side}-style`, `border-${side}-color`])]) {
          const 值 = 样式.getPropertyValue(属性)
          if (值 && !(属性 === 'width' && 节点.tagName === 'TABLE' && 节点.style.width.endsWith('%'))) 节点.style.setProperty(属性, 值)
        }
      }
      if (!段落标签.has(节点.tagName)) continue
      for (const 属性 of ['margin-top', 'margin-bottom', 'text-align']) {
        if (节点.style.getPropertyValue(属性)) continue
        const 值 = 样式.getPropertyValue(属性)
        if (值 && (/^-?\d+(?:\.\d+)?px$/.test(值) || 属性 === 'text-align')) 节点.style.setProperty(属性, 值)
      }
      // Unitless line height must remain proportional when a paragraph contains
      // different font sizes. An explicit exact/atLeast rule remains untouched.
      if (!节点.style.lineHeight) {
        let 祖先 = 副本.parentElement
        while (祖先 && !祖先.style.lineHeight) 祖先 = 祖先.parentElement
        if (祖先?.style.lineHeight) 节点.style.lineHeight = 祖先.style.lineHeight
      }
    }
  } finally { 探针.remove() }
}
