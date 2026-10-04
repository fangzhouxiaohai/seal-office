// 应用状态层：集中承载当前模块、导航筛选、视图模式、排序方式、文档列表与编辑器文档。
// 采用 Context 而非全局变量，保证状态随组件树卸载而释放，便于测试隔离。
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Modal } from 'antd'
import {
  filterDocs,
  sortDocs,
  type DocItem,
  type SortKey,
} from './mock/recentDocs'
import { DOC_TYPE_TO_MODULE, NAV_GROUPS, NEW_DOC_NAMES, type ModuleKey } from './navConfig'
import { 桥接 } from './ipc/bridge'
import { 基准文件名, 记录最近文档, 读取本地文件内容 } from './fileOpen'
import { 创建工作表, 检查工作簿更新, type Sheet } from './sheet/model'
import { 从Html表格构建工作表, type Xlsx工作表元数据 } from './sheet/sheetImport'
import { 创建演示文稿, type 演示文稿 } from './ppt/deck'
import { 迁移演示文稿, 演示内容快照 } from './ppt/model/migrations'
import { 页面设置相同, type 文字页面设置 } from './office/docModel'

export type ViewMode = 'grid' | 'list'

/** 当前浏览页码属于工作区状态，不改变 PPTX 的正文内容。损坏快照仍视为未保存。 */
function 演示内容相同(当前: 演示文稿 | undefined, 已保存?: string): boolean {
  if (!当前 || !已保存) return false
  try {
    return 演示内容快照(迁移演示文稿(当前)) === 演示内容快照(迁移演示文稿(JSON.parse(已保存)))
  } catch { return false }
}

/** 各编辑器文档的身份与文字内容；表格和演示模型按相同标识独立保存。 */
export interface EditorDocument {
  id: string
  name: string
  html: string
  /** 最近一次成功写盘的文字内容，跨页面切换及自动备份后仍可判断未保存修改。 */
  已保存Html: string
  /** 最近一次成功写盘的结构化模型，供表格和演示判断修改状态。 */
  已保存模型?: string
  页面设置?: 文字页面设置
  已保存页面设置?: 文字页面设置
  type?: 'word' | 'table' | 'ppt'
  来源路径?: string
  文件指纹?: string
  警告?: string[]
}

export interface WorkspaceTab {
  id: string
  name: string
  type: 'word' | 'table' | 'ppt' | 'pdf'
  path: string | null
  dirty: boolean
}

export interface PdfDocument {
  id: string
  name: string
  path: string | null
  data: string | null
}

type 备份结果 = { 成功: boolean; 错误?: string }
type 备份任务 = { 操作: '保存'; 内容: string } | { 操作: '清理' }

export interface AppState {
  /** 当前模块，home 为首页，其余为编辑器 */
  module: ModuleKey
  setModule: (模块: ModuleKey) => void
  /** 首页内的导航筛选键 */
  navKey: string
  setNavKey: (键: string) => void
  /** 顶栏搜索关键词：按文档名过滤最近列表 */
  搜索词: string
  set搜索词: (词: string) => void
  /** 重新读取持久化的最近文档 */
  refreshRecents: () => void
  最近读取错误: string | null
  清除最近读取错误: () => void
  viewMode: ViewMode
  setViewMode: (模式: ViewMode) => void
  sortKey: SortKey
  setSortKey: (键: SortKey) => void
  /** 首页展示用的文档列表 */
  docs: DocItem[]
  /** 经筛选与排序后用于渲染的文档 */
  visibleDocs: DocItem[]
  toggleStar: (标识: string) => Promise<void>
  /** 首页卡片的选中标识 */
  activeDocId: string | null
  setActiveDocId: (标识: string | null) => void
  /** 打开首页文档：进入对应模块并新建编辑器标签 */
  openDoc: (文档: DocItem) => Promise<void>
  /** 新建文档：进入对应模块并创建编辑器标签；初始内容对 word 为 HTML，对表格为 HTML 表格，对演示为演示文稿模型 */
  createDoc: (类型: DocItem['type'], 初始内容?: unknown, 来源?: { 路径?: string; 名称?: string; 警告?: string[]; 页面设置?: 文字页面设置; 文件指纹?: string }) => void
  表格文档模型: Record<string, Sheet[]>
  更新表格文档模型: (标识: string, 更新: React.SetStateAction<Sheet[]>) => void
  演示文档模型: Record<string, 演示文稿>
  更新演示文档模型: (标识: string, 更新: React.SetStateAction<演示文稿>) => void
  PDF待预览: { 路径: string; 名称: string; 数据: string } | null
  pdfDocuments: readonly PdfDocument[]
  /** 重命名文档；传入纯空白名称时不生效，避免写入无效文件名 */
  renameDoc: (标识: string, 名称: string) => Promise<void>
  /** 删除文档；若删除的是当前打开文档，同时清空选中标识 */
  removeDoc: (标识: string) => Promise<void>
  /** 处理首页导航点击：未实现项给出中文提示，不切换内容 */
  handleNav: (键: string, 提示: (文本: string) => void) => void
  /** 编辑器已打开的文档 */
  documents: EditorDocument[]
  /** 编辑器当前文档标识 */
  activeDocumentId: string | null
  setActiveDocumentId: (标识: string | null) => void
  updateEditorHtml: (标识: string, html: string) => void
  更新文字页面设置: (标识: string, 设置: 文字页面设置) => void
  markDocumentSaved: (标识: string, html: string, 模型快照?: string, 文字保存快照?: { 页面设置?: 文字页面设置 }) => void
  文档路径: Record<string, string | null>
  set文档路径: (标识: string, 路径: string | null) => void
  更新文件指纹: (标识: string, 指纹: string) => void
  /** 写盘前查询目标路径是否被另一个工作区标签占用；调用方负责显示友好弹窗。 */
  查找保存路径占用: (当前标识: string | null, 目标路径: string) => WorkspaceTab | null
  closeEditorDoc: (标识: string) => void
  /** 全局底部工作区标签，顺序与文件打开顺序一致；首页单独固定在首位。 */
  workspaceTabs: WorkspaceTab[]
  activeWorkspaceTabId: string | null
  selectWorkspaceTab: (标识: string) => void
  closeWorkspaceTab: (标识: string) => void
  /** 在当前模块下新建一个编辑器标签 */
  createEditorDoc: () => void
  /** 自动备份恢复的提示文案；为 null 表示无提示 */
  备份恢复提示: string | null
  /** 启动时工作区恢复已结束；关联文件应在此后进入标签，避免被恢复状态覆盖。 */
  启动恢复结束: boolean
  /** 关闭前取消防抖，等待已发出的写入，再将最新工作区写盘。 */
  刷新工作状态备份: () => Promise<备份结果>
  清除备份提示: () => void
  /** 切换到设置页面 */
  showSettings: () => void
  /** 切换到帮助页面 */
  showHelp: () => void
  /** 返回首页 */
  goHome: () => void
}

