// 应用状态层：集中承载当前模块、导航筛选、视图模式、排序方式、文档列表与编辑器文档。
// 采用 Context 而非全局变量，保证状态随组件树卸载而释放，便于测试隔离。
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from 'antd'
import {
  filterDocs,
  sortDocs,
  type DocItem,
  type SortKey,
} from './mock/recentDocs'
import { DOC_TYPE_TO_MODULE, NAV_GROUPS, NEW_DOC_NAMES, type ModuleKey } from './navConfig'
import { 桥接 } from './ipc/bridge'
import { 基准文件名, 记录最近文档, 读取本地文件内容 } from './fileOpen'
import { 创建工作表, type Sheet } from './sheet/model'
import { 从Html表格构建工作表 } from './sheet/sheetImport'
import { 创建演示文稿, type 演示文稿 } from './ppt/deck'

export type ViewMode = 'grid' | 'list'

/** 各编辑器文档的身份与文字内容；表格和演示模型按相同标识独立保存。 */
export interface EditorDocument {
  id: string
  name: string
  html: string
  /** 最近一次成功写盘的文字内容，跨页面切换及自动备份后仍可判断未保存修改。 */
  已保存Html: string
  type?: 'word' | 'table' | 'ppt'
  来源路径?: string
  警告?: string[]
}

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
  createDoc: (类型: DocItem['type'], 初始内容?: unknown, 来源?: { 路径: string; 警告?: string[] }) => void
  表格文档模型: Record<string, Sheet[]>
  更新表格文档模型: (标识: string, 更新: React.SetStateAction<Sheet[]>) => void
  演示文档模型: Record<string, 演示文稿>
  更新演示文档模型: (标识: string, 更新: React.SetStateAction<演示文稿>) => void
  PDF待预览: { 路径: string; 名称: string; 数据: string } | null
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
  markDocumentSaved: (标识: string, html: string) => void
  文档路径: Record<string, string | null>
  set文档路径: (标识: string, 路径: string | null) => void
  closeEditorDoc: (标识: string) => void
  /** 在当前模块下新建一个编辑器标签 */
  createEditorDoc: () => void
  /** 自动备份恢复的提示文案；为 null 表示无提示 */
  备份恢复提示: string | null
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

function 是工作表模型(值: unknown): 值 is Sheet {
  if (typeof 值 !== 'object' || 值 === null) return false
  const 表 = 值 as Partial<Sheet>
  return typeof 表.id === 'string' && typeof 表.name === 'string' &&
    typeof 表.单元格 === 'object' && 表.单元格 !== null &&
    Number.isInteger(表.行数) && Number.isInteger(表.列数) &&
    Array.isArray(表.列宽) && Array.isArray(表.行高) && Array.isArray(表.合并区域)
}

