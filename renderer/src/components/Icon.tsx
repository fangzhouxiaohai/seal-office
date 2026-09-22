// 内联 SVG 图标集：全站唯一图标来源，不引入第三方图标库。
// 线性图标统一 1.6 描边与圆角端点；文档类型图标使用填充风格。
import React from 'react'

export const ICON_NAMES = [
  'home', 'clock', 'star', 'star-filled', 'share', 'cloud', 'users',
  'pdf', 'mindmap', 'flow', 'settings', 'help',
  'search', 'grid', 'list', 'sort', 'more', 'arrow-left', 'plus', 'retry',
  'doc-word', 'doc-table', 'doc-ppt', 'doc-pdf', 'doc-empty',
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
}

/** 文档类型图标：填充风格，颜色由外部传入 */
const 文档图标: Record<string, React.ReactNode> = {
  'doc-word': (
    <>
      <path d="M3.4 1.6h9.2v12.8H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h9.2v12.8H3.4z" />
      <path d="M5.4 5.2h5.2M5.4 8h5.2M5.4 10.8h3.2" />
    </>
  ),
  'doc-table': (
    <>
      <path d="M3.4 1.6h9.2v12.8H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h9.2v12.8H3.4z" />
      <path d="M3.4 5.6h9.2M3.4 9.6h9.2M8 5.6v8.8" />
    </>
  ),
  'doc-ppt': (
    <>
      <path d="M3.4 1.6h9.2v12.8H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h9.2v12.8H3.4z" />
      <path d="M5.6 5.4h2.6a1.6 1.6 0 0 1 0 3.2H5.6zM5.6 8.6v3" />
    </>
  ),
  'doc-pdf': (
    <>
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" />
      <path d="M8.8 1.6v3.8h3.8" />
    </>
  ),
  'doc-empty': (
    <>
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" />
      <path d="M8.8 1.6v3.8h3.8M6 8h4M6 10.6h2.6" />
    </>
  ),
}

const Icon = ({ name, size = 16, color, className }: IconProps) => {
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
