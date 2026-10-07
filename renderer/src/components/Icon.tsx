// 内联 SVG 图标集：全站唯一图标来源，不引入第三方图标库。
// 线性图标统一 1.6 描边与圆角端点；文档类型图标使用填充风格。
import React from 'react'
import FileTypeIcon, { type FileIconType } from './FileTypeIcon'

export const ICON_NAMES = [
  'home', 'clock', 'star', 'star-filled', 'share', 'cloud', 'users',
  'pdf', 'mindmap', 'flow', 'settings', 'help',
  'search', 'grid', 'list', 'sort', 'more', 'arrow-left', 'plus', 'retry',
  'doc-word', 'doc-table', 'doc-ppt', 'doc-pdf', 'doc-empty',
  /* 首页图标 */
  'bell', 'headset', 'member', 'apps', 'ai', 'aippt', 'wps365', 'folder', 'trash',
  'sun', 'moon', 'sliders',
  'desktop', 'download-file', 'globe', 'tag', 'device', 'cloud-off', 'wechat', 'knowledge', 'export-file',
  /* 编辑器图标 */
  'paste', 'cut', 'copy', 'copy-text', 'copy-all', 'format-painter',
  'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript',
  'align-left', 'align-center', 'align-right', 'align-justify',
  'bullet-list', 'numbered-list', 'indent-increase', 'indent-decrease',
  'line-spacing', 'shading', 'undo', 'redo', 'find-text', 'replace-text',
  'table', 'image', 'shape', 'textbox', 'wordart', 'chart', 'formula',
  'header', 'footer', 'page-number', 'calendar', 'symbol', 'link', 'bookmark', 'crossref',
  'footnote', 'endnote', 'toc', 'caption', 'comment', 'track', 'compare',
  'spell-check', 'word-count', 'language',
  'page-view', 'read-view', 'web-view', 'outline-view', 'draft-view',
  'ruler', 'gridlines', 'paragraph-mark', 'navigation',
  'zoom-in', 'zoom-out', 'zoom-reset', 'fit-width',
  'watermark', 'page-border', 'page-color', 'columns', 'page-break',
  'margin', 'orientation', 'paper-size', 'line-numbers', 'export-file', 'close',
  'open', 'save', 'save-as',
]

interface IconProps {
  name: string
  size?: number
  color?: string
  className?: string
}