export function AppProvider({ children, 初始最近文档 }: { children: React.ReactNode; 初始最近文档?: DocItem[] }) {
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
  const 已提示备份错误 = useRef(false)
  useEffect(() => {
    if (!备份就绪 || !桥接.可用) return
    if (备份计时.current !== null) {
      window.clearTimeout(备份计时.current)
    }
    备份计时.current = window.setTimeout(() => {
      备份计时.current = null
      const 操作 = documents.length === 0
        ? 桥接.backupClear()
        : 桥接.backupSave(JSON.stringify({ documents, activeDocumentId, 文档路径, 表格文档模型, 演示文档模型 }))
      void 操作.then((结果) => {
        if (结果.成功) {
          已提示备份错误.current = false
        } else if (!已提示备份错误.current) {
          已提示备份错误.current = true
          Modal.error({ title: '自动备份失败', content: 结果.错误 || '无法保存编辑备份，请及时手动保存文件' })
        }
      }).catch((错误: unknown) => {
        if (已提示备份错误.current) return
        已提示备份错误.current = true
        Modal.error({ title: '自动备份失败', content: 错误 instanceof Error ? 错误.message : '无法保存编辑备份，请及时手动保存文件' })
      })
    }, 1500)
    return () => {
      if (备份计时.current !== null) {
        window.clearTimeout(备份计时.current)
      }
    }
  }, [备份就绪, documents, activeDocumentId, 文档路径, 表格文档模型, 演示文档模型])

  // 挂载时检测上次异常退出留下的备份并恢复，避免内容丢失
  const [备份恢复提示, set备份恢复提示] = useState<string | null>(null)
  useEffect(() => {
    if (!桥接.可用) {
      set备份就绪(true)
      return
    }
    void 桥接.backupLoad().then((结果) => {
      if (!结果.成功) throw new Error(结果.错误 || '备份读取失败')
      if (!结果.内容) {
        set备份就绪(true)
        return
      }
      const 数据 = JSON.parse(结果.内容) as {
        documents?: EditorDocument[]
        activeDocumentId?: string | null
        文档路径?: Record<string, string | null>
        表格文档模型?: Record<string, Sheet[]>
        演示文档模型?: Record<string, 演示文稿>
      }
      if (!Array.isArray(数据.documents) || 数据.documents.length === 0) {
        set备份就绪(true)
        return
      }
      const 有效文档 = 数据.documents.every((文档) =>
        typeof 文档?.id === 'string' && typeof 文档.name === 'string' && typeof 文档.html === 'string' &&
        (文档.type === 'word' || 文档.type === undefined ||
          (文档.type === 'table' && Array.isArray(数据.表格文档模型?.[文档.id]) && 数据.表格文档模型![文档.id].length > 0 && 数据.表格文档模型![文档.id].every(是工作表模型)) ||
          (文档.type === 'ppt' && Array.isArray(数据.演示文档模型?.[文档.id]?.幻灯片列表) && 数据.演示文档模型![文档.id].幻灯片列表.length > 0)))
      if (!有效文档) throw new Error('备份内容缺少表格或演示模型，已阻止加载不完整的编辑状态')
      const 当前标识 = 数据.documents.some((文档) => 文档.id === 数据.activeDocumentId)
        ? 数据.activeDocumentId!
        : 数据.documents[0].id
      const 当前文档 = 数据.documents.find((文档) => 文档.id === 当前标识)!
      // 旧版备份没有保存基线时，使用不可能成为正文的哨兵值，保守提示用户检查修改。
      setDocuments(数据.documents.map((文档) => ({
        ...文档,
        已保存Html: typeof 文档.已保存Html === 'string' ? 文档.已保存Html : '\u0000',
      })))
      setActiveDocumentId(当前标识)
      set文档路径状态(数据.文档路径 ?? {})
      set表格文档模型(数据.表格文档模型 ?? {})
      set演示文档模型(数据.演示文档模型 ?? {})
      setModule(当前文档.type ?? 'word')
      setNavKey(当前文档.type ?? 'word')
      set备份恢复提示(`已自动恢复上次未保存的 ${数据.documents.length} 个文档`)
      set备份就绪(true)
    }).catch((错误: unknown) => {
      Modal.error({ title: '自动备份读取失败', content: 错误 instanceof Error ? 错误.message : '无法读取编辑备份，备份文件已保留' })
    })
    // 仅在挂载时恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        Modal.error({ title: '星标设置失败', content: 错误 instanceof Error ? 错误.message : '无法保存星标状态' })
        return
      }
    }
    setDocs((当前) => 当前.map((项) => 项.id === 标识 ? { ...项, starred: 新状态 } : 项))
  }

  /** 追加一个编辑器标签并设为当前文档。 */
  const 新建标签 = (名称: string, 类型: 'word' | 'table' | 'ppt', 初始Html = '<p><br></p>', 来源?: { 路径: string; 警告?: string[] }) => {
    const 新文档: EditorDocument = {
      id: 生成文档标识(),
      name: 名称,
      html: 初始Html,
      已保存Html: 初始Html,
      type: 类型,
      来源路径: 来源?.路径,
      警告: 来源?.警告,
    }
    setDocuments((当前) => [...当前, 新文档])
    setActiveDocumentId(新文档.id)
    if (来源 !== undefined) set文档路径状态((当前) => ({ ...当前, [新文档.id]: 来源.路径 }))
    return 新文档
  }

  const createDoc = (类型: DocItem['type'], 初始内容?: unknown, 来源?: { 路径: string; 警告?: string[] }) => {
    if (类型 === 'pdf') {
      if (来源 !== undefined && typeof 初始内容 !== 'string') throw new Error('PDF 文件内容无效')
      setActiveDocId(null)
      setPDF待预览(来源 !== undefined ? { 路径: 来源.路径, 名称: 基准文件名(来源.路径), 数据: 初始内容 as string } : null)
      setModule('pdf')
      setNavKey('pdf')
      return
    }
    const 目标模块 = DOC_TYPE_TO_MODULE[类型]
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
            ? 初始内容 as Array<{ 名称: string; html: string }>
            : null
        if (来源列表 === null) throw new Error('表格内容格式无效，文件未打开')
        const 解析列表 = 来源列表.map((项) => 从Html表格构建工作表(项.html, 项.名称))
        if (解析列表.some((项) => 项 === null)) throw new Error('工作表内容解析失败，文件未打开')
        新表格 = 解析列表 as Sheet[]
      }
    } else if (目标模块 === 'ppt') {
      if (初始内容 === undefined || 初始内容 === null) {
        新演示 = 创建演示文稿()
      } else if (typeof 初始内容 === 'object' && Array.isArray((初始内容 as 演示文稿).幻灯片列表) && (初始内容 as 演示文稿).幻灯片列表.length > 0) {
        新演示 = 初始内容 as 演示文稿
      } else {
        throw new Error('演示文稿内容格式无效，文件未打开')
      }
    }
    setActiveDocId(null)
    setModule(目标模块)
    const 初始Html = 目标模块 === 'word' && typeof 初始内容 === 'string' ? 初始内容 : '<p><br></p>'
    const 文档 = 新建标签(来源 !== undefined ? 基准文件名(来源.路径) : 模块默认文档名(目标模块), 目标模块 as 'word' | 'table' | 'ppt', 初始Html, 来源)
    if (新表格 !== null) set表格文档模型((当前) => ({ ...当前, [文档.id]: 新表格 }))
    if (新演示 !== null) set演示文档模型((当前) => ({ ...当前, [文档.id]: 新演示 }))
  }

  const openDoc = async (文档: DocItem): Promise<void> => {
    if (!文档.路径) throw new Error('最近记录缺少文件路径，无法打开')
    const 路径 = 文档.路径
    const 已存在 = documents.find((项) => 文档路径[项.id] === 路径)
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
    createDoc(内容.类型, 内容.类型 === 'ppt' ? 内容.演示文稿 : 内容.类型 === 'table' ? (内容.工作表列表 ?? 内容.内容) : 内容.内容, { 路径, 警告: 内容.警告 })
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

  const markDocumentSaved = (标识: string, html: string) => {
    setDocuments((当前) => 当前.map((项) => (项.id === 标识 ? { ...项, 已保存Html: html } : 项)))
  }

  const set文档路径 = (标识: string, 路径: string | null) => {
    set文档路径状态((当前) => ({ ...当前, [标识]: 路径 }))
  }

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
    const 剩余 = documents.filter((项) => 项.id !== 标识)
    setDocuments(剩余)
    set表格文档模型((当前) => { const 结果 = { ...当前 }; delete 结果[标识]; return 结果 })
    set演示文档模型((当前) => { const 结果 = { ...当前 }; delete 结果[标识]; return 结果 })
    set文档路径状态((当前) => { const 结果 = { ...当前 }; delete 结果[标识]; return 结果 })
    if (剩余.length === 0) {
      setActiveDocumentId(null)
      setActiveDocId(null)
      setModule('home')
      return
    }
    if (activeDocumentId === 标识) {
      const 下一个 = 剩余[剩余.length - 1]
      setActiveDocumentId(下一个.id)
      setModule(下一个.type ?? 'word')
    }
  }

  const 更新表格文档模型 = (标识: string, 更新: React.SetStateAction<Sheet[]>) => {
    set表格文档模型((当前) => {
      const 原值 = 当前[标识]
      if (!原值) throw new Error('表格编辑状态缺失，已阻止覆盖文件')
      return { ...当前, [标识]: typeof 更新 === 'function' ? 更新(原值) : 更新 }
    })
  }

  const 更新演示文档模型 = (标识: string, 更新: React.SetStateAction<演示文稿>) => {
    set演示文档模型((当前) => {
      const 原值 = 当前[标识]
      if (!原值) throw new Error('演示编辑状态缺失，已阻止覆盖文件')
      return { ...当前, [标识]: typeof 更新 === 'function' ? 更新(原值) : 更新 }
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
    const 结果 = await 桥接.renameFile(旧路径, 规范名称)
    if (!结果.成功 || !结果.路径 || !结果.名称) throw new Error(结果.错误 || '重命名文件失败')
    const 新路径 = 结果.路径
    const 新标识 = `recent-${新路径}`
    setDocs((当前) => 当前.map((文档) => 文档.id === 标识 ? {
      ...文档, id: 新标识, name: 结果.名称!, 路径: 新路径,
    } : 文档))
    setActiveDocId((当前) => 当前 === 标识 ? 新标识 : 当前)
    setDocuments((当前) => 当前.map((文档) => 文档路径[文档.id] === 旧路径 ? {
      ...文档,
      name: 结果.名称!,
      来源路径: 文档.来源路径 === 旧路径 ? 新路径 : 文档.来源路径,
    } : 文档))
    set文档路径状态((当前) => Object.fromEntries(Object.entries(当前).map(([文档标识, 路径]) => [文档标识, 路径 === 旧路径 ? 新路径 : 路径])))
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
      markDocumentSaved,
      文档路径,
      set文档路径,
      closeEditorDoc,
      createEditorDoc,
      备份恢复提示,
      清除备份提示: () => set备份恢复提示(null),
      表格文档模型,
      更新表格文档模型,
      演示文档模型,
      更新演示文档模型,
      PDF待预览,
      showSettings,
      showHelp,
      goHome,
    }),
    [module, navKey, viewMode, sortKey, docs, visibleDocs, activeDocId, documents, activeDocumentId, 文档路径, 表格文档模型, 演示文档模型, PDF待预览, 备份恢复提示, 搜索词, 最近读取错误]
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
