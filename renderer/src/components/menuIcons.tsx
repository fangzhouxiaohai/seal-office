// 右键菜单图标：颜色命令显示实心色块，AI 命令统一为多彩星星，常用命令按功能配彩色线性图标。
import Icon from './Icon'
import AiStarIcon from './AiStarIcon'

export type 菜单图标描述 = { 类型: 'AI' } | { 类型: '色块'; 颜色: string } | { 类型: '图标'; 名称: string; 颜色: string }

const 色 = { 剪贴板: '#2B6CF6', 格式: '#8E5BF6', 段落: '#0EA5A4', 编辑: '#F2994A', 插入: '#16B378', 危险: '#E34D59', 数据: '#D97706' }

/** 按命令标识关键字匹配，先匹配到的优先。 */
const 规则: Array<[RegExp, string, string]> = [
  [/(^|\.)(delete|remove)\w*$|^delete$|删除/i, 'trash', 色.危险],
  [/paste/i, 'paste', 色.剪贴板],
  [/cut/i, 'cut', 色.剪贴板],
  [/copy/i, 'copy', 色.剪贴板],
  [/formatPainter|painter/i, 'format-painter', 色.格式],
  [/bold/i, 'bold', 色.格式],
  [/italic/i, 'italic', 色.格式],
  [/underline/i, 'underline', 色.格式],
  [/strike/i, 'strikethrough', 色.格式],
  [/superscript/i, 'superscript', 色.格式],
  [/subscript/i, 'subscript', 色.格式],
  [/font\.clear|clearFormat|clear\.format/i, 'replace-text', 色.格式],
  [/bullet/i, 'bullet-list', 色.段落],
  [/number(ed)?(List)?$|para\.number/i, 'numbered-list', 色.段落],
  [/indentDecrease|outdent/i, 'indent-decrease', 色.段落],
  [/indentIncrease|indent$/i, 'indent-increase', 色.段落],
  [/align\.?left|alignLeft/i, 'align-left', 色.段落],
  [/align\.?center|alignCenter/i, 'align-center', 色.段落],
  [/align\.?right|alignRight/i, 'align-right', 色.段落],
  [/find|search/i, 'find-text', 色.编辑],
  [/replace/i, 'replace-text', 色.编辑],
  [/selectAll/i, 'grid', 色.编辑],
  [/undo/i, 'undo', 色.编辑],
  [/redo/i, 'redo', 色.编辑],
  [/comment/i, 'comment', 色.插入],
  [/link/i, 'link', 色.插入],
  [/image|picture/i, 'image', 色.插入],
  [/table/i, 'table', 色.插入],
  [/chart/i, 'chart', 色.插入],
  [/textbox/i, 'textbox', 色.插入],
  [/sort/i, 'sort', 色.数据],
  [/filter/i, 'sliders', 色.数据],
  [/sum|formula/i, 'formula', 色.数据],
  [/merge/i, 'columns', 色.数据],
  [/(^|\.)wrap/i, 'paragraph-mark', 色.数据],
  [/bringToFront|front/i, 'front', 色.格式],
  [/save/i, 'save', 色.剪贴板],
  [/print/i, 'page-view', 色.剪贴板],
]

export function 菜单图标(项: { commandId: string; commandParam?: string; label: string }): 菜单图标描述 | null {
  if (/__ai__|^ai\.|^assistant\./i.test(项.commandId) || /^AI\s/.test(项.label)) return { 类型: 'AI' }
  const 颜色 = /#[0-9A-Fa-f]{6}\b/.exec(`${项.commandId} ${项.commandParam ?? ''}`)?.[0]
  if (颜色) return { 类型: '色块', 颜色: 颜色.toUpperCase() }
  for (const [匹配, 名称, 图标色] of 规则) if (匹配.test(项.commandId)) return { 类型: '图标', 名称, 颜色: 图标色 }
  return null
}

/** 渲染菜单项前的 16px 图标位；没有图标时保留占位，使文字左对齐。 */
export function 菜单图标元素({ 描述 }: { 描述: 菜单图标描述 | null }) {
  if (!描述) return <span className="wps-context-menu__icon" aria-hidden="true" />
  if (描述.类型 === 'AI') return <span className="wps-context-menu__icon" aria-hidden="true"><AiStarIcon size={15} /></span>
  if (描述.类型 === '色块') return <span className="wps-context-menu__icon" aria-hidden="true"><span className="wps-context-menu__swatch" style={{ background: 描述.颜色 }} /></span>
  return <span className="wps-context-menu__icon" aria-hidden="true"><Icon name={描述.名称} size={15} color={描述.颜色} /></span>
}
