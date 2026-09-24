// 应用状态层：集中承载当前模块、导航筛选、视图模式、排序方式、文档列表与编辑器文档。
// 采用 Context 而非全局变量，保证状态随组件树卸载而释放，便于测试隔离。
import React, { createContext, useContext, useMemo, useState } from 'react'
import {
  RECENT_DOCS,
  filterDocs,
  sortDocs,
  type DocItem,
  type SortKey,
} from './mock/recentDocs'
import { DOC_TYPE_TO_MODULE, NAV_GROUPS, NEW_DOC_NAMES, type ModuleKey } from './navConfig'

export type ViewMode = 'grid' | 'list'

/** 编辑器中的文档：内容保存在内存，本轮不落盘 */
export interface EditorDocument {
  id: string
  name: string
  html: string
}

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
  /** 首页展示用的文档列表 */
  docs: DocItem[]
  /** 经筛选与排序后用于渲染的文档 */
  visibleDocs: DocItem[]
  toggleStar: (标识: string) => void
  /** 首页卡片的选中标识 */
  activeDocId: string | null
  setActiveDocId: (标识: string | null) => void
  /** 打开首页文档：进入对应模块并新建编辑器标签 */
  openDoc: (文档: DocItem) => void
  /** 新建文档：进入对应模块并创建编辑器标签 */
  createDoc: (类型: DocItem['type']) => void
  /** 重命名文档；传入纯空白名称时不生效，避免写入无效文件名 */
  renameDoc: (标识: string, 名称: string) => void
  /** 删除文档；若删除的是当前打开文档，同时清空选中标识 */
  removeDoc: (标识: string) => void
  /** 处理首页导航点击：未实现项给出中文提示，不切换内容 */
  handleNav: (键: string, 提示: (文本: string) => void) => void
  /** 编辑器已打开的文档 */
  documents: EditorDocument[]
  /** 编辑器当前文档标识 */
  activeDocumentId: string | null
  setActiveDocumentId: (标识: string | null) => void
  updateEditorHtml: (标识: string, html: string) => void
  closeEditorDoc: (标识: string) => void
  /** 在当前模块下新建一个编辑器标签 */
  createEditorDoc: () => void
  /** 切换到设置页面 */
  showSettings: () => void
  /** 切换到帮助页面 */
  showHelp: () => void
  /** 返回首页 */
  goHome: () => void
}

const AppContext = createContext<AppState | null>(null)

/** 生成文档标识；使用时间戳与随机后缀，避免同一毫秒内重复 */
function 生成文档标识(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 取模块对应的默认文档名，home 不参与编辑器 */
function 模块默认文档名(模块: ModuleKey): string {
  return 模块 === 'home' ? '未命名文档.docx' : NEW_DOC_NAMES[模块]
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [module, setModule] = useState<ModuleKey>('home')
  const [navKey, setNavKey] = useState<string>('home')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [docs, setDocs] = useState<DocItem[]>(RECENT_DOCS)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<EditorDocument[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)

  const visibleDocs = useMemo(
    () => sortDocs(filterDocs(docs, navKey), sortKey),
    [docs, navKey, sortKey]
  )

  const toggleStar = (标识: string) => {
    setDocs((当前) =>
      当前.map((文档) => (文档.id === 标识 ? { ...文档, starred: !文档.starred } : 文档))
    )
  }

  /** 追加一个编辑器标签并设为当前文档 */
  const 新建标签 = (名称: string) => {
    const 新文档: EditorDocument = {
      id: 生成文档标识(),
      name: 名称,
      html: '<p><br></p>',
    }
    setDocuments((当前) => [...当前, 新文档])
    setActiveDocumentId(新文档.id)
    return 新文档
  }

  const createDoc = (类型: DocItem['type']) => {
    setActiveDocId(null)
    const 目标模块 = DOC_TYPE_TO_MODULE[类型]
    setModule(目标模块)
    新建标签(模块默认文档名(目标模块))
  }

  const openDoc = (文档: DocItem) => {
    setActiveDocId(文档.id)
    const 目标模块 = DOC_TYPE_TO_MODULE[文档.type]
    setModule(目标模块)
    if (目标模块 === 'home') {
      return
    }
    // 同一文档重复打开时复用已有标签，避免产生重复标签页
    const 已存在 = documents.find((项) => 项.name === 文档.name)
    if (已存在 !== undefined) {
      setActiveDocumentId(已存在.id)
      return
    }
    新建标签(文档.name)
  }

  const createEditorDoc = () => {
    const 目标模块: ModuleKey = module === 'home' ? 'word' : module
    新建标签(模块默认文档名(目标模块))
  }

  const updateEditorHtml = (标识: string, html: string) => {
    setDocuments((当前) => 当前.map((项) => (项.id === 标识 ? { ...项, html } : 项)))
  }

  const closeEditorDoc = (标识: string) => {
    const 剩余 = documents.filter((项) => 项.id !== 标识)
    setDocuments(剩余)
    if (剩余.length === 0) {
      setActiveDocumentId(null)
      setActiveDocId(null)
      setModule('home')
      return
    }
    if (activeDocumentId === 标识) {
      setActiveDocumentId(剩余[剩余.length - 1].id)
    }
  }

  const showSettings = () => {
    setModule('settings')
    setNavKey('settings')
  }

  const showHelp = () => {
    setModule('help')
    setNavKey('help')
  }

  const goHome = () => {
    setModule('home')
    setNavKey('home')
  }

  const renameDoc = (标识: string, 名称: string) => {
    const 规范名称 = 名称.trim()
    if (规范名称.length === 0) {
      return
    }
    setDocs((当前) =>
      当前.map((文档) => (文档.id === 标识 ? { ...文档, name: 规范名称 } : 文档))
    )
  }

  const removeDoc = (标识: string) => {
    setDocs((当前) => 当前.filter((文档) => 文档.id !== 标识))
    setActiveDocId((当前) => (当前 === 标识 ? null : 当前))
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
      createDoc,
      renameDoc,
      removeDoc,
      handleNav,
      documents,
      activeDocumentId,
      setActiveDocumentId,
      updateEditorHtml,
      closeEditorDoc,
      createEditorDoc,
      showSettings,
      showHelp,
      goHome,
    }),
    [module, navKey, viewMode, sortKey, docs, visibleDocs, activeDocId, documents, activeDocumentId]
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
