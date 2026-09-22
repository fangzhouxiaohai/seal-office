// 模块与导航注册表：全应用模块清单的唯一事实源。
// 新增模块时只需在此登记，侧栏、新建区与页面分发自动生效。
import type { ComponentType } from 'react'
import type { DocType } from './mock/recentDocs'
import HomePage from './pages/HomePage'
import WordPage from './pages/WordPage'
import TablePage from './pages/TablePage'
import PptPage from './pages/PptPage'

export type ModuleKey = 'home' | 'word' | 'table' | 'ppt'

export interface NavItem {
  key: string
  label: string
  /** Icon 组件中的图标名称 */
  icon: string
  /** 该项是否支持切换内容，未实现的项仅提示功能开发中 */
  implemented: boolean
}

export interface ModuleInfo {
  key: ModuleKey
  label: string
  page: ComponentType
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
    { key: 'pdf', label: 'PDF 工具', icon: 'pdf', implemented: false },
    { key: 'mindmap', label: '脑图', icon: 'mindmap', implemented: false },
    { key: 'flow', label: '流程图', icon: 'flow', implemented: false },
  ],
  [
    { key: 'settings', label: '设置', icon: 'settings', implemented: false },
    { key: 'help', label: '帮助与反馈', icon: 'help', implemented: false },
  ],
]

export const MODULES: Record<ModuleKey, ModuleInfo> = {
  home: { key: 'home', label: '首页', page: HomePage },
  word: { key: 'word', label: '文档', page: WordPage },
  table: { key: 'table', label: '表格', page: TablePage },
  ppt: { key: 'ppt', label: '演示', page: PptPage },
}

/** 文档类型对应的打开目标；PDF 暂不支持编辑，回落首页 */
export const DOC_TYPE_TO_MODULE: Record<DocType, ModuleKey> = {
  word: 'word',
  table: 'table',
  ppt: 'ppt',
  pdf: 'home',
}

export interface NewDocEntry {
  key: DocType
  label: string
  icon: string
  color: string
  implemented: boolean
}

/** 首页新建区四宫格入口 */
export const NEW_DOC_ENTRIES: NewDocEntry[] = [
  { key: 'word', label: '新建文字', icon: 'doc-word', color: '#2B6CF6', implemented: true },
  { key: 'table', label: '新建表格', icon: 'doc-table', color: '#00A870', implemented: true },
  { key: 'ppt', label: '新建演示', icon: 'doc-ppt', color: '#ED7B2F', implemented: true },
  { key: 'pdf', label: 'PDF 工具', icon: 'doc-pdf', color: '#E34D59', implemented: false },
]

/** 模块 key 到文档类型的反查，供编辑器视图使用 */
export function moduleToDocType(模块: ModuleKey): DocType | null {
  switch (模块) {
    case 'word':
      return 'word'
    case 'table':
      return 'table'
    case 'ppt':
      return 'ppt'
    default:
      return null
  }
}
