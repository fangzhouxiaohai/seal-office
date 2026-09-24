// 导航与新建入口注册表：只包含数据，不依赖任何页面组件。
// 状态层与页面层共用此文件，页面层另由 routes.tsx 装配，避免形成循环依赖。

import type { DocType } from './mock/recentDocs'

export type ModuleKey = 'home' | 'word' | 'table' | 'ppt' | 'settings' | 'help'

export interface NavItem {
  key: string
  label: string
  /** Icon 组件中的图标名称 */
  icon: string
  /** 该项是否支持切换内容，未实现的项仅提示功能开发中 */
  implemented: boolean
}

export interface NewDocEntry {
  key: DocType
  label: string
  icon: string
  color: string
  implemented: boolean
}

/** 侧栏导航分组，按数组顺序渲染，组间以细线分隔 */
export const NAV_GROUPS: NavItem[][] = [
  [
    { key: 'home', label: '首页', icon: 'home', implemented: true },
    { key: 'recent', label: '最近', icon: 'clock', implemented: true },
    { key: 'star', label: '星标', icon: 'star', implemented: true },
    { key: 'shared', label: '共享', icon: 'share', implemented: true },
  ],
  [
    { key: 'cloud', label: '我的云文档', icon: 'cloud', implemented: false },
    { key: 'team', label: '团队文档', icon: 'users', implemented: false },
  ],
  [
    { key: 'pdf', label: 'PDF 工具', icon: 'pdf', implemented: true },
    { key: 'mindmap', label: '脑图', icon: 'mindmap', implemented: true },
    { key: 'flow', label: '流程图', icon: 'flow', implemented: true },
  ],
  [
    { key: 'settings', label: '设置', icon: 'settings', implemented: true },
    { key: 'help', label: '帮助手册', icon: 'help', implemented: true },
  ],
]

/** 文档类型对应的打开目标；PDF 暂不支持编辑，回落首页 */
export const DOC_TYPE_TO_MODULE: Record<DocType, ModuleKey> = {
  word: 'word',
  table: 'table',
  ppt: 'ppt',
  pdf: 'home',
}

/** 首页新建区四宫格入口 */
export const NEW_DOC_ENTRIES: NewDocEntry[] = [
  { key: 'word', label: '新建文字', icon: 'doc-word', color: '#2B6CF6', implemented: true },
  { key: 'table', label: '新建表格', icon: 'doc-table', color: '#00A870', implemented: true },
  { key: 'ppt', label: '新建演示', icon: 'doc-ppt', color: '#ED7B2F', implemented: true },
  { key: 'pdf', label: 'PDF 工具', icon: 'doc-pdf', color: '#E34D59', implemented: false },
]

/** 未打开具体文档时，各编辑器顶栏展示的默认文件名 */
export const NEW_DOC_NAMES: Record<Exclude<ModuleKey, 'home'>, string> = {
  word: '未命名文档.docx',
  table: '未命名表格.xlsx',
  ppt: '未命名演示.pptx',
  settings: '设置',
  help: '帮助手册',
}
