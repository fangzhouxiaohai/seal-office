import type { 色调 } from '../../components/navTones'

// 同一命令在不同标签沿用同一色调，颜色值由首页共用的 data-tone 变量提供。
const 命令色调: Record<string, 色调> = {
  'file.open': 'amber',
  'file.save': 'blue',
  'file.saveAs': 'blue',
  'file.print': 'slate',
  'clipboard.paste': 'blue',
  'clipboard.cut': 'orange',
  'clipboard.copy': 'sky',
  'clipboard.formatPainter': 'teal',
  'image.insert': 'orange',
  'shape.insert': 'purple',
  'chart.insert': 'orange',
  'smartart.insert': 'teal',
  'datetime.insert': 'amber',
  'symbol.insert': 'purple',
  'footnote.insert': 'indigo',
  'endnote.insert': 'indigo',
  'bookmark.insert': 'amber',
  'layout.watermark': 'sky',
  'layout.pageBorder': 'blue',
  'layout.pageColor': 'amber',
  'layout.dropCap': 'teal',
  'toc.insert': 'sky',
  'toc.update': 'sky',
  'caption.insert': 'sky',
  'caption.tableOfFigures': 'sky',
  'citation.insert': 'purple',
  'citation.manageSource': 'purple',
  'bibliography.insert': 'blue',
  'spell.check': 'teal',
  'word.count': 'blue',
  'translate.start': 'sky',
  'comment.new': 'orange',
  'comment.delete': 'red',
  'comment.show': 'orange',
  'track.accept': 'green',
  'track.reject': 'red',
  'protect.start': 'amber',
  'field.insert': 'blue',
  'mailmerge.start': 'teal',
}

const 前缀色调: Array<[string, 色调]> = [
  ['file.export', 'purple'],
  ['font.', 'purple'],
  ['para.', 'teal'],
  ['style.', 'blue'],
  ['edit.', 'sky'],
  ['page.', 'blue'],
  ['table.', 'green'],
  ['textbox.', 'blue'],
  ['header.', 'sky'],
  ['footer.', 'sky'],
  ['pagenumber.', 'sky'],
  ['wordart.', 'purple'],
  ['formula.', 'purple'],
  ['link.', 'sky'],
  ['crossref.', 'sky'],
  ['layout.', 'indigo'],
  ['lang.', 'sky'],
  ['track.', 'violet'],
  ['compare.', 'indigo'],
  ['merge.', 'indigo'],
  ['view.', 'blue'],
]

export function 取文字功能区色调(命令标识: string): 色调 {
  const 固定 = 命令色调[命令标识]
  if (固定) return 固定
  return 前缀色调.find(([前缀]) => 命令标识.startsWith(前缀))?.[1] ?? 'violet'
}