const AppContext = createContext<AppState | null>(null)

/** 把时间戳格式化为首页展示用的 YYYY-MM-DD HH:mm */
function 格式化时间(时间戳?: number): string {
  if (时间戳 === undefined || !Number.isFinite(时间戳)) {
    const 现在 = new Date()
    const 补零 = (数值: number) => String(数值).padStart(2, '0')
    return `${现在.getFullYear()}-${补零(现在.getMonth() + 1)}-${补零(现在.getDate())} ${补零(现在.getHours())}:${补零(现在.getMinutes())}`
  }
  const 日期 = new Date(时间戳)
  const 补零 = (数值: number) => String(数值).padStart(2, '0')
  return `${日期.getFullYear()}-${补零(日期.getMonth() + 1)}-${补零(日期.getDate())} ${补零(日期.getHours())}:${补零(日期.getMinutes())}`
}

/** 生成文档标识；使用时间戳与随机后缀，避免同一毫秒内重复 */
function 生成文档标识(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 取模块对应的默认文档名，home 不参与编辑器 */
function 模块默认文档名(模块: ModuleKey): string {
  return 模块 === 'home' ? '未命名文档.docx' : NEW_DOC_NAMES[模块]
}

function 是同一路径(左: string | null | undefined, 右: string): boolean {
  return typeof 左 === 'string' && 左.replace(/\\/g, '/').toLowerCase() === 右.replace(/\\/g, '/').toLowerCase()
}

function 预览PDF文档(文档: PdfDocument | null | undefined): { 路径: string; 名称: string; 数据: string } | null {
  if (!文档?.data) return null
  return { 路径: 文档.path ?? `memory:${文档.id}`, 名称: 文档.name, 数据: 文档.data }
}

function 是工作表模型(值: unknown): 值 is Sheet {
  if (typeof 值 !== 'object' || 值 === null) return false
  const 表 = 值 as Partial<Sheet>
  return typeof 表.id === 'string' && typeof 表.name === 'string' &&
    typeof 表.单元格 === 'object' && 表.单元格 !== null &&
    Number.isInteger(表.行数) && Number.isInteger(表.列数) &&
    Array.isArray(表.列宽) && Array.isArray(表.行高) && Array.isArray(表.合并区域)
}

export function AppProvider({ children, 初始最近文档 }: { children: React.ReactNode; 初始最近文档?: DocItem[] }) {
  const { modal: 上下文弹窗 } = AntdApp.useApp()
  const 弹窗 = typeof 上下文弹窗.error === 'function' ? 上下文弹窗 : Modal
  const [module, setModule] = useState<ModuleKey>('home')
  const [navKey, setNavKey] = useState<string>('home')
  const [搜索词, set搜索词状态] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [docs, setDocs] = useState<DocItem[]>(初始最近文档 ?? [])
  const [最近读取错误, set最近读取错误] = useState<string | null>(null)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<EditorDocument[]>([])
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [文档路径, set文档路径状态] = useState<Record<string, string | null>>({})
  const [表格文档模型, set表格文档模型] = useState<Record<string, Sheet[]>>({})
  const [演示文档模型, set演示文档模型] = useState<Record<string, 演示文稿>>({})
  const [PDF待预览, setPDF待预览] = useState<{ 路径: string; 名称: string; 数据: string } | null>(null)
  const [pdfDocuments, setPdfDocuments] = useState<PdfDocument[]>([])
  const [activePdfId, setActivePdfId] = useState<string | null>(null)
  const [workspaceOrder, setWorkspaceOrder] = useState<string[]>([])
  const [工作状态设置, set工作状态设置] = useState<{ 值: boolean | null; 错误: string | null }>(() => {
    try { return { 值: localStorage.getItem('seal-session-restore') !== 'false', 错误: null } }
    catch (错误) { return { 值: null, 错误: 错误 instanceof Error ? 错误.message : '本机设置无法读取' } }
  })
  const 保存工作状态 = 工作状态设置.值

  useEffect(() => {
    if (工作状态设置.错误) 弹窗.error({ title: '读取工作状态设置失败', content: `自动备份已暂停，原有备份文件保持不变。${工作状态设置.错误}` })
  }, [工作状态设置.错误])

  useEffect(() => {
    const 同步设置 = () => {
      try { set工作状态设置({ 值: localStorage.getItem('seal-session-restore') !== 'false', 错误: null }) }
      catch (错误) { set工作状态设置({ 值: null, 错误: 错误 instanceof Error ? 错误.message : '本机设置无法读取' }) }
    }
    window.addEventListener('seal-session-setting-changed', 同步设置)
    return () => window.removeEventListener('seal-session-setting-changed', 同步设置)
  }, [])

  const workspaceTabs = useMemo<WorkspaceTab[]>(() => {
    const 文档标签 = new Map<string, WorkspaceTab>()
    for (const 文档 of documents) {
      const 类型 = 文档.type ?? 'word'
      const 路径 = 文档路径[文档.id] ?? null
      const 当前模型 = 类型 === 'table' ? 表格文档模型[文档.id] : 类型 === 'ppt' ? 演示文档模型[文档.id] : null
      const 模型有修改 = 类型 === 'ppt'
        ? !演示内容相同(演示文档模型[文档.id], 文档.已保存模型)
        : 类型 !== 'word' && (当前模型 === undefined || JSON.stringify(当前模型) !== 文档.已保存模型)
      文档标签.set(文档.id, {
        id: 文档.id,
        name: 文档.name,
        type: 类型,
        path: 路径,
        dirty: 路径 === null || (类型 === 'word'
          ? 文档.html !== 文档.已保存Html || !页面设置相同(文档.页面设置, 文档.已保存页面设置)
          : 模型有修改),
      })
    }
    for (const 文档 of pdfDocuments) {
      文档标签.set(文档.id, { id: 文档.id, name: 文档.name, type: 'pdf', path: 文档.path, dirty: false })
    }
    return workspaceOrder.flatMap((标识) => {
      const 标签 = 文档标签.get(标识)
      return 标签 ? [标签] : []
    })
  }, [documents, 文档路径, 表格文档模型, 演示文档模型, pdfDocuments, workspaceOrder])
  const workspaceTabsRef = useRef(workspaceTabs)
  workspaceTabsRef.current = workspaceTabs
  const activeWorkspaceTabId = module === 'home' ? 'home'
    : module === 'pdf' ? activePdfId
      : module === 'word' || module === 'table' || module === 'ppt' ? activeDocumentId : null

  const visibleDocs = useMemo(() => {
    const 关键词 = 搜索词.trim().toLowerCase()
    const 按词过滤 = 关键词 === '' ? docs : docs.filter((文档) => 文档.name.toLowerCase().includes(关键词))
    return sortDocs(filterDocs(按词过滤, navKey), sortKey)
  }, [docs, navKey, sortKey, 搜索词])

  /** 重新读取持久化的最近文档（首页刷新按钮） */
  const refreshRecents = () => {
    void 桥接.recentList().then((结果) => {
      if (!结果.成功 || !Array.isArray(结果.数据)) {
        set最近读取错误(结果.错误 || '最近文档读取失败')
        return
      }
      setDocs(转文档条目(结果.数据))
      set最近读取错误(null)
    }).catch((错误: unknown) => {
      set最近读取错误(错误 instanceof Error ? 错误.message : '最近文档读取失败')
    })
  }

  /** 把主进程的持久化记录转换为首页可渲染的文档条目 */
  const 转文档条目 = (记录: Array<{ 路径: string; 名称: string; 类型: string; 置顶?: boolean; 时间?: number }>) =>
    记录
      .filter((记录) => 记录.类型 === 'word' || 记录.类型 === 'table' || 记录.类型 === 'ppt' || 记录.类型 === 'pdf')
      .map((记录) => ({
        id: `recent-${记录.路径}`,
        name: 记录.名称,
        type: 记录.类型 as DocItem['type'],
        size: 0,
        updatedAt: 格式化时间(记录.时间),
        starred: 记录.置顶 === true,
        shared: false,
        路径: 记录.路径,
      }))

  // 挂载时读取持久化的最近文档；空记录展示空状态，不展示虚构文件
  useEffect(() => {
    if (初始最近文档 === undefined && 桥接.可用) refreshRecents()
    // 仅在挂载时加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 自动备份须在旧备份读取完成后才可写入，避免启动时的空状态清除恢复文件。
  const 备份计时 = useRef<number | null>(null)
  const [备份就绪, set备份就绪] = useState(false)
  const [启动恢复结束, set启动恢复结束] = useState(false)
  const 已提示备份错误 = useRef(false)
  const 备份操作链 = useRef<Promise<备份结果>>(Promise.resolve({ 成功: true }))
  const 最新备份状态 = useRef({
    保存工作状态, 备份就绪, documents, activeDocumentId, 文档路径,
    表格文档模型, 演示文档模型, pdfDocuments, activePdfId, module, workspaceOrder,
  })
  最新备份状态.current = {
    保存工作状态, 备份就绪, documents, activeDocumentId, 文档路径,
    表格文档模型, 演示文档模型, pdfDocuments, activePdfId, module, workspaceOrder,
  }

  const 创建当前备份任务 = (): 备份任务 => {
    const 状态 = 最新备份状态.current
    if (!桥接.可用) throw new Error('当前环境无法保存工作状态')
    if (!状态.备份就绪) throw new Error('工作状态恢复仍在进行中，请稍后重试')
    if (状态.保存工作状态 === null) throw new Error('无法读取工作状态设置，请检查本机设置后重试')
    if (!状态.保存工作状态 || (状态.documents.length === 0 && 状态.pdfDocuments.length === 0)) return { 操作: '清理' }
    return { 操作: '保存', 内容: JSON.stringify({
      documents: 状态.documents, activeDocumentId: 状态.activeDocumentId,
      文档路径: 状态.文档路径, 表格文档模型: 状态.表格文档模型,
      演示文档模型: 状态.演示文档模型,
      pdfDocuments: 状态.pdfDocuments.map(({ id, name, path, data }) => ({ id, name, path, ...(path === null ? { data } : {}) })),
      activePdfId: 状态.activePdfId, activeModule: 状态.module, workspaceOrder: 状态.workspaceOrder,
    }) }
  }

  const 排队执行备份 = (任务: 备份任务): Promise<备份结果> => {
    const 执行 = async (): Promise<备份结果> => {
      try {
        const 结果 = 任务.操作 === '清理' ? await 桥接.backupClear() : await 桥接.backupSave(任务.内容)
        return 结果.成功 ? { 成功: true } : { 成功: false, 错误: 结果.错误 || '无法保存工作状态' }
      } catch (错误) {
        return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法保存工作状态' }
      }
    }
    const 本次 = 备份操作链.current.then(执行, 执行)
    备份操作链.current = 本次
    return 本次
  }

  const 刷新工作状态备份 = async (): Promise<备份结果> => {
    if (备份计时.current !== null) {
      window.clearTimeout(备份计时.current)
      备份计时.current = null
    }
    try {
      for (let 次数 = 0; 次数 < 3; 次数 += 1) {
        const 任务 = 创建当前备份任务()
        const 结果 = await 排队执行备份(任务)
        if (!结果.成功) return 结果
        const 最新任务 = 创建当前备份任务()
        const 内容相同 = 任务.操作 === '清理'
          ? 最新任务.操作 === '清理'
          : 最新任务.操作 === '保存' && 任务.内容 === 最新任务.内容
        if (内容相同) {
          return { 成功: true }
        }
      }
      return { 成功: false, 错误: '工作状态在关闭检查期间持续变化，请停止编辑后重试' }
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法刷新工作状态备份' }
    }
  }

  useEffect(() => {
    if (!备份就绪 || 保存工作状态 !== true || !桥接.可用) return
    if (备份计时.current !== null) {
      window.clearTimeout(备份计时.current)
    }
    备份计时.current = window.setTimeout(() => {
      备份计时.current = null
      let 任务: 备份任务
      try { 任务 = 创建当前备份任务() }
      catch (错误) {
        弹窗.error({ title: '自动备份失败', content: 错误 instanceof Error ? 错误.message : '无法创建工作状态备份' })
        return
      }
      void 排队执行备份(任务).then((结果) => {
        if (结果.成功) {
          已提示备份错误.current = false
        } else if (!已提示备份错误.current) {
          已提示备份错误.current = true
          弹窗.error({ title: '自动备份失败', content: 结果.错误 || '无法保存编辑备份，请及时手动保存文件' })
        }
      })
    }, 1500)
    return () => {
      if (备份计时.current !== null) {
        window.clearTimeout(备份计时.current)
      }
    }
  }, [备份就绪, 保存工作状态, documents, activeDocumentId, 文档路径, 表格文档模型, 演示文档模型, pdfDocuments, activePdfId, module, workspaceOrder])

  useEffect(() => {
    if (!备份就绪 || 保存工作状态 !== false || !桥接.可用) return
    void 排队执行备份({ 操作: '清理' }).then((结果) => {
      if (!结果.成功) throw new Error(结果.错误 || '无法清除已保存的工作状态')
    }).catch((错误: unknown) => {
      弹窗.error({ title: '工作状态清理失败', content: 错误 instanceof Error ? 错误.message : '无法清除已保存的工作状态' })
    })
  }, [备份就绪, 保存工作状态])

  // 挂载时检测上次异常退出留下的备份并恢复，避免内容丢失
  const [备份恢复提示, set备份恢复提示] = useState<string | null>(null)
  useEffect(() => {
    let 有效 = true
    const 完成恢复 = () => {
      if (!有效) return
      set备份就绪(true)
      set启动恢复结束(true)
    }
    const 保留原始备份 = async (内容?: string): Promise<string> => {
      const 结果 = await 桥接.backupPreserve(内容)
      if (!结果.成功 || typeof 结果.路径 !== 'string' || 结果.路径.length === 0) {
        throw new Error(结果.错误 || '无法确认原始备份的保留位置')
      }
      return 结果.路径
    }
    if (!桥接.可用 || 保存工作状态 !== true) {
      完成恢复()
      return () => { 有效 = false }
    }
    const 恢复工作状态 = async () => {
      let 原始内容: string | undefined
      try {
        const 结果 = await 桥接.backupLoad()
        if (!有效) return
        if (!结果.成功) throw new Error(结果.错误 || '备份读取失败')
        if (结果.内容 === null || 结果.内容 === undefined) {
          完成恢复()
          return
        }
        原始内容 = 结果.内容
        const 数据 = JSON.parse(原始内容) as {
          documents?: EditorDocument[]
          activeDocumentId?: string | null
          文档路径?: Record<string, string | null>
          表格文档模型?: Record<string, Sheet[]>
          演示文档模型?: Record<string, 演示文稿>
          pdfDocuments?: Array<{ id: string; name: string; path: string | null; data?: string | null }>
          activePdfId?: string | null
          activeModule?: ModuleKey
          workspaceOrder?: string[]
        }
        if (typeof 数据 !== 'object' || 数据 === null || Array.isArray(数据) ||
          (数据.documents === undefined && 数据.pdfDocuments === undefined) ||
          (数据.documents !== undefined && !Array.isArray(数据.documents)) ||
          (数据.pdfDocuments !== undefined && !Array.isArray(数据.pdfDocuments))) {
          throw new Error('备份结构无效，已阻止加载不完整的编辑状态')
        }
        const 文字表格演示 = 数据.documents ?? []
        const PDF元数据 = 数据.pdfDocuments ?? []
        if (文字表格演示.length === 0 && PDF元数据.length === 0) {
          完成恢复()
          return
        }
        const 有效文档 = 文字表格演示.every((文档) =>
          typeof 文档?.id === 'string' && typeof 文档.name === 'string' && typeof 文档.html === 'string' &&
          (文档.type === 'word' || 文档.type === undefined ||
            (文档.type === 'table' && Array.isArray(数据.表格文档模型?.[文档.id]) && 数据.表格文档模型![文档.id].length > 0 && 数据.表格文档模型![文档.id].every(是工作表模型)) ||
            (文档.type === 'ppt' && Array.isArray(数据.演示文档模型?.[文档.id]?.幻灯片列表))))
        if (!有效文档) throw new Error('备份内容缺少表格或演示模型，已阻止加载不完整的编辑状态')
        const 已迁移演示: Record<string, 演示文稿> = {}
        for (const 文档 of 文字表格演示) {
          if (文档.type !== 'ppt') continue
          try {
            已迁移演示[文档.id] = 迁移演示文稿(数据.演示文档模型?.[文档.id])
            if (文档.已保存模型) 迁移演示文稿(JSON.parse(文档.已保存模型))
          } catch (错误) {
            throw new Error(`无法恢复「${文档.name}」：${错误 instanceof Error ? 错误.message : '演示模型无效'}`)
          }
        }
        const PDF读取结果 = await Promise.allSettled(PDF元数据.map(async (记录): Promise<PdfDocument> => {
          if (typeof 记录?.id !== 'string' || typeof 记录.name !== 'string' ||
              (记录.path !== null && typeof 记录.path !== 'string')) {
            throw new Error('PDF 标签记录格式无效')
          }
          if (记录.path === null) {
            if (typeof 记录.data === 'string') return { ...记录, data: 记录.data }
            if (记录.data === null && 记录.name === 'PDF 工具') return { ...记录, data: null }
            throw new Error(`无法恢复「${记录.name}」：备份缺少 PDF 文件内容`)
          }
          const 内容 = await 读取本地文件内容(记录.path)
          if (内容.类型 !== 'pdf' || typeof 内容.内容 !== 'string') throw new Error(`无法恢复「${记录.name}」`)
          return { ...记录, data: 内容.内容 }
        }))
        if (!有效) return
        const 有效PDF = PDF读取结果.flatMap((项) => 项.status === 'fulfilled' ? [项.value] : [])
        const 失败PDF = PDF读取结果.filter((项): 项 is PromiseRejectedResult => 项.status === 'rejected')
        if (失败PDF.length > 0) {
          const 保留路径 = await 保留原始备份(原始内容)
          if (!有效) return
          弹窗.warning({
            title: '部分 PDF 标签未恢复',
            content: `${失败PDF.map((项) => 项.reason instanceof Error ? 项.reason.message : '文件读取失败').join('；')}。原备份已保留在：${保留路径}`,
          })
        }
        const 当前标识 = 文字表格演示.some((文档) => 文档.id === 数据.activeDocumentId)
          ? 数据.activeDocumentId!
          : 文字表格演示[0]?.id ?? null
        const 当前文档 = 文字表格演示.find((文档) => 文档.id === 当前标识)
        // 旧版备份没有保存基线时，使用不可能成为正文的哨兵值，保守提示用户检查修改。
        setDocuments(文字表格演示.map((文档) => ({
          ...文档,
          已保存Html: typeof 文档.已保存Html === 'string' ? 文档.已保存Html : '\u0000',
        })))
        setActiveDocumentId(当前标识)
        setPdfDocuments(有效PDF)
        const 当前PDF = 有效PDF.find((文档) => 文档.id === 数据.activePdfId) ?? 有效PDF[0]
        setActivePdfId(当前PDF?.id ?? null)
        const 有效标识 = new Set([...文字表格演示.map((文档) => 文档.id), ...有效PDF.map((文档) => 文档.id)])
        const 恢复顺序 = Array.isArray(数据.workspaceOrder)
          ? 数据.workspaceOrder.filter((标识) => 有效标识.has(标识))
          : []
        setWorkspaceOrder([...恢复顺序, ...[...文字表格演示.map((文档) => 文档.id), ...有效PDF.map((文档) => 文档.id)].filter((标识) => !恢复顺序.includes(标识))])
        set文档路径状态(数据.文档路径 ?? {})
        set表格文档模型(数据.表格文档模型 ?? {})
        set演示文档模型(已迁移演示)
        const 恢复模块 = 数据.activeModule === 'home' ? 'home'
          : 数据.activeModule === 'pdf' && 当前PDF ? 'pdf'
            : 当前文档?.type ?? (当前PDF ? 'pdf' : 'home')
        setModule(恢复模块)
        setNavKey(恢复模块)
        setPDF待预览(恢复模块 === 'pdf' ? 预览PDF文档(当前PDF) : null)
        set备份恢复提示(`已恢复上次工作区的 ${文字表格演示.length + 有效PDF.length} 个标签`)
        完成恢复()
      } catch (错误) {
        if (!有效) return
        const 原因 = 错误 instanceof SyntaxError ? '备份文件格式无效，无法解析'
          : 错误 instanceof Error ? 错误.message : '无法读取编辑备份'
        弹窗.confirm({
          title: '工作状态恢复失败',
          content: `读取或校验上次工作区失败：${原因}。原备份尚未修改。可以重试恢复；若继续，原备份会移到独立文件，当前会话将新建备份。`,
          okText: '保留原备份并继续',
          cancelText: '重试恢复',
          onOk: async () => {
            try {
              const 保留路径 = await 保留原始备份(原始内容)
              if (!有效) return
              完成恢复()
              弹窗.info({ title: '原备份已保留', content: `原始备份已保留在：${保留路径}。当前会话可以继续编辑和自动备份。` })
            } catch (保留错误) {
              弹窗.error({ title: '保留原备份失败', content: `原备份未被覆盖，当前会话的自动备份仍已暂停。${保留错误 instanceof Error ? 保留错误.message : '请检查备份目录后重试'}` })
              throw 保留错误
            }
          },
          onCancel: () => { void 恢复工作状态() },
        })
      }
    }
    void 恢复工作状态()
    // 仅在挂载时恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { 有效 = false }
  }, [])

  const toggleStar = async (标识: string): Promise<void> => {
    const 文档 = docs.find((项) => 项.id === 标识)
    if (!文档) return
    const 新状态 = !文档.starred
    if (文档.路径 !== undefined) {
      try {
        const 结果 = await 桥接.recentAdd({ 路径: 文档.路径, 名称: 文档.name, 类型: 文档.type, 置顶: 新状态, 时间: Date.now() })
        if (!结果.成功) throw new Error(结果.错误 || '星标状态保存失败')
      } catch (错误) {
        弹窗.error({ title: '星标设置失败', content: 错误 instanceof Error ? 错误.message : '无法保存星标状态' })
        return
      }
    }
    setDocs((当前) => 当前.map((项) => 项.id === 标识 ? { ...项, starred: 新状态 } : 项))
  }

  /** 追加一个编辑器标签并设为当前文档。 */
  const 新建标签 = (名称: string, 类型: 'word' | 'table' | 'ppt', 初始Html = '<p><br></p>', 来源?: { 路径: string; 警告?: string[]; 文件指纹?: string }, 已保存模型?: string, 页面设置?: 文字页面设置) => {
    const 新文档: EditorDocument = {
      id: 生成文档标识(),
      name: 名称,
      html: 初始Html,
      已保存Html: 初始Html,
      已保存模型,
      页面设置,
      已保存页面设置: 页面设置,
      type: 类型,
      来源路径: 来源?.路径,
      文件指纹: 来源?.文件指纹,
      警告: 来源?.警告,
    }
    setDocuments((当前) => [...当前, 新文档])
    setWorkspaceOrder((当前) => [...当前, 新文档.id])
    setActiveDocumentId(新文档.id)
    if (来源 !== undefined) set文档路径状态((当前) => ({ ...当前, [新文档.id]: 来源.路径 }))
    return 新文档
  }

  const createDoc = (类型: DocItem['type'], 初始内容?: unknown, 来源?: { 路径?: string; 名称?: string; 警告?: string[]; 页面设置?: 文字页面设置; 文件指纹?: string }) => {
    const 来源路径 = typeof 来源?.路径 === 'string' && 来源.路径.trim() !== '' ? 来源.路径 : null
    if (来源路径 !== null && 类型 !== 'pdf') {
      const 已开文档 = documents.find((项) => 是同一路径(文档路径[项.id], 来源路径))
      if (已开文档) {
        setActiveDocumentId(已开文档.id)
        setModule(已开文档.type ?? 'word')
        setNavKey(已开文档.type ?? 'word')
        return
      }
    }
    if (类型 === 'pdf') {
      if (来源 !== undefined && typeof 初始内容 !== 'string') throw new Error('PDF 文件内容无效')
      const PDF名称 = 来源路径 !== null ? 基准文件名(来源路径) : 来源?.名称?.trim()
      if (来源 !== undefined && !PDF名称) throw new Error('PDF 文件名称无效')
      const 已开PDF = 来源路径 !== null
        ? pdfDocuments.find((项) => 是同一路径(项.path, 来源路径))
        : 来源 === undefined ? pdfDocuments.find((项) => 项.path === null && 项.data === null) : undefined
      if (已开PDF) {
        if (来源 !== undefined) {
          setPdfDocuments((当前) => 当前.map((项) => 项.id === 已开PDF.id
            ? { ...项, name: PDF名称!, data: 初始内容 as string } : 项))
        }
        setActivePdfId(已开PDF.id)
        setPDF待预览(来源 !== undefined ? 预览PDF文档({ ...已开PDF, name: PDF名称!, data: 初始内容 as string }) : null)
        setModule('pdf')
        setNavKey('pdf')
        return
      }
      const PDF文档: PdfDocument = {
        id: 生成文档标识(),
        name: PDF名称 ?? 'PDF 工具',
        path: 来源路径,
        data: 来源 ? 初始内容 as string : null,
      }
      setPdfDocuments((当前) => [...当前, PDF文档])
      setWorkspaceOrder((当前) => [...当前, PDF文档.id])
      setActivePdfId(PDF文档.id)
      setActiveDocId(null)
      setPDF待预览(预览PDF文档(PDF文档))
      setModule('pdf')
      setNavKey('pdf')
      return
    }
    const 目标模块 = DOC_TYPE_TO_MODULE[类型]
    const 指定名称 = 来源?.名称?.trim()
    if (来源 !== undefined && 来源路径 === null && !指定名称) throw new Error('文件路径无效，无法打开文档')
    if (目标模块 === 'word' && 来源 !== undefined && typeof 初始内容 !== 'string') {
      throw new Error('文字文档内容无效，文件未打开')
    }
    let 新表格: Sheet[] | null = null
    let 新演示: 演示文稿 | null = null
    if (目标模块 === 'table') {
      if (初始内容 === undefined || 初始内容 === null) {
        新表格 = [创建工作表('Sheet1')]
      } else if (Array.isArray(初始内容) && 初始内容.length > 0 && 初始内容.every(是工作表模型)) {
        新表格 = 初始内容 as Sheet[]
      } else {
        const 来源列表 = typeof 初始内容 === 'string'
          ? [{ 名称: 'Sheet1', html: 初始内容 }]
          : Array.isArray(初始内容) && 初始内容.length > 0 && 初始内容.every((项) => typeof 项?.名称 === 'string' && typeof 项?.html === 'string')
            ? 初始内容 as Array<{ 名称: string; html: string; 页面设置?: Sheet['页面设置']; 元数据?: Xlsx工作表元数据 }>
            : null
        if (来源列表 === null) throw new Error('表格内容格式无效，文件未打开')
        const 解析列表 = 来源列表.map((项) => 从Html表格构建工作表(项.html, 项.名称, 项.页面设置, 项.元数据))
        if (解析列表.some((项) => 项 === null)) throw new Error('工作表内容解析失败，文件未打开')
        新表格 = 解析列表 as Sheet[]
      }
    } else if (目标模块 === 'ppt') {
      if (初始内容 === undefined || 初始内容 === null) {
        新演示 = 创建演示文稿()
      } else if (typeof 初始内容 === 'object' && Array.isArray((初始内容 as 演示文稿).幻灯片列表)) {
        新演示 = 迁移演示文稿(初始内容)
      } else {
        throw new Error('演示文稿内容格式无效，文件未打开')
      }
    }
    setActiveDocId(null)
    setModule(目标模块)
    const 初始Html = 目标模块 === 'word' && typeof 初始内容 === 'string' ? 初始内容 : '<p><br></p>'
    const 已保存模型 = 来源 === undefined ? undefined
      : 新表格 !== null ? JSON.stringify(新表格)
        : 新演示 !== null ? JSON.stringify(新演示) : undefined
    const 有效来源 = 来源路径 !== null ? { 路径: 来源路径, 警告: 来源?.警告, 文件指纹: 来源?.文件指纹 } : undefined
    const 文档 = 新建标签(有效来源 ? 基准文件名(有效来源.路径) : 指定名称 || 模块默认文档名(目标模块), 目标模块 as 'word' | 'table' | 'ppt', 初始Html, 有效来源, 已保存模型, 目标模块 === 'word' ? 来源?.页面设置 : undefined)
    if (新表格 !== null) set表格文档模型((当前) => ({ ...当前, [文档.id]: 新表格 }))
    if (新演示 !== null) set演示文档模型((当前) => ({ ...当前, [文档.id]: 新演示 }))
  }

  const openDoc = async (文档: DocItem): Promise<void> => {
    if (!文档.路径) throw new Error('最近记录缺少文件路径，无法打开')
    const 路径 = 文档.路径
    const 已存在 = documents.find((项) => 是同一路径(文档路径[项.id], 路径))
    if (已存在 !== undefined) {
      if (已存在.type === 'table' && !表格文档模型[已存在.id]) throw new Error('表格编辑状态缺失，无法继续保存；请重新打开原文件')
      if (已存在.type === 'ppt' && !演示文档模型[已存在.id]) throw new Error('演示编辑状态缺失，无法继续保存；请重新打开原文件')
      setActiveDocumentId(已存在.id)
      setModule(已存在.type ?? DOC_TYPE_TO_MODULE[文档.type])
      await 记录最近文档(路径, 文档.name, 文档.type, 文档.starred)
      refreshRecents()
      return
    }
    const 内容 = await 读取本地文件内容(路径)
    createDoc(内容.类型, 内容.类型 === 'ppt' ? 内容.演示文稿 : 内容.类型 === 'table' ? (内容.工作表列表 ?? 内容.内容) : 内容.内容, { 路径, 警告: 内容.警告, 页面设置: 内容.页面设置, 文件指纹: 内容.文件指纹 })
    setActiveDocId(文档.id)
    await 记录最近文档(路径, 文档.name, 内容.类型, 文档.starred)
    refreshRecents()
  }

  const createEditorDoc = () => {
    const 目标模块: ModuleKey = module === 'home' ? 'word' : module
    if (目标模块 === 'word') 新建标签(模块默认文档名(目标模块), 'word')
    else if (目标模块 === 'table' || 目标模块 === 'ppt') createDoc(目标模块)
  }

  const updateEditorHtml = (标识: string, html: string) => {
    setDocuments((当前) => 当前.map((项) => (项.id === 标识 ? { ...项, html } : 项)))
  }

  const 更新文字页面设置 = (标识: string, 设置: 文字页面设置) => {
    setDocuments((当前) => 当前.map((项) => 项.id === 标识 && (项.type === 'word' || 项.type === undefined)
      ? { ...项, 页面设置: 设置 } : 项))
  }

  const markDocumentSaved = (标识: string, html: string, 模型快照?: string, 文字保存快照?: { 页面设置?: 文字页面设置 }) => {
    setDocuments((当前) => 当前.map((项) => {
      if (项.id !== 标识) return 项
      const 模型 = 项.type === 'table' ? 表格文档模型[标识] : 项.type === 'ppt' ? 演示文档模型[标识] : null
      return {
        ...项,
        已保存Html: html,
        页面设置: (项.type === 'word' || 项.type === undefined) && 文字保存快照 !== undefined && 项.页面设置 === undefined
          ? 文字保存快照.页面设置 : 项.页面设置,
        已保存页面设置: 项.type === 'word' || 项.type === undefined
          ? (文字保存快照 === undefined ? 项.页面设置 : 文字保存快照.页面设置)
          : 项.已保存页面设置,
        已保存模型: 项.type === 'word' || 项.type === undefined ? 项.已保存模型 : (模型快照 ?? JSON.stringify(模型)),
      }
    }))
  }

  const set文档路径 = (标识: string, 路径: string | null) => {
    set文档路径状态((当前) => ({ ...当前, [标识]: 路径 }))
    if (路径 !== null) {
      setDocuments((当前) => 当前.map((文档) => 文档.id === 标识 ? { ...文档, name: 基准文件名(路径) } : 文档))
    }
  }

  const 更新文件指纹 = (标识: string, 指纹: string) => {
    setDocuments((当前) => 当前.map((文档) => 文档.id === 标识 ? { ...文档, 文件指纹: 指纹 } : 文档))
  }

  const 查找保存路径占用 = (当前标识: string | null, 目标路径: string): WorkspaceTab | null =>
    workspaceTabsRef.current.find((标签) => 标签.id !== 当前标识 && 是同一路径(标签.path, 目标路径)) ?? null

  const 选择编辑文档 = (标识: string | null) => {
    if (标识 === null) {
      setActiveDocumentId(null)
      return
    }
    const 文档 = documents.find((项) => 项.id === 标识)
    if (!文档) throw new Error('找不到要切换的编辑文档')
    setActiveDocumentId(标识)
    setModule(文档.type ?? 'word')
  }

  const closeEditorDoc = (标识: string) => {
    const 原位置 = workspaceOrder.indexOf(标识)
    const 剩余顺序 = workspaceOrder.filter((项) => 项 !== 标识)
    const 下个标识 = 剩余顺序[Math.min(Math.max(原位置 - 1, 0), 剩余顺序.length - 1)]
    const 正在显示 = activeWorkspaceTabId === 标识
    const 剩余 = documents.filter((项) => 项.id !== 标识)
    setDocuments(剩余)
    setWorkspaceOrder(剩余顺序)
    set表格文档模型((当前) => { const 结果 = { ...当前 }; delete 结果[标识]; return 结果 })
    set演示文档模型((当前) => { const 结果 = { ...当前 }; delete 结果[标识]; return 结果 })
    set文档路径状态((当前) => { const 结果 = { ...当前 }; delete 结果[标识]; return 结果 })
    if (!正在显示) {
      if (activeDocumentId === 标识) setActiveDocumentId(剩余[剩余.length - 1]?.id ?? null)
      return
    }
    if (下个标识 === undefined) {
      setActiveDocumentId(null)
      setActiveDocId(null)
      setModule('home')
      return
    }
    selectWorkspaceTab(下个标识)
  }

  const selectWorkspaceTab = (标识: string) => {
    if (标识 === 'home') {
      goHome()
      return
    }
    const 文档 = documents.find((项) => 项.id === 标识)
    if (文档) {
      选择编辑文档(标识)
      setNavKey(文档.type ?? 'word')
      return
    }
    const PDF文档 = pdfDocuments.find((项) => 项.id === 标识)
    if (PDF文档) {
      setActivePdfId(标识)
      setPDF待预览(预览PDF文档(PDF文档))
      setModule('pdf')
      setNavKey('pdf')
      return
    }
    throw new Error('找不到要切换的工作区标签')
  }

  const closeWorkspaceTab = (标识: string) => {
    if (标识 === 'home') return
    if (documents.some((项) => 项.id === 标识)) {
      closeEditorDoc(标识)
      return
    }
    if (!pdfDocuments.some((项) => 项.id === 标识)) return
    const 原位置 = workspaceOrder.indexOf(标识)
    const 剩余顺序 = workspaceOrder.filter((项) => 项 !== 标识)
    const 下个标识 = 剩余顺序[Math.min(Math.max(原位置 - 1, 0), 剩余顺序.length - 1)]
    setPdfDocuments((当前) => 当前.filter((项) => 项.id !== 标识))
    setWorkspaceOrder(剩余顺序)
    if (activeWorkspaceTabId === 标识) {
      if (下个标识) selectWorkspaceTab(下个标识)
      else {
        setActivePdfId(null)
        setPDF待预览(null)
        goHome()
      }
    } else if (activePdfId === 标识) {
      setActivePdfId(null)
    }
  }

  const 更新表格文档模型 = (标识: string, 更新: React.SetStateAction<Sheet[]>) => {
    set表格文档模型((当前) => {
      const 原值 = 当前[标识]
      if (!原值) throw new Error('表格编辑状态缺失，已阻止覆盖文件')
      const 新值 = typeof 更新 === 'function' ? 更新(原值) : 更新
      const 错误 = 检查工作簿更新(原值, 新值)
      if (错误) {
        弹窗.warning({ title: '表格更新已阻止', content: 错误 })
        return 当前
      }
      return { ...当前, [标识]: 新值 }
    })
  }

  const 更新演示文档模型 = (标识: string, 更新: React.SetStateAction<演示文稿>) => {
    set演示文档模型((当前) => {
      const 原值 = 当前[标识]
      if (!原值) throw new Error('演示编辑状态缺失，已阻止覆盖文件')
      const 新值 = typeof 更新 === 'function' ? 更新(原值) : 更新
      try {
        return { ...当前, [标识]: 迁移演示文稿(新值) }
      } catch (错误) {
        弹窗.warning({ title: '演示修改已阻止', content: 错误 instanceof Error ? 错误.message : '演示模型无效' })
        return 当前
      }
    })
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

  const renameDoc = async (标识: string, 名称: string): Promise<void> => {
    const 规范名称 = 名称.trim()
    if (规范名称.length === 0) return
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (!目标) throw new Error('最近列表中找不到该文档')
    if (!目标.路径) throw new Error('此记录没有真实文件路径，无法重命名磁盘文件')
    const 旧路径 = 目标.路径
    const 关联文档 = documents.find((文档) => 是同一路径(文档路径[文档.id], 旧路径))
    if (关联文档 && !关联文档.文件指纹) {
      throw new Error('已打开文档缺少原文件版本信息，请重新打开文件后再重命名')
    }
    const 结果 = await 桥接.renameFile(旧路径, 规范名称, 关联文档?.文件指纹)
    if (!结果.成功 || !结果.路径 || !结果.名称) throw new Error(结果.错误 || '重命名文件失败')
    const 新路径 = 结果.路径
    const 新标识 = `recent-${新路径}`
    setDocs((当前) => 当前.map((文档) => 文档.id === 标识 ? {
      ...文档, id: 新标识, name: 结果.名称!, 路径: 新路径,
    } : 文档))
    setActiveDocId((当前) => 当前 === 标识 ? 新标识 : 当前)
    setDocuments((当前) => 当前.map((文档) => 是同一路径(文档路径[文档.id], 旧路径) ? {
      ...文档,
      name: 结果.名称!,
      来源路径: 是同一路径(文档.来源路径, 旧路径) ? 新路径 : 文档.来源路径,
      文件指纹: 结果.文件指纹,
    } : 文档))
    setPdfDocuments((当前) => 当前.map((文档) => 是同一路径(文档.path, 旧路径)
      ? { ...文档, name: 结果.名称!, path: 新路径 } : 文档))
    setPDF待预览((当前) => 当前 && 是同一路径(当前.路径, 旧路径)
      ? { ...当前, 名称: 结果.名称!, 路径: 新路径 } : 当前)
    set文档路径状态((当前) => Object.fromEntries(Object.entries(当前).map(([文档标识, 路径]) => [文档标识, 是同一路径(路径, 旧路径) ? 新路径 : 路径])))
  }

  const removeDoc = async (标识: string): Promise<void> => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) throw new Error('最近列表中找不到该文档')
    // 先确认持久化操作成功，再更新界面；此操作不会删除磁盘文件。
    if (目标.路径) {
      const 结果 = await 桥接.recentRemove(目标.路径)
      if (!结果.成功) throw new Error(结果.错误 || '无法移除最近文档记录')
    }
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
    if (键 !== 'pdf' && 键 !== 'settings' && 键 !== 'help') setModule('home')
  }

  const 值 = useMemo<AppState>(
    () => ({
      module,
      setModule,
      navKey,
      setNavKey,
      搜索词,
      set搜索词: set搜索词状态,
      refreshRecents,
      最近读取错误,
      清除最近读取错误: () => set最近读取错误(null),
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
      setActiveDocumentId: 选择编辑文档,
      updateEditorHtml,
      更新文字页面设置,
      markDocumentSaved,
      文档路径,
      set文档路径,
      更新文件指纹,
      查找保存路径占用,
      closeEditorDoc,
      workspaceTabs,
      activeWorkspaceTabId,
      selectWorkspaceTab,
      closeWorkspaceTab,
      createEditorDoc,
      备份恢复提示,
      启动恢复结束,
      刷新工作状态备份,
      清除备份提示: () => set备份恢复提示(null),
      表格文档模型,
      更新表格文档模型,
      演示文档模型,
      更新演示文档模型,
      PDF待预览,
      pdfDocuments,
      showSettings,
      showHelp,
      goHome,
    }),
    [module, navKey, viewMode, sortKey, docs, visibleDocs, activeDocId, documents, activeDocumentId, 文档路径, 表格文档模型, 演示文档模型, PDF待预览, 备份恢复提示, 启动恢复结束, 搜索词, 最近读取错误, workspaceTabs, activeWorkspaceTabId, pdfDocuments, workspaceOrder]
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
