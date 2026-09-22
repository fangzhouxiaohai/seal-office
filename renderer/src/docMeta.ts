// 文档类型的展示元数据：文案、图标与配色，供网格卡片与列表行共用，避免多处重复定义。
import type { DocType } from './mock/recentDocs'

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  word: '文字',
  table: '表格',
  ppt: '演示',
  pdf: 'PDF',
}

export const DOC_TYPE_ICON: Record<DocType, string> = {
  word: 'doc-word',
  table: 'doc-table',
  ppt: 'doc-ppt',
  pdf: 'doc-pdf',
}

export const DOC_TYPE_COLOR: Record<DocType, string> = {
  word: '#2B6CF6',
  table: '#00A870',
  ppt: '#ED7B2F',
  pdf: '#E34D59',
}