/** 线性图标路径表 */
const 线性路径: Record<string, React.ReactNode> = {
  home: <path d="M3 7.2 8 3l5 4.2V13H3z" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5v3.2l2.2 1.4" />
    </>
  ),
  star: <path d="m8 2.6 1.7 3.6 3.9.5-2.8 2.7.7 3.9L8 11.5l-3.5 1.8.7-3.9L2.4 6.7l3.9-.5z" />,
  'star-filled': <path d="m8 2.6 1.7 3.6 3.9.5-2.8 2.7.7 3.9L8 11.5l-3.5 1.8.7-3.9L2.4 6.7l3.9-.5z" fill="currentColor" />,
  share: (
    <>
      <circle cx="12" cy="3.6" r="1.8" />
      <circle cx="4" cy="8" r="1.8" />
      <circle cx="12" cy="12.4" r="1.8" />
      <path d="m5.6 7.1 4.8-2.6M5.6 8.9l4.8 2.6" />
    </>
  ),
  cloud: <path d="M4.6 12h6.8a2.6 2.6 0 0 0 .2-5.2 3.4 3.4 0 0 0-6.5-.6A2.6 2.6 0 0 0 4.6 12z" />,
  users: (
    <>
      <circle cx="6" cy="5.4" r="2.2" />
      <path d="M2.4 13c0-2 1.6-3.4 3.6-3.4S9.6 11 9.6 13" />
      <path d="M10.8 4.2a2 2 0 0 1 0 3.9M11.6 9.9c1.5.3 2.6 1.5 2.6 3.1" />
    </>
  ),
  pdf: (
    <>
      <path d="M4 2.4h5l3 3V13.6H4z" />
      <path d="M9 2.4v3h3" />
    </>
  ),
  mindmap: (
    <>
      <rect x="5.6" y="6.4" width="4.8" height="3.2" rx="1" />
      <path d="M8 2.6v3.8M3.4 13.4V9.6h4.2M12.6 13.4V9.6H8.4" />
    </>
  ),
  flow: (
    <>
      <rect x="5.6" y="1.8" width="4.8" height="3" rx="1" />
      <rect x="5.6" y="11.2" width="4.8" height="3" rx="1" />
      <path d="M8 4.8v6.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.4 6.2a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1v.3M8 11.6v.1" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="m10.6 10.6 3 3" />
    </>
  ),
  grid: (
    <>
      <rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1" />
      <rect x="9" y="2.4" width="4.6" height="4.6" rx="1" />
      <rect x="2.4" y="9" width="4.6" height="4.6" rx="1" />
      <rect x="9" y="9" width="4.6" height="4.6" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M6 4h7M6 8h7M6 12h7M3 4h.1M3 8h.1M3 12h.1" />
    </>
  ),
  sort: <path d="M4 3.4v9.2M2.2 10.8 4 12.6l1.8-1.8M9 4.4h4.8M9 8h3.4M9 11.6h2" />,
  more: (
    <>
      <circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  'arrow-left': <path d="M12.8 8H3.2M6.8 4.4 3.2 8l3.6 3.6" />,
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  retry: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.4V5h-2.6" />,

  /* 剪贴板 */
  paste: (
    <>
      <rect x="3.4" y="3" width="9.2" height="11" rx="1.2" />
      <path d="M6 3V1.8h4V3M6 7h4M6 9.6h2.6" />
    </>
  ),
  cut: (
    <>
      <circle cx="4.2" cy="11.6" r="1.8" />
      <circle cx="11.8" cy="11.6" r="1.8" />
      <path d="M5.4 10.4 11 2.4M10.6 10.4 5 2.4" />
    </>
  ),
  copy: (
    <>
      <rect x="2.6" y="2.6" width="7.4" height="8.4" rx="1.2" />
      <path d="M6 13.4h7.4V5" />
    </>
  ),
  /* 复制本页文字：复制图形内加正文行 */
  'copy-text': (
    <>
      <rect x="2.6" y="2.6" width="7.4" height="8.4" rx="1.2" />
      <path d="M6 13.4h7.4V5" />
      <path d="M4.4 5.6h3.8M4.4 7.6h3.8M4.4 9.6h2.2" />
    </>
  ),
  /* 复制全文文字：三张错开的纸页，表示整篇内容 */
  'copy-all': (
    <>
      <rect x="4.6" y="4.6" width="6.4" height="7" rx="1.1" />
      <path d="M7 13.6h5.8V6.8" />
      <path d="M1.6 5.4V1.6h3.8" />
    </>
  ),
  'format-painter': (
    <>
      <path d="M3 3.4h7.4v3.2H3z" />
      <path d="M6.6 6.6v2.6c0 1 .8 1.8 1.8 1.8h1.6v2.6" />
      <rect x="9.2" y="11" width="2.6" height="3.2" rx="0.8" />
    </>
  ),

  /* 字体 */
  bold: <path d="M4.4 2.6h4.2a2.5 2.5 0 0 1 0 5H4.4zM4.4 7.6h4.8a2.6 2.6 0 0 1 0 5.2H4.4z" />,
  italic: <path d="M6.6 2.6h5M4.4 13.4h5M9.4 2.6 6.6 13.4" />,
  underline: <path d="M4.4 2.6v5.2a3.6 3.6 0 0 0 7.2 0V2.6M3.6 13.6h8.8" />,
  strikethrough: <path d="M3.2 8h9.6M11 4.6A3.4 3.4 0 0 0 8 2.8c-1.8 0-3.2 1-3.2 2.2 0 .9.7 1.6 2 2.2M5 11.4a3.6 3.6 0 0 0 3.2 1.8c1.9 0 3.3-1 3.3-2.3 0-.8-.5-1.4-1.5-1.9" />,
  subscript: <path d="M3 3.4h5.6M5.8 3.4 3 10.4M11.4 10.4v1.4h2.8v1.4h-2.8" />,
  superscript: <path d="M2.6 4.6h5.6M5.4 4.6 2.6 11.6M11 2.6v1.4h2.8V5.4H11" />,

  /* 段落对齐 */
  'align-left': <path d="M2.6 3.6h10.8M2.6 6.8h7M2.6 10h10.8M2.6 13.2h7" />,
  'align-center': <path d="M2.6 3.6h10.8M4.6 6.8h6.8M2.6 10h10.8M4.6 13.2h6.8" />,
  'align-right': <path d="M2.6 3.6h10.8M6.4 6.8h7M2.6 10h10.8M6.4 13.2h7" />,
  'align-justify': <path d="M2.6 3.6h10.8M2.6 6.8h10.8M2.6 10h10.8M2.6 13.2h10.8" />,
  'bullet-list': (
    <>
      <path d="M5.6 4h7.8M5.6 8h7.8M5.6 12h7.8" />
      <circle cx="3" cy="4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  'numbered-list': (
    <>
      <path d="M6 4h7.4M6 8h7.4M6 12h7.4" />
      <path d="M2.2 2.8 3.4 2.4V6M1.8 10.2c0-.7.6-1.2 1.4-1.2s1.4.5 1.4 1.2c0 1-2.8 1.6-2.8 3h2.9" />
    </>
  ),
  'indent-increase': <path d="M2.6 3.4h10.8M6.6 6.8h6.8M6.6 10h6.8M2.6 13.4h10.8M2.4 7.2 4.6 9l-2.2 1.8z" />,
  'indent-decrease': <path d="M2.6 3.4h10.8M6.6 6.8h6.8M6.6 10h6.8M2.6 13.4h10.8M4.6 7.2 2.4 9l2.2 1.8z" />,
  'line-spacing': <path d="M6 3.6h7.4M6 8h7.4M6 12.4h7.4M2.4 2.6v10.8M1.2 4 2.4 2.6 3.6 4M1.2 12 2.4 13.4 3.6 12" />,
  shading: (
    <>
      <rect x="2.8" y="2.8" width="10.4" height="7" rx="1.2" />
      <path d="M5.4 12.6h5.2" />
    </>
  ),

  /* 编辑 */
  undo: <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.6V5.2h2.6" />,
  redo: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.6V5.2h-2.6" />,
  'find-text': (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="m10 10 3.2 3.2M5.2 7h3.6" />
    </>
  ),
  'replace-text': (
    <>
      <path d="M2.6 4.4h6.2M5.2 2.6v1.8M4 4.4v0M4.2 4.4c0 2-1.2 3.4-1.6 3.8M5.8 8.2c-.6-.4-1.6-1.6-1.8-3.4" />
      <path d="M7.4 13.4h6.2M10 11.6v1.8M9 13.4c0-2 1.2-3.4 1.6-3.8M10.6 17.2" />
    </>
  ),

  /* 插入 */
  table: (
    <>
      <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
      <path d="M2.4 6.4h11.2M2.4 9.8h11.2M6.2 3v10M10 3v10" />
    </>
  ),
  image: (
    <>
      <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
      <circle cx="5.8" cy="6.4" r="1.1" />
      <path d="m3.2 12.4 3.2-3 2.4 2.2 2-1.8 2 2.2" />
    </>
  ),
  shape: (
    <>
      <rect x="2.4" y="5.4" width="6.4" height="6.4" rx="1" />
      <circle cx="10.6" cy="6.6" r="3.2" />
    </>
  ),
  textbox: (
    <>
      <rect x="2.4" y="4" width="11.2" height="8" rx="1.2" />
      <path d="M4.6 6.4h6.8M8 6.4v4.2" />
    </>
  ),
  wordart: (
    <>
      <path d="M2.6 4.2h6M5.6 4.2l-2 7.6M9.6 11.8l1.4-5.4 1.4 5.4M10.4 10.2h2.4" />
    </>
  ),
  chart: (
    <>
      <path d="M2.6 2.6v10.8h10.8" />
      <path d="M5 10.6V7.4M8 10.6V5M11 10.6V8.6" />
    </>
  ),
  formula: <path d="M4.6 2.8h6.8M8 2.8v10.4M5.4 8h5.2" />,

  /* 页眉页脚与文本 */
  header: (
    <>
      <rect x="2.4" y="2.8" width="11.2" height="10.4" rx="1.2" />
      <path d="M2.4 6h11.2M4.6 4.4h3.2" />
    </>
  ),
  footer: (
    <>
      <rect x="2.4" y="2.8" width="11.2" height="10.4" rx="1.2" />
      <path d="M2.4 10h11.2M4.6 11.6h3.2" />
    </>
  ),
  'page-number': (
    <>
      <rect x="3.4" y="2" width="9.2" height="12" rx="1.2" />
      <path d="M6 12.2h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.4" y="3.4" width="11.2" height="10" rx="1.2" />
      <path d="M2.4 6.6h11.2M5.4 2.2v2.4M10.6 2.2v2.4" />
    </>
  ),
  symbol: (
    <>
      <circle cx="5.4" cy="5.4" r="2.4" />
      <path d="M8.6 8.6h4.4v4.4H8.6z" />
    </>
  ),
  link: <path d="M6.4 9.6a2.6 2.6 0 0 1 0-3.6l1.6-1.6a2.6 2.6 0 0 1 3.6 3.6l-.8.8M9.6 6.4a2.6 2.6 0 0 1 0 3.6l-1.6 1.6a2.6 2.6 0 0 1-3.6-3.6l.8-.8" />,
  bookmark: <path d="M4 2.4h8v11.2L8 10.8l-4 2.8z" />,
  crossref: (
    <>
      <path d="M3 8h4.4M8.6 8H13" />
      <path d="M5 5.4 2.6 8 5 10.6M11 5.4 13.4 8 11 10.6" />
    </>
  ),
  footnote: (
    <>
      <path d="M3 3.4h10M3 6.6h10M3 9.8h6" />
      <path d="M3 13h1.6v-1.8" />
    </>
  ),
  endnote: (
    <>
      <path d="M3 3.4h10M3 6.6h10M3 9.8h6" />
      <path d="M11.4 12.6h1.6v-1.8" />
    </>
  ),

  /* 引用 */
  toc: <path d="M3 3.4h10M4.6 6.6h8.4M6.2 9.8h6.8M3 13h10" />,
  caption: (
    <>
      <rect x="2.6" y="2.8" width="10.8" height="7" rx="1.2" />
      <path d="M4.6 12.4h6.8" />
    </>
  ),

  /* 审阅 */
  comment: <path d="M2.6 3.4h10.8v7.2H7.4L4.4 13v-2.4H2.6z" />,
  track: (
    <>
      <path d="M2.6 4.6h10.8M2.6 11.4h10.8" />
      <circle cx="6" cy="4.6" r="1.6" />
      <circle cx="10.4" cy="11.4" r="1.6" />
    </>
  ),
  compare: (
    <>
      <path d="M8 2.4v11.2" />
      <path d="M2.6 4.6h3.4v6.8H2.6zM10 4.6h3.4v6.8H10z" />
    </>
  ),
  'spell-check': (
    <>
      <path d="M2.6 11.4 5.6 4l3 7.4M3.8 9.2h3.6" />
      <path d="m9.6 11.6 1.8 1.8 3-3.6" />
    </>
  ),
  'word-count': (
    <>
      <path d="M3 3.4h10M3 6.4h10M3 9.4h6.4" />
      <path d="M9.6 12.6h4" />
    </>
  ),
  language: <path d="M2.6 3.6h7.2M6.2 3.6v1.4M4 5c0 3.2-1.4 5.4-2 6M7.6 5c-.4 2.4-2 4.4-3.6 5.4M8.4 13.4 10.6 7l2.2 6.4M9 11.4h3.2" />,

  /* 视图 */
  'page-view': (
    <>
      <rect x="4" y="2.4" width="8" height="11.2" rx="1" />
      <path d="M6 5.4h4M6 7.8h4M6 10.2h2.4" />
    </>
  ),
  'read-view': (
    <>
      <path d="M2.4 3.6h5.2v9.8H2.4zM8.4 3.6h5.2v9.8H8.4z" />
    </>
  ),
  'web-view': (
    <>
      <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
      <path d="M2.4 6h11.2" />
      <circle cx="4.4" cy="4.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="6.2" cy="4.5" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  'outline-view': (
    <>
      <path d="M2.6 3.6h3M7 3.6h6.4M4.6 8h3M9 8h4.4M4.6 12.4h3M9 12.4h4.4M2.6 3.6v8.8" />
    </>
  ),
  'draft-view': <path d="M2.6 3.4h10.8M2.6 6.6h10.8M2.6 9.8h10.8M2.6 13h6.4" />,
  ruler: (
    <>
      <rect x="2.4" y="5.6" width="11.2" height="4.8" rx="0.8" />
      <path d="M4.4 5.6v2.2M6.4 5.6v1.6M8.4 5.6v2.2M10.4 5.6v1.6M12.4 5.6v2.2" />
    </>
  ),
  gridlines: (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1" />
      <path d="M6.2 2.4v11.2M9.8 2.4v11.2M2.4 6.2h11.2M2.4 9.8h11.2" />
    </>
  ),
  'paragraph-mark': <path d="M8.6 2.6v10.8M11 2.6v10.8M8.6 2.6H6.2a2.6 2.6 0 0 0 0 5.2h2.4M11 2.6h1.4" />,
  navigation: (
    <>
      <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="1.2" />
      <path d="M2.4 2.6h4.4v10.8" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="m10 10 3.2 3.2M5.2 7h3.6M7 5.2v3.6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="m10 10 3.2 3.2M5.2 7h3.6" />
    </>
  ),
  'zoom-reset': (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="m10 10 3.2 3.2M5.4 7h3.2" />
    </>
  ),
  'fit-width': (
    <>
      <path d="M2.6 3.4h10.8M2.6 12.6h10.8" />
      <path d="M5.4 6.6 3.4 8l2 1.4M10.6 6.6 12.6 8l-2 1.4" />
    </>
  ),

  /* 页面布局 */
  watermark: (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1" />
      <path d="M4.6 10.4 9 5.4M6.6 11 11 6M4.4 8 7.6 4.6" />
    </>
  ),
  'page-border': (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1" />
      <rect x="4.2" y="4.2" width="7.6" height="7.6" rx="0.6" />
    </>
  ),
  'page-color': (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1" />
      <path d="M4.4 10.2c1.6-2 3-3.4 4.4-3.4s2.4 1 3 2" fill="currentColor" stroke="none" opacity="0.25" />
    </>
  ),
  columns: <path d="M2.6 3.4h4.4v9.2H2.6zM9 3.4h4.4v9.2H9z" />,
  'page-break': (
    <>
      <path d="M3.4 2.6h9.2v5H3.4z" />
      <path d="M2.4 10.6h11.2" strokeDasharray="2.4 1.6" />
      <path d="M3.4 13.4h9.2" />
    </>
  ),
  margin: (
    <>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1" />
      <path d="M4.6 4.6h6.8v6.8H4.6z" strokeDasharray="2 1.4" />
    </>
  ),
  orientation: (
    <>
      <rect x="2.4" y="4.4" width="11.2" height="7.2" rx="1" />
      <path d="M4.6 6.4h6.8M4.6 8h4.4" />
    </>
  ),
  'paper-size': (
    <>
      <path d="M3.4 2.6h6l3.2 3.2v7.6H3.4z" />
      <path d="M9.4 2.6v3.2h3.2" />
    </>
  ),
  'line-numbers': <path d="M5.6 3.6h8M5.6 8h8M5.6 12.4h8M2.6 3.6h.1M2.6 8h.1M2.6 12.4h.1" />,

  /* 导出 */
  'export-file': (
    <>
      <path d="M3.4 1.8h5.2l3.6 3.6v6.2H3.4z" />
      <path d="M8.6 1.8v3.6h3.6M11 11.4v3.2M9.6 13.2 11 14.6l1.4-1.4" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,

  /* 文件操作 */
  open: (
    <>
      <path d="M2.6 5.6H6l1.6-1.8 1.8 1.8h4.2V13.4H2.6z" />
    </>
  ),
  save: (
    <>
      <path d="M4 3.2h7.6l1.4 1.4V13.2H4z" />
      <path d="M4.2 3.2V10.8h7.6V7.8" />
    </>
  ),
  'save-as': (
    <>
      <path d="M4 3.2h7.6l1.4 1.4V13.2H4z" />
      <path d="M4.2 3.2V10.8h7.6V7.8" />
      <path d="M10.2 10v2.4M11.8 9.4l-1.4 1.4 1.4 1.4" />
    </>
  ),
}

/** 其余图标：文件类别的图形统一由 FileTypeIcon 提供。 */
const 文档图标: Record<string, React.ReactNode> = {
  'doc-empty': (
    <>
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" />
      <path d="M8.8 1.6v3.8h3.8M6 8h4M6 10.6h2.6" />
    </>
  ),
  /* 首页图标 */
  bell: (
    <>
      <path d="M3.2 11.6h9.6c-1-1-1.6-2-1.6-3.8V6.4a3.2 3.2 0 0 0-6.4 0v1.4c0 1.8-.6 2.8-1.6 3.8z" />
      <path d="M6.6 13.4a1.5 1.5 0 0 0 2.8 0" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.3 3.3l1.3 1.3M11.4 11.4l1.3 1.3M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3" />
    </>
  ),
  moon: (
    <>
      <path d="M13.2 9.8A5.6 5.6 0 0 1 6.2 2.8a5.6 5.6 0 1 0 7 7z" />
    </>
  ),
  sliders: (
    <>
      <path d="M2.6 4.6h10.8M2.6 11.4h10.8" />
      <circle cx="6" cy="4.6" r="1.6" />
      <circle cx="10" cy="11.4" r="1.6" />
    </>
  ),
  headset: (
    <>
      <path d="M2.8 9.6v-1a5.2 5.2 0 0 1 10.4 0v1" />
      <path d="M2.8 9.2h1.6a.8.8 0 0 1 .8.8v2.4a.8.8 0 0 1-.8.8H2.8zM13.2 9.2h-1.6a.8.8 0 0 0-.8.8v2.4a.8.8 0 0 0 .8.8h1.6z" />
    </>
  ),
  member: (
    <>
      <path d="M8 1.6l5.4 3.2v6.4L8 14.4 2.6 11.2V4.8z" />
      <path d="M8 1.6v6.2m0 0l5.4-3.2M8 7.8L2.6 4.8" />
    </>
  ),
  apps: (
    <>
      <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
    </>
  ),
  ai: (
    <>
      <path d="M8 2.4l1.3 3.4 3.4 1.3-3.4 1.3L8 11.8 6.7 8.4 3.3 7.1l3.4-1.3z" />
      <path d="M12.6 11.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" />
    </>
  ),
  aippt: (
    <>
      <path d="M2.6 2.6h10.8v8H2.6z" />
      <path d="M5.4 13.4h5.2M6.4 5.4h3.2M6.4 7.8h4.4" />
    </>
  ),
  wps365: (
    <>
      <path d="M8 1.8l5.6 3.2v6L8 14.2 2.4 11V5z" />
      <path d="M5.6 6l2.4 4 2.4-4" />
    </>
  ),
  folder: (
    <>
      <path d="M2.2 3.6h4l1.4 1.6h6.2v7.4H2.2z" />
    </>
  ),
  trash: (
    <>
      <path d="M3.4 4.6h9.2M6.4 4.6V3h3.2v1.6M4.6 4.6l.6 8h5.6l.6-8M6.8 6.8v3.8M9.2 6.8v3.8" />
    </>
  ),
  desktop: (
    <>
      <path d="M2.4 3h11.2v7H2.4zM6 12.4h4M8 10v2.4" />
    </>
  ),
  'download-file': (
    <>
      <path d="M8 2.6v7M5.2 7l2.8 2.8L10.8 7M3.4 12.4h9.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M2.6 8h10.8M8 2.6c1.6 1.5 2.4 3.3 2.4 5.4S9.6 11.9 8 13.4C6.4 11.9 5.6 10.1 5.6 8S6.4 4.1 8 2.6z" />
    </>
  ),
  tag: (
    <>
      <path d="M2.6 2.6h5l5.8 5.8-5 5-5.8-5.8z" />
      <circle cx="5.4" cy="5.4" r="0.9" />
    </>
  ),
  device: (
    <>
      <path d="M4.6 2.2h6.8v11.6H4.6zM7 12.2h2" />
    </>
  ),
  'cloud-off': (
    <>
      <path d="M4.6 12h6.8a2.6 2.6 0 0 0 .2-5.2 3.4 3.4 0 0 0-6.5-.6A2.6 2.6 0 0 0 4.6 12z" />
      <path d="M2.6 2.6l10.8 10.8" />
    </>
  ),
  wechat: (
    <>
      <path d="M6.4 2.8a4.4 4.4 0 0 0-4 4.4c0 1 .3 1.9.9 2.7L2.6 12l2.2-.7c.7.4 1.5.6 2.4.6" />
      <path d="M13.4 9.8a3.6 3.6 0 0 0-3.6-3.4 3.6 3.6 0 0 0-3.6 3.4 3.6 3.6 0 0 0 3.6 3.4c.7 0 1.4-.2 2-.5l1.9.6-.5-1.7c.2-.5.2-1.1.2-1.8z" />
    </>
  ),
  knowledge: (
    <>
      <path d="M8 2.2l5.4 2.4v3.6c0 3-2.2 5-5.4 6-3.2-1-5.4-3-5.4-6V4.6z" />
      <path d="M5.8 7.9l1.6 1.6 3-3" />
    </>
  ),
  'export-file': (
    <>
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" />
      <path d="M8.8 1.6v3.8h3.8M10 9.4l2.4-2.4 2.4 2.4M12.4 7v6" />
    </>
  ),
}

const 文件类型: Record<string, FileIconType> = {
  'doc-word': 'word', 'doc-table': 'table', 'doc-ppt': 'ppt', 'doc-pdf': 'pdf',
}

const Icon = ({ name, size = 16, color, className }: IconProps) => {
  if (文件类型[name]) return <FileTypeIcon type={文件类型[name]} size={size} color={color} className={className} />
  const 图形 = 线性路径[name] ?? 文档图标[name] ?? 文档图标['doc-empty']

  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: color ?? 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      color,
      className,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    图形
  )
}

export default Icon
