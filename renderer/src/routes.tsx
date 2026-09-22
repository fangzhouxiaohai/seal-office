// 模块注册表：把导航数据与页面组件装配到一起。
// 导航数据本身位于 navConfig.ts，不依赖页面，供状态层直接引用。
import type { ComponentType } from 'react'
import {
  DOC_TYPE_TO_MODULE,
  NAV_GROUPS,
  NEW_DOC_ENTRIES,
  NEW_DOC_NAMES,
  type ModuleKey,
  type NavItem,
  type NewDocEntry,
} from './navConfig'
import HomePage from './pages/HomePage'
import WordPage from './pages/WordPage'
import TablePage from './pages/TablePage'
import PptPage from './pages/PptPage'

export interface ModuleInfo {
  key: ModuleKey
  label: string
  page: ComponentType
}

export const MODULES: Record<ModuleKey, ModuleInfo> = {
  home: { key: 'home', label: '首页', page: HomePage },
  word: { key: 'word', label: '文档', page: WordPage },
  table: { key: 'table', label: '表格', page: TablePage },
  ppt: { key: 'ppt', label: '演示', page: PptPage },
}

// 统一对外出口：页面与测试沿用 routes 作为导入路径，无需关心数据实际所在文件
export { DOC_TYPE_TO_MODULE, NAV_GROUPS, NEW_DOC_ENTRIES, NEW_DOC_NAMES }
export type { ModuleKey, NavItem, NewDocEntry }
