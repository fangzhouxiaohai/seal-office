// 模块注册表：把导航数据与页面组件装配到一起。
import type { ComponentType } from 'react'
import { DOC_TYPE_TO_MODULE, NAV_GROUPS, NEW_DOC_ENTRIES, NEW_DOC_NAMES, type ModuleKey, type NavItem, type NewDocEntry } from './navConfig'
import HomePage from './pages/HomePage'
import WordPage from './pages/WordPage'
import TablePage from './pages/TablePage'
import PptPage from './pages/PptPage'
import PdfPage from './pages/PdfPage'
import SettingsPage from './pages/SettingsPage'
import HelpManual from './components/HelpManual'

export interface ModuleInfo { key: ModuleKey; label: string; page: ComponentType }
export const MODULES: Record<ModuleKey, ModuleInfo> = {
  home: { key: 'home', label: '首页', page: HomePage }, word: { key: 'word', label: '文档', page: WordPage }, table: { key: 'table', label: '表格', page: TablePage }, ppt: { key: 'ppt', label: '演示', page: PptPage }, pdf: { key: 'pdf', label: 'PDF 工具', page: PdfPage }, settings: { key: 'settings', label: '设置', page: SettingsPage }, help: { key: 'help', label: '帮助', page: HelpManual },
}
export { DOC_TYPE_TO_MODULE, NAV_GROUPS, NEW_DOC_ENTRIES, NEW_DOC_NAMES }
export type { ModuleKey, NavItem, NewDocEntry }
