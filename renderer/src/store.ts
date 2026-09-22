// 应用状态层：集中承载当前模块、导航筛选、视图模式、排序方式与文档列表。
// 采用 Context 而非全局变量，保证状态随组件树卸载而释放，便于测试隔离。
import React, { createContext, useContext, useMemo, useState } from 'react'
import {
  RECENT_DOCS,
  filterDocs,
  sortDocs,
  type DocItem,
  type SortKey,
} from './mock/recentDocs'
import { NAV_GROUPS } from './routes'
import type { ModuleKey } from './routes'

export type ViewMode = 'grid' | 'list'

export interface AppState {
  /** 当前模块，home 为首页，其余为编辑器 */
  module: ModuleKey
  setModule: (模块: ModuleKey) => void
  /** 首页内的导航筛选键 */
  navKey: string
  setNavKey: (键: string) => void
  viewMode: ViewMode
  setViewMode: (模式: ViewMode) => void
  sortKey: SortKey
  setSortKey: (键: SortKey) => void
  /** 全量文档 */
  docs: DocItem[]
  /** 经筛选与排序后用于渲染的文档 */
  visibleDocs: DocItem[]
  toggleStar: (标识: string) => void
  /** 当前打开的文档标识，用于卡片选中态 */
  activeDocId: string | null
  setActiveDocId: (标识: string | null) => void
  /** 打开文档：按文档类型跳转到对应模块 */
  openDoc: (文档: DocItem) => void
  /** 处理首页导航点击：未实现项给出中文提示，不切换内容 */
  handleNav: (键: string, 提示: (文本: string) => void) => void
}

const AppContext = createContext<AppState | null>(null)

/** 文档类型到模块的映射，与 routes.tsx 保持一致，此处内联以避免循环依赖 */
const 类型到模块: Record<DocItem['type'], ModuleKey> = {
  word: 'word',
  table: 'table',
  ppt: 'ppt',
  pdf: 'home',
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [module, setModule] = useState<ModuleKey>('home')
  const [navKey, setNavKey] = useState<string>('home')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [docs, setDocs] = useState<DocItem[]>(RECENT_DOCS)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)

  const visibleDocs = useMemo(
    () => sortDocs(filterDocs(docs, navKey), sortKey),
    [docs, navKey, sortKey]
  )

  const toggleStar = (标识: string) => {
    setDocs((当前) =>
      当前.map((文档) => (文档.id === 标识 ? { ...文档, starred: !文档.starred } : 文档))
    )
  }

  const openDoc = (文档: DocItem) => {
    setActiveDocId(文档.id)
    setModule(类型到模块[文档.type])
  }

  const handleNav = (键: string, 提示: (文本: string) => void) => {
    const 目标项 = NAV_GROUPS.flat().find((项) => 项.key === 键)
    if (目标项 === undefined) {
      提示('该导航项不存在')
      return
    }
    if (!目标项.implemented) {
      提示(`「${目标项.label}」功能开发中`)
      return
    }
    setNavKey(键)
  }

  const 值 = useMemo<AppState>(
    () => ({
      module,
      setModule,
      navKey,
      setNavKey,
      viewMode,
      setViewMode,
      sortKey,
      setSortKey,
      docs,
      visibleDocs,
      toggleStar,
      activeDocId,
      setActiveDocId,
      openDoc,
      handleNav,
    }),
    [module, navKey, viewMode, sortKey, docs, visibleDocs, activeDocId]
  )

  return React.createElement(AppContext.Provider, { value: 值 }, children)
}

/**
 * 读取应用状态；脱离 Provider 使用属于编码错误，直接抛出明确中文异常。
 */
export function useAppStore(): AppState {
  const 状态 = useContext(AppContext)
  if (状态 === null) {
    throw new Error('useAppStore 必须在 AppProvider 内使用')
  }
  return 状态
}
