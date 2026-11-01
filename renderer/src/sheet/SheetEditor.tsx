// 表格编辑器容器：装配 Ribbon、名称框与公式栏、网格、工作表标签与状态栏。
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { 单文档草稿结果 } from '../editor/draftLifecycle'
import { App as AntdApp } from 'antd'
import { HistoryStack } from '../editor/history'
import { 桥接 } from '../ipc/bridge'
import RibbonTabs from '../editor/ribbon/RibbonTabs'
import RibbonPanel from '../editor/ribbon/RibbonPanel'
import { 表格标签 } from './ribbonSpecs'
import { 查找表格命令, type 表格命令上下文, type 选区范围 } from './sheetCommands'
import {
  创建工作表,
  读取单元格,
  写入单元格,
  重算工作簿,
  设置列宽,
  设置批注,
  设置数据验证,
  检查工作表更新,
  清空单元格,
  添加图片,
  删除图片,
  默认列宽,
  type Sheet,
  type 单元格数据验证,
} from './model'
import { 生成地址, 生成区域地址, 展开区域, 解析地址, type 单元格位置 } from './address'
import { 统计选区 } from './selectionStats'
import { 导出为Csv, 导出为Html表格, 导出为Xlsx, 生成表格文件名 } from './sheetExport'
import { 表格文本输出, 单表数据输出 } from './sheetSave'
import { 可保存扩展, 原生文档类型 } from '../fileFormats'
import { 写出办公文档 } from '../office/writeDocument'
import { 下载文本 } from '../editor/exportDoc'
import GridView from './GridView'
import { 构建表格浮窗按钮, 构建表格颜色菜单组, 构建表格数据菜单组, 处理表格颜色命令, 处理表格AI命令 } from './sheetFloatActions'
import SelectionFloatPanel, { 从元素计算浮窗位置 } from '../components/SelectionFloatPanel'
import SheetPagePreview from './SheetPagePreview'
import SheetValidationForm, { 创建验证草稿, type 验证草稿 } from './SheetValidationForm'
import { 应用工作表拼写建议, 扫描工作表拼写 } from './sheetSpell'
import SheetToolbar from './SheetToolbar'
import { SheetStatusBar, SheetTabs } from './SheetChrome'
import ContextMenu from '../components/ContextMenu'
import { 读取可见矩形 } from '../components/overlayPlacement'
import PrintPreview from '../components/PrintPreview'
import type { 菜单节点 } from '../components/ContextMenu'
import { useAppStore } from '../store'
import { 准备打开本地文件, 记录最近文档 } from '../fileOpen'
import { 默认文件缩放, 放大一档, 缩小一档, use滚轮缩放, 表格缩放范围 } from '../editor/wheelZoom'
import { 读取本机图片 } from './sheetImageFile'
import SheetChartDialog from './SheetChartDialog'
import { dispatchShortcut } from '../shortcuts/shortcuts'
import { executeSheetNavigation } from '../shortcuts/sheetNavigation'
import { withShortcutLabels } from '../shortcuts/shortcutMenu'
import { useRealtimeDocument } from '../collaboration/useRealtimeDocument'
import { 提取协作工作簿, 校验协作工作簿 } from './sheetRealtimeSource'
import './sheetFeatures.css'

/** 取路径中的文件名，供最近文档记录使用 */
const 基准名 = (路径: string): string => {
  const 规整 = 路径.split('\\').join('/')
  const 部件 = 规整.split('/').filter((项) => 项.length > 0)
  return 部件.length > 0 ? 部件[部件.length - 1] : 路径
}

const 规范表格路径 = (路径: string): string => /\.[^\\/.]+$/.test(路径) ? 路径 : `${路径}.slxls`
const 是同一路径 = (左: string, 右: string): boolean =>
  左.replace(/\\/g, '/').toLowerCase() === 右.replace(/\\/g, '/').toLowerCase()

const SheetEditor = () => {
  const { message, modal } = AntdApp.useApp()
  const 提示文件错误 = (标题: string, 内容: string) => modal.error({ title: 标题, content: 内容 })
  const {
    documents, 表格文档模型, 更新表格文档模型, createDoc,
    markDocumentSaved, activeDocumentId,
    文档路径: 已知文档路径, set文档路径: 设置全局文档路径,
    查找保存路径占用, 更新文件指纹,
    注册编辑草稿, 通知编辑草稿变化,
  } = useAppStore()
  const 当前文档 = documents.find((项) => 项.id === activeDocumentId)
  const 已提示导入警告 = useRef<Set<string>>(new Set())
  const 保真风险 = 当前文档?.来源路径 && 当前文档.警告?.length
    ? { 来源路径: 当前文档.来源路径, 警告: 当前文档.警告 }
    : null
  const [独立工作表列表, set独立工作表列表] = useState<Sheet[]>(() => [创建工作表('Sheet1')])
  const 工作表列表 = activeDocumentId === null ? 独立工作表列表 : 表格文档模型[activeDocumentId]
  if (!工作表列表 || 工作表列表.length === 0) throw new Error('表格编辑状态缺失，已阻止覆盖文件')
  const 最新工作簿 = useRef(工作表列表)
  最新工作簿.current = 工作表列表
  const 应用工作簿 = (更新: Sheet[]) => {
    const 下一个 = 重算工作簿(更新)
    最新工作簿.current = 下一个
    if (activeDocumentId === null) set独立工作表列表(下一个)
    else 更新表格文档模型(activeDocumentId, 下一个)
  }
  const 远端接收 = useRef<(value: Sheet[]) => void>(() => {})
  const 实时协作 = useRealtimeDocument({ documentId: activeDocumentId, type: 'table', model: 提取协作工作簿(工作表列表), onRemote: value => 远端接收.current(value), validate: 校验协作工作簿 })
  const set工作表列表: React.Dispatch<React.SetStateAction<Sheet[]>> = (更新) => {
    if (实时协作.readOnly) { message.warning('当前共享文档为只读，可另存本机副本'); return }
    const 当前 = 最新工作簿.current, 基线 = typeof 更新 === 'function' ? 当前 : 工作表列表, 下一个 = typeof 更新 === 'function' ? 更新(当前) : 更新
    if (实时协作.active) {
      void 实时协作.publish(提取协作工作簿(下一个), 提取协作工作簿(基线)).catch(实时协作.reportError)
      应用工作簿(实时协作.getSnapshot())
    } else 应用工作簿(下一个)
  }
  const [当前索引, set当前索引] = useState(0)
  const 有效当前索引 = Math.min(Math.max(当前索引, 0), 工作表列表.length - 1)
  const [选区, set选区] = useState<选区范围>({
    起点: { 行: 0, 列: 0 },
    终点: { 行: 0, 列: 0 },
  })
  const [编辑地址, set编辑地址] = useState<string | null>(null)
  const [编辑值, set编辑值] = useState('')
  const [草稿重置版本, set草稿重置版本] = useState(0)
  const 草稿 = useRef<{ address: string; sheetId: string; base: Sheet[]; value: string; composing: boolean; release: () => void } | null>(null)
  const 公式草稿 = useRef<{ address: string; value: string; composing: boolean } | null>(null)
  const 结束草稿 = () => { const 有草稿 = 草稿.current !== null || 公式草稿.current !== null; 草稿.current?.release(); 草稿.current = null; 公式草稿.current = null; if (有草稿) 通知编辑草稿变化() }
  useEffect(() => () => { 草稿.current?.release() }, [activeDocumentId])
  远端接收.current = value => {
    应用工作簿(value)
    const draft = 草稿.current
    if (draft && !draft.composing) {
      const merged = value.find(sheet => sheet.id === draft.sheetId)?.单元格[draft.address]?.原始值 ?? ''
      // Published drafts already belong to the CRDT. Preserve a validation-failing
      // local draft, otherwise show merged text instead of erasing remote input.
      if (draft.value === draft.base.find(sheet => sheet.id === draft.sheetId)?.单元格[draft.address]?.原始值) {
        draft.release(); draft.base = 提取协作工作簿(value); draft.release = 实时协作.retainBaseline(draft.base); draft.value = merged
        if (公式草稿.current) 公式草稿.current.value = merged
        else set编辑值(merged)
      }
    }
  }
  const [当前标签, set当前标签] = useState('start')
  const [图表打开, set图表打开] = useState(false)
  useEffect(() => set图表打开(false), [activeDocumentId, 当前索引])
  const [打印预览, set打印预览] = useState<{ 内容: string; 标题: string } | null>(null)
  const 视图工作表 = 工作表列表[有效当前索引]
  const 视图键 = `${activeDocumentId ?? '独立'}:${视图工作表.id}`
  const [只读视图, set只读视图] = useState<Record<string, NonNullable<Sheet['视图']>>>({})
  const 来源视图 = 实时协作.readOnly ? 只读视图[视图键] ?? 视图工作表.视图 : 视图工作表.视图
  const 缩放 = 来源视图?.缩放 !== undefined && Number.isFinite(来源视图.缩放) && 来源视图.缩放 > 0 ? 来源视图.缩放 / 100 : 默认文件缩放
  const 更新当前视图 = (更新: NonNullable<Sheet['视图']>) => {
    if (实时协作.readOnly) {
      set只读视图(当前 => ({ ...当前, [视图键]: { ...来源视图, ...更新 } }))
      return
    }
    set工作表列表(当前 => 当前.map(项 => 项.id === 视图工作表.id ? { ...项, 视图: { ...项.视图, ...更新 } } : 项))
  }
  const set缩放: React.Dispatch<React.SetStateAction<number>> = 更新 => {
    const 目标 = typeof 更新 === 'function' ? 更新(缩放) : 更新
    if (Number.isFinite(目标) && 目标 > 0 && 目标 !== 缩放) 更新当前视图({ 缩放: 目标 * 100 })
  }
  const [当前视图, set当前视图] = useState<'普通' | '页面布局'>('普通')
  const 显示网格线 = 来源视图?.显示网格线 ?? true
  const set显示网格线 = (显示: boolean) => 更新当前视图({ 显示网格线: 显示 })
  const [拆分映射, set拆分映射] = useState<Record<string, boolean>>({})
  const [活动窗格, set活动窗格] = useState(0)
  const 图片输入引用 = useRef<HTMLInputElement>(null)
  const [文档路径, set文档路径] = useState<string | null>(() => 已知文档路径[activeDocumentId ?? ''] ?? null)

  // Ctrl+滚轮缩放工作表内容，与状态栏缩放按钮共用同一状态
  use滚轮缩放(缩放, set缩放, 表格缩放范围)

  useEffect(() => {
    set文档路径(已知文档路径[activeDocumentId ?? ''] ?? null)
  }, [activeDocumentId, 已知文档路径])

  const 记录当前路径 = (路径: string, 文件指纹?: string, 保存快照 = 工作表列表) => {
    set文档路径(路径)
    if (activeDocumentId !== null) {
      设置全局文档路径(activeDocumentId, 路径)
      if (文件指纹) 更新文件指纹(activeDocumentId, 文件指纹)
      markDocumentSaved(activeDocumentId, '', JSON.stringify(保存快照))
    }
  }
  const 风险内容 = (警告: string[], 说明: string) => React.createElement('div', null,
    React.createElement('p', null, 说明),
    React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
  )
  const 提示禁止覆盖 = (警告: string[]) => modal.warning({
    title: '已阻止覆盖来源文件',
    content: 风险内容(警告, '当前版本无法完整保留此表格的内容。请通过另存为保存到不同路径。'),
    okText: '我知道了',
  })
  const 路径被其他标签占用 = (路径: string): boolean => {
    const 标签 = 查找保存路径占用(activeDocumentId, 路径)
    if (标签 === null) return false
    modal.warning({
      title: '保存路径已被其他标签占用',
      content: `“${标签.name}”标签正在使用该路径。请切换到该标签保存，或选择其他路径。`,
      okText: '我知道了',
    })
    return true
  }
  const 导出路径已打开 = (路径: string): boolean => {
    const 标签 = 查找保存路径占用(null, 路径)
    if (标签 === null) return false
    modal.warning({
      title: '导出路径已被打开的标签占用',
      content: `“${标签.name}”标签正在使用该路径。请选择其他位置导出；如需更新此文件，请使用保存命令。`,
      okText: '我知道了',
    })
    return true
  }
  const 确认保存副本 = (警告: string[]): Promise<boolean> => new Promise((完成) => {
    modal.confirm({
      title: '确认保存副本',
      content: 风险内容(警告, '部分内容未完整导入，保存的副本可能缺少以下内容：'),
      okText: '保存副本',
      cancelText: '取消',
      onOk: () => 完成(true),
      onCancel: () => 完成(false),
    })
  })
  useEffect(() => {
    if (当前文档?.警告?.length && !原生文档类型(当前文档.来源路径 ?? '') && !已提示导入警告.current.has(当前文档.id)) {
      已提示导入警告.current.add(当前文档.id)
      modal.warning({
        title: '表格内容可能未完整导入',
        content: 风险内容(当前文档.警告, '本文件的部分内容无法完整导入。为保护原文件，请通过另存为保存副本。'),
        okText: '我知道了',
      })
    }
  }, [当前文档?.id, 当前文档?.警告])
  /** 右键菜单状态 */
  const [菜单可见, set菜单可见] = useState(false)
  const [菜单坐标, set菜单坐标] = useState({ x: 0, y: 0 })
  /** 查找栏状态（Ctrl+F） */
  const [查找可见, set查找可见] = useState(false)
  const [查找词, set查找词] = useState('')

  /** 关闭右键菜单 */
  const 关闭菜单 = (): void => {    set菜单可见(false)
  }

  /** 选区浮窗与右键菜单定位用的网格容器 */
  const 编辑区引用 = useRef<HTMLDivElement | null>(null)

  /** 构建表格编辑器的右键菜单项 */
  const 构建表格菜单 = (): 菜单节点[] => [
    { type: 'item', commandId: 'clipboard.paste', label: '粘贴', shortcut: 'Ctrl+V' },
    { type: 'item', commandId: 'clipboard.cut', label: '剪切', shortcut: 'Ctrl+X' },
    { type: 'item', commandId: 'clipboard.copy', label: '复制', shortcut: 'Ctrl+C' },
    { type: 'divider' },
    { type: 'group', 标题: '单元格', 子项: [
      { type: 'item', commandId: 'cell.insert', label: '插入...' },
      { type: 'item', commandId: 'cell.delete', label: '删除...' },
      { type: 'item', commandId: 'cell.format', label: '设置单元格格式' },
      { type: 'item', commandId: 'review.comment', label: '批注' },
    ]},
    { type: 'divider' },
    { type: 'group', 标题: '行与列', 子项: [
      { type: 'item', commandId: 'row.insert', label: '插入行' },
      { type: 'item', commandId: 'row.delete', label: '删除行' },
      { type: 'item', commandId: 'col.insert', label: '插入列' },
      { type: 'item', commandId: 'col.delete', label: '删除列' },
    ]},
    { type: 'divider' },
    { type: 'group', 标题: '编辑', 子项: [
      { type: 'item', commandId: 'edit.find', label: '查找', shortcut: 'Ctrl+F' },
      { type: 'item', commandId: 'edit.selectAll', label: '全选', shortcut: 'Ctrl+A' },
      { type: 'divider' },
      { type: 'item', commandId: 'edit.undo', label: '撤销', shortcut: 'Ctrl+Z' },
      { type: 'item', commandId: 'edit.redo', label: '重做', shortcut: 'Ctrl+Y' },
    ]},
    { type: 'divider' },
    { type: 'item', commandId: 'view.gridlines', label: 显示网格线 ? '隐藏网格线' : '显示网格线' },
    { type: 'divider' },
    ...构建表格颜色菜单组(),
    { type: 'divider' },
    ...构建表格数据菜单组(),
  ]
  const 历史 = useMemo(() => new HistoryStack<Sheet[]>(), [activeDocumentId])
  /** 列宽拖动状态；拖动过程中不逐帧记录历史，只在开始时记录一次 */
  const 列宽拖动 = useRef<{ 列: number; 起始横坐标: number; 原宽: number } | null>(null)

  // 列宽拖动：监听文档级鼠标移动与松开，避免鼠标移出网格后卡住
  useEffect(() => {
    列宽拖动.current = null
    const 处理移动 = (事件: MouseEvent) => {
      const 状态 = 列宽拖动.current
      if (状态 === null) {
        return
      }
      const 新宽 = Math.max(40, 状态.原宽 + (事件.clientX - 状态.起始横坐标))
      set工作表列表((当前) =>
        当前.map((项, 下标) => (下标 === 有效当前索引 ? 设置列宽(项, 状态.列, 新宽) : 项))
      )
    }
    const 处理松开 = () => {
      列宽拖动.current = null
    }
    document.addEventListener('mousemove', 处理移动)
    document.addEventListener('mouseup', 处理松开)
    return () => {
      document.removeEventListener('mousemove', 处理移动)
      document.removeEventListener('mouseup', 处理松开)
    }
  }, [有效当前索引, activeDocumentId])

  // 记录初始状态，否则最新状态永远不在栈中，重做将无处可去
  useEffect(() => {
    历史.record(工作表列表)
    set当前索引(0)
    set选区({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } })
    set编辑地址(null)
    set编辑值('')
    结束草稿()
    set查找可见(false)
    // 新建历史栈或切换文档时记录该文档的初始状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [历史])

  // 状态层可由智能助手等外部入口更新，补入撤销栈；编辑器内部已记录的引用不会重复入栈。
  useEffect(() => {
    if (!实时协作.active && 历史.current() !== 工作表列表) 历史.record(工作表列表)
  }, [历史, 工作表列表, 实时协作.active])

  const 工作表 = 工作表列表[有效当前索引]
  const 开始草稿 = (address: string) => {
    const old = 草稿.current
    if (old?.address === address && old.sheetId === 工作表.id) return old
    结束草稿()
    const base = 提取协作工作簿(最新工作簿.current), value = 读取单元格(工作表, address).原始值
    return 草稿.current = { address, sheetId: 工作表.id, base, value, composing: false, release: 实时协作.retainBaseline(base) }
  }
  const 同步草稿 = (address: string, value: string, composing = false) => {
    const draft = 开始草稿(address); draft.value = value; draft.composing = composing
    通知编辑草稿变化()
    if (!实时协作.active || 实时协作.readOnly || composing) return { 值: value, 已发布: false }
    const base = 重算工作簿(draft.base), index = base.findIndex(sheet => sheet.id === draft.sheetId)
    if (index < 0) return { 值: value, 已发布: false }
    try {
      const nextSheet = 写入单元格(base[index], address, value)
      if (检查工作表更新(base[index], nextSheet)) return { 值: value, 已发布: false }
      const next = 提取协作工作簿(base.map((sheet, i) => i === index ? nextSheet : sheet))
      void 实时协作.publish(next, draft.base).catch(实时协作.reportError)
      const merged = 实时协作.getSnapshot(), mergedValue = merged.find(sheet => sheet.id === draft.sheetId)?.单元格[address]?.原始值 ?? ''
      draft.release(); draft.base = 提取协作工作簿(merged); draft.release = 实时协作.retainBaseline(draft.base); draft.value = mergedValue
      应用工作簿(merged)
      return { 值: mergedValue, 已发布: true }
    } catch (error) { 实时协作.reportError(error); return { 值: value, 已发布: false } }
  }
  useEffect(() => { if (实时协作.active) 实时协作.setCursor({ sheetId: 工作表.id, address: 生成地址(选区.起点.行, 选区.起点.列) }) }, [实时协作.active, 工作表.id, 选区])
  const 提示数组子格 = (地址: string): boolean => {
    const 锚点 = 读取单元格(工作表, 地址).溢出锚点
    if (!锚点) return false
    message.info(`${地址} 是动态数组结果，请编辑锚点 ${锚点}`)
    return true
  }
  const 图片目标引用 = useRef({ 文档标识: activeDocumentId, 工作表, 工作表列表 })
  图片目标引用.current = { 文档标识: activeDocumentId, 工作表, 工作表列表 }

  const 处理图片选择 = async (事件: React.ChangeEvent<HTMLInputElement>) => {
    const 文件 = 事件.currentTarget.files?.[0]
    事件.currentTarget.value = ''
    if (文件) await 插入表格图片(文件)
  }

  /** 截图等剪贴板图片插入到选区起点；粘贴命令读取到图片时调用。 */
  const 粘贴表格图片 = (文件: File) => {
    if (工作表.保护) { modal.warning({ title: '工作表已保护', content: '请先解除保护，再粘贴图片。' }); return }
    void 插入表格图片(文件)
  }

  const 插入表格图片 = async (文件: File) => {
    const 文档标识 = activeDocumentId
    const 工作表标识 = 工作表.id
    const 锚点 = { ...选区.起点 }
    try {
      const 图片内容 = await 读取本机图片(文件)
      const 最新 = 图片目标引用.current
      if (最新.文档标识 !== 文档标识 || 最新.工作表.id !== 工作表标识) {
        modal.warning({ title: '图片未插入', content: '编辑期间切换了文档或工作表，请重新选择插入位置。' })
        return
      }
      const 已有总大小 = 最新.工作表列表.reduce((总数, 表) => 总数 +
        (表.图片 ?? []).reduce((合计, 图片) => 合计 + Math.floor(图片.数据.length * 3 / 4), 0), 0)
      if (已有总大小 + Math.floor(图片内容.数据.length * 3 / 4) > 20 * 1024 * 1024) {
        throw new Error('当前工作簿图片总大小不能超过 20 MB')
      }
      const 新表 = 添加图片(最新.工作表, {
        ...图片内容,
        id: `sheet-image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        行: 锚点.行,
        列: 锚点.列,
      })
      const 错误 = 检查工作表更新(最新.工作表, 新表)
      if (错误) {
        modal.warning({ title: '图片未插入', content: 错误 })
        return
      }
      set工作表列表((当前) => 当前.map((项) => 项.id === 工作表标识 ? 新表 : 项))
      message.success('图片已插入')
    } catch (错误) {
      modal.error({ title: '插入图片失败', content: 错误 instanceof Error ? 错误.message : '无法读取图片文件' })
    }
  }
  const 冻结 = 工作表.冻结
  const 已拆分 = 拆分映射[工作表.id] === true

  /** 选区浮窗：拖选多格时围绕整个可见选区定位。 */
  const [浮窗位置, set浮窗位置] = useState<{ x: number; y: number; 在上方: boolean } | null>(null)
  const 选区跨多格 = 选区.起点.行 !== 选区.终点.行 || 选区.起点.列 !== 选区.终点.列
  const 取选区文本 = (): string => {
    const 行列表: string[] = []
    const 起行 = Math.min(选区.起点.行, 选区.终点.行)
    const 止行 = Math.max(选区.起点.行, 选区.终点.行)
    const 起列 = Math.min(选区.起点.列, 选区.终点.列)
    const 止列 = Math.max(选区.起点.列, 选区.终点.列)
    for (let 行 = 起行; 行 <= 止行; 行 += 1) {
      const 本行: string[] = []
      for (let 列 = 起列; 列 <= 止列; 列 += 1) {
        const 单元 = 读取单元格(工作表, 生成地址(行, 列))
        if (单元.显示值.trim() !== '') 本行.push(单元.显示值)
      }
      if (本行.length > 0) 行列表.push(本行.join('\t'))
    }
    return 行列表.join('\n')
  }
  const 选区有内容 = 取选区文本().trim() !== ''
  useEffect(() => {
    // 只在跨多格（拖选/多选）时浮出，避免打开表格就压住第一个单元格
    if (!选区跨多格) { set浮窗位置(null); return }
    const 网格 = 编辑区引用.current
    if (!网格) { set浮窗位置(null); return }
    const 锚点 = 网格.querySelectorAll('.wps-sheet__cell--selected')
    set浮窗位置(从元素计算浮窗位置(锚点, { 宽: window.innerWidth, 高: window.innerHeight }))
  }, [选区, 选区跨多格, 工作表])
  useEffect(() => {
    const 收起 = (事件?: Event) => {
      if (事件?.target instanceof Element && 事件.target.closest('.wps-float-panel')) return
      set浮窗位置(null)
    }
    const 键盘 = (事件: KeyboardEvent) => { if (事件.key === 'Escape') 收起() }
    document.addEventListener('keydown', 键盘)
    return () => {
      document.removeEventListener('keydown', 键盘)
    }
  }, [])
  const 当前筛选 = 工作表.筛选
  const 隐藏行 = new Set<number>()
  if (当前筛选) {
    for (let 行 = 1; 行 < 工作表.行数; 行 += 1) {
      if (读取单元格(工作表, 生成地址(行, 当前筛选.列)).显示值 !== 当前筛选.值) 隐藏行.add(行)
    }
  }

  /** 应用修改前统一检查验证规则与保护状态。 */
  let 最近更新被拒绝 = false
  const 更新工作表 = (新表: Sheet, 允许解除保护 = false): boolean => {
    if (实时协作.readOnly) { message.warning('当前共享文档为只读，可另存本机副本'); return false }
    const 错误 = 检查工作表更新(工作表, 新表, 允许解除保护)
    if (错误) {
      最近更新被拒绝 = true
      modal.error({ title: 错误.includes('数据验证') ? '输入不符合数据验证' : '工作表已保护', content: 错误 })
      return false
    }
    最近更新被拒绝 = false
    const 下一个 = 重算工作簿(工作表列表.map((项, 下标) => (下标 === 有效当前索引 ? 新表 : 项)))
    历史.record(下一个)
    set工作表列表(下一个)
    return true
  }

  /** 撤销：回到上一份工作表列表快照 */
  const 撤销 = () => {
    if (实时协作.active) { if (!实时协作.undo()) message.info('没有可撤销的本机操作'); return }
    const 上一步 = 历史.undo()
    if (上一步 === null) {
      message.info('没有可撤销的操作')
      return
    }
    结束草稿(); set编辑地址(null); set编辑值(''); set草稿重置版本(版本 => 版本 + 1)
    set工作表列表(上一步)
    set当前索引((当前) => Math.min(当前, 上一步.length - 1))
    message.success('已撤销')
  }

  /** 重做：前进到下一份工作表列表快照 */
  const 重做 = () => {
    if (实时协作.active) { if (!实时协作.redo()) message.info('没有可重做的本机操作'); return }
    const 下一步 = 历史.redo()
    if (下一步 === null) {
      message.info('没有可重做的操作')
      return
    }
    结束草稿(); set编辑地址(null); set编辑值(''); set草稿重置版本(版本 => 版本 + 1)
    set工作表列表(下一步)
    set当前索引((当前) => Math.min(当前, 下一步.length - 1))
    message.success('已重做')
  }

  const 上下文: 表格命令上下文 = {
    工作表,
    选区,
    更新工作表,
    notify: (文本: string) => {
      if (最近更新被拒绝) { 最近更新被拒绝 = false; return }
      message.info(文本)
    },
    撤销,
    重做,
    更新选区: set选区,
    插入图表: () => {
      if (工作表.保护) { message.warning('请先解除工作表保护'); return }
      set图表打开(true)
    },
    粘贴图片: 粘贴表格图片,
    选择图片: () => {
      if (工作表.保护) {
        modal.warning({ title: '工作表已保护', content: '请先解除保护，再插入图片。' })
        return
      }
      if (!图片输入引用.current) {
        modal.error({ title: '插入图片失败', content: '当前界面无法选择图片文件，请重试。' })
        return
      }
      图片输入引用.current.click()
    },
    打开查找: () => set查找可见(true),
    开始编辑公式: (模板) => {
      const 地址 = 生成地址(选区.起点.行, 选区.起点.列)
      if (实时协作.readOnly || 提示数组子格(地址)) return
      开始草稿(地址)
      set编辑地址(地址)
      set编辑值(模板)
    },
    选择符号: () => {
      const 地址 = 生成地址(选区.起点.行, 选区.起点.列)
      let 符号 = '±'
      modal.confirm({
        title: '插入符号',
        content: React.createElement('div', { className: 'wps-sheet-symbol-dialog' },
          React.createElement('label', { htmlFor: 'sheet-symbol-input' }, '要插入的符号'),
          React.createElement('input', {
            id: 'sheet-symbol-input',
            defaultValue: 符号,
            maxLength: 8,
            autoFocus: true,
            onChange: (事件: React.ChangeEvent<HTMLInputElement>) => { 符号 = 事件.target.value },
          }),
          React.createElement('p', null, '输入符号后插入到当前单元格末尾。')
        ),
        okText: '插入',
        cancelText: '取消',
        onOk: () => {
          if (!符号.trim()) {
            message.warning('请输入要插入的符号')
            return Promise.reject()
          }
          const 当前值 = 读取单元格(工作表, 地址).原始值
          更新工作表(写入单元格(工作表, 地址, `${当前值}${符号}`))
          message.success(`已插入到 ${地址}`)
        },
      })
    },
    切换冻结: () => {
      if (冻结) {
        更新工作表({ ...工作表, 冻结: undefined })
        message.info('已取消冻结窗格')
        return
      }
      const 位置 = 选区.起点
      const 新冻结 = 位置.行 === 0 && 位置.列 === 0 ? { 行: 1, 列: 0 } : { 行: 位置.行, 列: 位置.列 }
      更新工作表({ ...工作表, 冻结: 新冻结 })
      message.info(`已冻结前 ${新冻结.行} 行、前 ${新冻结.列} 列`)
    },
    切换拆分: () => {
      set拆分映射((当前) => ({ ...当前, [工作表.id]: !当前[工作表.id] }))
      set活动窗格(0)
      message.info(已拆分 ? '已取消拆分窗格' : '已拆分为两个独立滚动窗格')
    },
    编辑批注: () => {
      const 地址 = 生成地址(选区.起点.行, 选区.起点.列)
      const 原批注 = 读取单元格(工作表, 地址).批注 ?? ''
      let 草稿 = 原批注
      modal.confirm({
        title: `${地址} 批注`,
        content: React.createElement('div', { className: 'wps-sheet-comment-dialog' },
          React.createElement('label', { htmlFor: 'sheet-comment-input' }, '批注内容'),
          React.createElement('textarea', {
            id: 'sheet-comment-input',
            defaultValue: 原批注,
            rows: 5,
            maxLength: 2000,
            onChange: (事件: React.ChangeEvent<HTMLTextAreaElement>) => { 草稿 = 事件.target.value },
          }),
          React.createElement('p', null, '清空内容并保存可删除批注。')
        ),
        okText: '保存',
        cancelText: '取消',
        onOk: () => {
          更新工作表(设置批注(工作表, 地址, 草稿))
          message.success(草稿.trim() ? '批注已保存' : '批注已删除')
        },
      })
    },
    切换筛选: () => {
      if (当前筛选) {
        更新工作表({ ...工作表, 筛选: undefined })
        message.info('已清除筛选')
        return
      }
      const 列 = 选区.起点.列
      const 列名 = 读取单元格(工作表, 生成地址(0, 列)).显示值 || `第 ${列 + 1} 列`
      let 筛选值 = 选区.起点.行 > 0 ? 读取单元格(工作表, 生成地址(选区.起点.行, 列)).显示值 : ''
      modal.confirm({
        title: `筛选 ${列名}`,
        content: React.createElement('div', { className: 'wps-sheet-filter-dialog' },
          React.createElement('label', { htmlFor: 'sheet-filter-input' }, '仅显示该列中与输入值完全相同的行'),
          React.createElement('input', {
            id: 'sheet-filter-input',
            defaultValue: 筛选值,
            onChange: (事件: React.ChangeEvent<HTMLInputElement>) => { 筛选值 = 事件.target.value },
          })
        ),
        okText: '应用筛选',
        cancelText: '取消',
        onOk: () => {
          更新工作表({ ...工作表, 筛选: { 列, 值: 筛选值 } })
          set选区({ 起点: { 行: 0, 列 }, 终点: { 行: 0, 列 } })
          message.info('已应用筛选，再次点击筛选可清除')
        },
      })
    },
    编辑数据验证: () => {
      const 首格 = 生成地址(选区.起点.行, 选区.起点.列)
      let 草稿: 验证草稿 = 创建验证草稿(读取单元格(工作表, 首格).数据验证)
      modal.confirm({
        title: '数据验证',
        content: React.createElement(SheetValidationForm, { 初始值: 草稿, on变化: (新草稿: 验证草稿) => { 草稿 = 新草稿 } }),
        okText: '应用规则',
        cancelText: '取消',
        onOk: () => {
          let 规则: 单元格数据验证 | null = null
          if (草稿.类型 === '列表') 规则 = { 类型: '列表', 选项: 草稿.选项.split(/\r?\n/).map((值) => 值.trim()).filter(Boolean), 允许空白: 草稿.允许空白 }
          if (草稿.类型 === '整数' || 草稿.类型 === '小数') {
            if (草稿.最小值.trim() === '' || 草稿.最大值.trim() === '') {
              modal.error({ title: '数据验证设置无效', content: '请填写最小值和最大值' })
              return Promise.reject()
            }
            规则 = { 类型: 草稿.类型, 最小值: Number(草稿.最小值), 最大值: Number(草稿.最大值), 允许空白: 草稿.允许空白 }
          }
          try {
            const 新表 = 设置数据验证(工作表, 生成区域地址(选区.起点, 选区.终点), 规则)
            if (!更新工作表(新表)) return Promise.reject()
            message.success(规则 ? '数据验证规则已应用' : '数据验证规则已清除')
          } catch (错误) {
            modal.error({ title: '数据验证设置无效', content: (错误 as Error).message })
            return Promise.reject()
          }
        },
      })
    },
    切换保护: () => {
      if (工作表.保护 === '外部') {
        modal.warning({ title: '无法解除来源保护', content: '原文件使用密码或特殊权限，请在原办公软件中解除后重新打开。' })
        return
      }
      if (工作表.保护 === '本机') {
        if (更新工作表({ ...工作表, 保护: undefined }, true)) message.success('已解除工作表保护')
        return
      }
      modal.confirm({
        title: '确认保护工作表',
        content: '保护后本工作表只读。此功能不设置密码，任何人都可解除保护。',
        okText: '保护',
        cancelText: '取消',
        onOk: () => {
          if (更新工作表({ ...工作表, 保护: '本机' })) message.success('工作表已保护')
        },
      })
    },
    检查拼写: () => {
      const 地址列表 = 展开区域(生成区域地址(选区.起点, 选区.终点))
        .map((位置) => 生成地址(位置.行, 位置.列))
      const 问题列表 = 扫描工作表拼写(工作表, 地址列表)
      if (问题列表.length === 0) {
        modal.info({ title: '拼写检查', content: '当前选区未发现重复虚词或中文语境下的半角标点。' })
        return
      }
      const 列表 = React.createElement('ul', { className: 'wps-sheet-spell-list' },
        问题列表.slice(0, 20).map(({ 地址, 问题 }, 索引) =>
          React.createElement('li', { key: `${地址}-${索引}` }, `${地址}：${问题.片段}。${问题.建议}`)
        )
      )
      const 内容 = React.createElement('div', null,
        React.createElement('p', null, `当前选区发现 ${问题列表.length} 处可修正的文字问题`),
        列表,
        问题列表.length > 20 ? React.createElement('p', null, `另有 ${问题列表.length - 20} 处未在列表中展开，确认后会一并修正。`) : null,
        React.createElement('p', null, '仅检查重复虚词与中文半角标点，修改前请核对。')
      )
      if (工作表.保护) {
        modal.info({ title: '拼写检查', content: 内容 })
        return
      }
      modal.confirm({
        title: '拼写检查', content: 内容, okText: '全部修正', cancelText: '取消',
        onOk: () => {
          if (!更新工作表(应用工作表拼写建议(工作表, 问题列表))) return Promise.reject()
          message.success(`已修正 ${问题列表.length} 处文字问题`)
        },
      })
    },
    切换视图: (视图) => {
      set当前视图(视图)
      message.info(视图 === '普通' ? '已切换到普通视图' : '已切换到页面布局预览')
    },
  }

  const 执行命令 = (标识: string, 参数?: string, 保存快照?: Sheet[]) => {
    if (!保存快照 && ['file.save','file.saveAs','file.print'].includes(标识)) {
      const 快照 = 读取草稿快照()
      if (!快照) return
      保存快照 = 快照
    }
    if (标识 === 'view.zoomReset') { set缩放(1); return }
    if (标识 === 'view.zoomIn' || 标识 === 'view.zoomOut') {
      set缩放(当前 => (标识 === 'view.zoomIn' ? 放大一档(当前) : 缩小一档(当前)) ?? 当前)
      return
    }
    if (标识 === 'file.print') {
      const 打印表 = (保存快照 ?? 最新工作簿.current).find(sheet => sheet.id === 工作表.id) ?? 工作表
      const 内容 = 导出为Html表格(打印表, 打印表.name)
      if (!内容) { message.warning('当前工作表为空，无法打印'); return }
      set打印预览({ 内容, 标题: 工作表.name })
      return
    }
    if (工作表.保护 && !(
      标识 === 'review.protect' || 标识 === 'clipboard.copy' ||
      标识 === 'edit.undo' || 标识 === 'edit.redo' || 标识 === 'edit.find' || 标识 === 'edit.selectAll' || 标识 === 'spell.check' ||
      标识 === 'formula.calculate' || 标识 === 'view.gridlines' || 标识 === 'view.split' ||
      标识 === 'view.normal' || 标识 === 'view.pageLayout' || 标识.startsWith('file.')
    )) {
      modal.warning({ title: '工作表已保护', content: '请先从“审阅”中解除工作表保护，再修改内容。' })
      return
    }
    if (标识 === 'view.gridlines') {
      const 目标 = !显示网格线
      set显示网格线(目标)
      message.info(目标 ? '已显示网格线' : '已隐藏网格线')
      return
    }
    if (标识 === 'formula.calculate') {
      const 已计算 = 重算工作簿(工作表列表)
      set工作表列表(已计算)
      const 待重算 = 已计算.some(表 => Object.values(表.单元格).some(单元 => 单元.公式状态))
      message.info(待重算 ? '已计算支持的公式；部分公式保留来源缓存或等待兼容软件计算' : '已重新计算工作簿')
      return
    }
    if (标识 === 'file.exportCsv' || 标识 === 'file.exportHtml') {
      const 是Csv = 标识 === 'file.exportCsv'
      const 内容 = 是Csv ? 导出为Csv(工作表) : 导出为Html表格(工作表, 工作表.name)
      if (内容.length === 0) {
        message.warning('工作表为空，没有可导出的内容')
        return
      }
      下载文本(
        内容,
        生成表格文件名(工作表.name, 是Csv ? 'csv' : 'html'),
        是Csv ? 'text/csv' : 'text/html'
      )
      message.success(是Csv ? '已导出为 CSV 文件' : '已导出为网页文件')
      return
    }
    if (标识 === 'file.exportXlsx') {
      if (!桥接.可用) {
        message.info('当前环境不支持导出表格功能，请使用打包后的版本')
        return
      }
      const 模型 = 导出为Xlsx(工作表)
      if (模型 === null) {
        message.warning('工作表为空，没有可导出的内容')
        return
      }
      桥接.office.writeXlsx(模型).then((结果: any) => {
        if (!(结果 && 结果.成功 && 结果.数据)) {
          提示文件错误('导出表格失败', '表格格式转换失败，请检查内容后重试')
          return
        }
        return 桥接.showSaveDialog(生成表格文件名(工作表.name, '.xlsx'), 'table' as const).then(async (文件路径) => {
          if (文件路径) {
            const 保存路径 = 规范表格路径(文件路径)
            if (!/\.xlsx$/i.test(保存路径)) {
              提示文件错误('导出表格失败', '请选择 XLSX 格式的文件路径。')
              return
            }
            if (导出路径已打开(保存路径)) return
            if (保真风险 && 是同一路径(保存路径, 保真风险.来源路径) && !/\.(slxls|sealsheet)$/i.test(保存路径)) {
              提示禁止覆盖(保真风险.警告)
              return
            }
            if (保真风险 && !await 确认保存副本(保真风险.警告)) return
            if (导出路径已打开(保存路径)) return
            return 桥接.saveToFile(保存路径, 结果.数据, '二进制').then((保存结果) => {
              if (保存结果.成功) {
                message.success('已导出为表格文件')
              } else if (!保存结果.已取消) {
                提示文件错误('导出表格失败', 保存结果.错误 || '文件写入失败')
              }
            })
          }
          return Promise.resolve()
        }).catch((error: unknown) => {
          提示文件错误('导出表格失败', (error as Error).message || '未知错误')
        })
      }).catch((error: unknown) => {
        提示文件错误('导出表格失败', (error as Error).message || '未知错误')
      })
      return
    }
    // 统一解析入口，包含 CSV、旧版 Office、开放表格及模型 JSON。
    if (标识 === 'file.open') {
      if (!桥接.可用) { message.info('当前环境不支持打开文件功能，请使用打包后的版本'); return }
      void 桥接.showOpenDialog('table').then(async 文件路径 => {
        if (!文件路径) return
        const 内容 = await 准备打开本地文件(文件路径)
        if (!内容) return
        文件路径 = 内容.打开路径 ?? 文件路径
        if (内容.类型 !== 'table') throw new Error('请选择受支持的表格文件，普通 JSON 应从文字编辑器打开')
        createDoc('table', 内容.工作表列表 ?? 内容.内容, { 路径: 文件路径, 文件指纹: 内容.文件指纹, 警告: 内容.警告 ?? [] })
        await 记录最近文档(文件路径, 基准名(文件路径), 'table')
      }).catch((错误: unknown) => { 提示文件错误('打开表格失败', 错误 instanceof Error ? 错误.message : '文件读取失败') })
      return
    }
    if (标识 === 'file.save') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      const 可直接保存 = 文档路径 !== null && 可保存扩展('table').has(文档路径.match(/\.[^\\/.]+$/)?.[0]?.toLowerCase() ?? '')
      const 默认名称 = 文档路径 && !可直接保存
        ? `${基准名(文档路径).replace(/\.[^.]+$/, '')}.slxls`
        : 生成表格文件名(工作表.name, '.slxls')
      const 选择路径 = 可直接保存 ? 文档路径 : 桥接.showSaveDialog(默认名称, 'table' as const)
      Promise.resolve(选择路径).then((文件路径) => {
        if (文件路径) {
          return 保存表格文件(文件路径, '文件已保存', 保存快照)
        }
      }).catch((error: unknown) => {
        提示文件错误('保存表格失败', (error as Error).message || '未知错误')
      })
      return
    }
    if (标识 === 'file.saveAs') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      桥接.showSaveDialog(文档路径 ? 基准名(文档路径) : 生成表格文件名(工作表.name, '.slxls'), 'table' as const).then(async (文件路径) => {
        if (文件路径) {
          if (路径被其他标签占用(规范表格路径(文件路径))) return
          if (保真风险 && 是同一路径(规范表格路径(文件路径), 保真风险.来源路径) && !/\.(slxls|sealsheet)$/i.test(文件路径)) {
            提示禁止覆盖(保真风险.警告)
            return
          }
          if (保真风险 && !/\.(slxls|sealsheet)$/i.test(文件路径) && !await 确认保存副本(保真风险.警告)) return
          return 保存表格文件(文件路径, '文件已另存为', 保存快照)
        }
      }).catch((error: unknown) => {
        提示文件错误('保存表格失败', (error as Error).message || '未知错误')
      })
      return
    }
    const 命令 = 查找表格命令(标识)
    if (命令 === undefined) {
      提示文件错误('操作失败', '该命令未注册')
      return
    }
    try {
      命令.run(上下文, 参数)
    } catch (错误) {
      modal.error({ title: '表格操作失败', content: 错误 instanceof Error ? 错误.message : '请检查所选内容后重试' })
    }
  }

  /** 保存表格文档：根据扩展名写出真实格式，并保留来源文件指纹。 */
  const 保存表格文件 = async (原始路径: string, 成功提示: string, 快照 = 最新工作簿.current) => {
    const 保存工作表 = 快照.find(sheet => sheet.id === 工作表.id) ?? 快照[0]
    const 文件路径 = 规范表格路径(原始路径)
    const 预期文件指纹 = 当前文档 && 文档路径 && 是同一路径(文件路径, 文档路径)
      ? 当前文档.文件指纹 : undefined
    if (!可保存扩展('table').has(文件路径.match(/\.[^\\/.]+$/)?.[0]?.toLowerCase() ?? '')) {
      提示文件错误('保存表格失败', '请选择 XLSX、CSV、XLS、开放表格或其他可保存的数据格式。')
      return
    }
    if (路径被其他标签占用(文件路径)) return
    if (保真风险 && 是同一路径(文件路径, 保真风险.来源路径) && !/\.(slxls|sealsheet)$/i.test(文件路径)) {
      提示禁止覆盖(保真风险.警告)
      return
    }
    const 格式名 = 文件路径.match(/\.([^\\/.]+)$/)?.[1]?.toUpperCase() ?? 'CSV'
    const 文本 = 表格文本输出(文件路径, 快照)
    if (文本) {
      if (文本.损失.length && !await new Promise<boolean>((完成) => modal.confirm({
        title: `${格式名} 格式不能保留全部内容`,
        content: `将只保存单元格的文字和数值，以下内容不会写入 ${格式名}：${文本.损失.join('、')}。如需保留，请取消后另存为 XLSX。`,
        okText: `仍保存 ${格式名}`, cancelText: '取消', onOk: () => 完成(true), onCancel: () => 完成(false),
      }))) return
      if (路径被其他标签占用(文件路径)) return
      await 桥接.saveToFile(文件路径, 文本.内容, '文本', 预期文件指纹, 文本.编码).then((结果) => {
        if (结果.成功) {
          记录当前路径(文件路径, 结果.文件指纹, 快照)
          记录最近文档(文件路径, 基准名(文件路径), 'table')
          message.success(成功提示)
        } else if (!结果.已取消) {
          提示文件错误('保存表格失败', 结果.错误 || '文件写入失败')
        }
      }).catch((error: unknown) => {
        提示文件错误('保存表格失败', (error as Error).message || '未知错误')
      })
      return
    }
    const 数据输出 = 单表数据输出(文件路径, 快照)
    if (数据输出?.损失.length && !await new Promise<boolean>((完成) => modal.confirm({
      title: `${数据输出.格式} 保存需要转换内容`, content: `以下内容将转换或不被该格式保留：${数据输出.损失.join('、')}。请保留原工作簿并核对导出结果。`,
      okText: `仍保存 ${数据输出.格式}`, cancelText: '取消', onOk: () => 完成(true), onCancel: () => 完成(false),
    }))) return
    // 空工作簿也允许保存，导出模型为空时回落为空表定义
    const 模型 = /\.(slxls|sealsheet)$/i.test(文件路径) ? null : 数据输出?.模型 ?? 导出为Xlsx(快照.length > 1 ? 快照 : 保存工作表) ?? {
      工作表: [{ 名称: 保存工作表.name, 数据: [], 页面设置: 保存工作表.页面设置 }],
    }
    await 写出办公文档('table', 文件路径, 模型, () => message.loading('正在转换并保存表格，请稍等…', 0),{工作表列表:快照,警告:保真风险?.警告??[]}).then((结果: any) => {
      if (!(结果 && 结果.成功 && 结果.数据)) {
        提示文件错误('保存表格失败', 结果?.错误 || '表格格式转换失败，请检查内容后重试')
        return
      }
      if (路径被其他标签占用(文件路径)) return
      return 桥接.saveToFile(文件路径, 结果.数据, '二进制', 预期文件指纹).then((保存结果) => {
        if (保存结果.成功) {
          记录当前路径(文件路径, 保存结果.文件指纹, 快照)
          记录最近文档(文件路径, 基准名(文件路径), 'table')
          message.success(成功提示)
        } else if (!保存结果.已取消) {
          提示文件错误('保存表格失败', 保存结果.错误 || '文件写入失败')
        }
      })
    }).catch((error: unknown) => {
      提示文件错误('保存表格失败', (error as Error).message || '未知错误')
    })
  }

  /** 从当前选区起按行优先顺序查找下一个包含关键词的单元格（循环全表） */
  const 查找下一个 = () => {
    const 关键词 = 查找词.trim().toLowerCase()
    if (关键词 === '') {
      return
    }
    const 总数 = 工作表.行数 * 工作表.列数
    for (let 步进 = 1; 步进 <= 总数; 步进 += 1) {
      const 行 = (选区.起点.行 + Math.floor((选区.起点.列 + 步进) / 工作表.列数)) % 工作表.行数
      const 列 = (选区.起点.列 + 步进) % 工作表.列数
      if (隐藏行.has(行)) continue
      const 显示 = 读取单元格(工作表, 生成地址(行, 列)).显示值.toLowerCase()
      if (显示.includes(关键词)) {
        set选区({ 起点: { 行, 列 }, 终点: { 行, 列 } })
        message.success(`已定位到 ${生成地址(行, 列)}`)
        return
      }
    }
    message.info('没有找到匹配的单元格')
  }

  const 草稿错误 = useRef('')
  const 读取草稿快照 = (提示 = true): Sheet[] | null => {
    草稿错误.current = ''
    const 当前草稿 = 公式草稿.current ?? (编辑地址 ? { address: 编辑地址, value: 草稿.current?.value ?? 编辑值, composing: 草稿.current?.composing ?? false } : null)
    if (!当前草稿) return 最新工作簿.current
    if (当前草稿.composing) { 草稿错误.current = '请先完成输入法候选字，再保存'; if (提示) message.info(草稿错误.current); return null }
    const 锚点 = 读取单元格(工作表, 当前草稿.address).溢出锚点
    if (锚点) { 草稿错误.current = `${当前草稿.address} 是动态数组结果，请编辑锚点 ${锚点}`; if (提示) message.info(草稿错误.current); return null }
    if (实时协作.readOnly) return 最新工作簿.current
    try {
      if (实时协作.active) 同步草稿(当前草稿.address, 当前草稿.value)
      const 当前 = 最新工作簿.current, 原表 = 当前.find(sheet => sheet.id === (草稿.current?.sheetId ?? 工作表.id))
      if (!原表) { 草稿错误.current = '草稿所在工作表已删除，已保留本机输入，请复制后重新选择单元格'; if (提示) message.warning(草稿错误.current); return null }
      const 值 = 实时协作.active ? 草稿.current?.value ?? 当前草稿.value : 当前草稿.value
      if (读取单元格(原表, 当前草稿.address).原始值 === 值) return 当前
      const 新表 = 写入单元格(原表, 当前草稿.address, 值), 错误 = 检查工作表更新(原表, 新表)
      if (错误) { 草稿错误.current = 错误; if (提示) modal.error({ title: 错误.includes('数据验证') ? '输入不符合数据验证' : '无法修改单元格', content: 错误 }); return null }
      const 快照 = 重算工作簿(当前.map(sheet => sheet.id === 原表.id ? 新表 : sheet))
      if (!实时协作.active) 历史.record(快照)
      set工作表列表(快照)
      return 最新工作簿.current
    } catch (error) { 草稿错误.current = error instanceof Error ? error.message : '无法修改单元格'; if (提示) message.warning(草稿错误.current); return null }
  }
  const 准备草稿引用 = useRef<() => 单文档草稿结果>(() => ({ 成功: true, 类型: 'table', 模型: 最新工作簿.current, 已修改: false }))
  准备草稿引用.current = () => {
    const 原值 = 最新工作簿.current, 快照 = 读取草稿快照(false)
    return 快照 ? { 成功: true, 类型: 'table', 模型: 快照, 已修改: 快照 !== 原值 } : { 成功: false, 错误: 草稿错误.current || '请先完成当前单元格编辑' }
  }
  useLayoutEffect(() => activeDocumentId ? 注册编辑草稿(activeDocumentId, () => 准备草稿引用.current()) : undefined, [activeDocumentId, 注册编辑草稿])
  const 提交编辑 = () => {
    if (!读取草稿快照()) return
    结束草稿()
    set编辑地址(null)
    set编辑值('')
  }

  const 取首格地址 = (): string => 生成地址(选区.起点.行, 选区.起点.列)

  const 选区统计 = (() => {
    const 地址列表 = 展开区域(生成区域地址(选区.起点, 选区.终点)).map((位置) =>
      生成地址(位置.行, 位置.列)
    )
    return 统计选区(地址列表.map((地址) => {
      const 单元 = 读取单元格(工作表, 地址)
      return String(单元.计算值 ?? 单元.原始值)
    }))
  })()


  /** 键盘操作：方向键移动选区、回车或 F2 编辑、Delete 清空、可见字符直接输入、快捷键 */
  const 处理按键 = (事件: React.KeyboardEvent) => {
    if (事件.defaultPrevented || 事件.nativeEvent.isComposing || 事件.nativeEvent.keyCode === 229) return
    const { 起点, 终点 } = 选区
    const 进入编辑 = (初始值: string) => {
      if (实时协作.readOnly) { message.info('当前共享文档为只读'); return }
      if (提示数组子格(生成地址(起点.行, 起点.列))) return
      if (工作表.保护) { modal.warning({ title: '工作表已保护', content: '请先解除保护，再编辑单元格。' }); return }
      const address = 生成地址(起点.行, 起点.列)
      开始草稿(address).value = 初始值
      set编辑地址(address); set编辑值(初始值)
    }
    const 清除选区 = () => {
      if (工作表.保护) { modal.warning({ title: '工作表已保护', content: '请先解除保护，再清除单元格。' }); return }
      const addresses = 展开区域(生成区域地址(起点, 终点)).map(point => 生成地址(point.行, point.列))
      try { if (更新工作表(清空单元格(工作表, addresses))) message.success('已清除 ' + addresses.length + ' 个单元格') }
      catch (error) { message.info(error instanceof Error ? error.message : '无法清除动态数组的一部分') }
    }
    if (dispatchShortcut(事件, 'sheet', (标识, 参数) => {
      if (编辑地址 !== null || 公式草稿.current) {
        if (!['file.save','file.saveAs','file.print'].includes(标识)) return false
        执行命令(标识, 参数)
        return true
      }
      if (executeSheetNavigation(标识, { sheet: 工作表, selection: 选区, select: set选区, edit: 进入编辑, clear: 清除选区, pageRows: Math.max(1, Math.floor((编辑区引用.current?.clientHeight || 480) / (24 * 缩放))) })) return true
      if (标识 === 'edit.undo') 撤销()
      else if (标识 === 'edit.redo') 重做()
      else if (标识 === 'edit.find') set查找可见(true)
      else if (标识 === 'edit.selectAll') set选区({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 工作表.行数 - 1, 列: 工作表.列数 - 1 } })
      else 执行命令(标识, 参数)
      return true
    })) return
    if (编辑地址 !== null || (事件.target instanceof Element && 事件.target.closest('input,textarea,select'))) return
    // All configurable navigation keys are handled above. Tab keeps its native spreadsheet movement.
    if (事件.key === 'Tab') {
      事件.preventDefault()
      executeSheetNavigation('navigation.move.' + (事件.shiftKey ? 'left' : 'right'), { sheet: 工作表, selection: 选区, select: set选区, edit: 进入编辑, clear: 清除选区 })
    } else if (事件.key.length === 1 && !事件.ctrlKey && !事件.metaKey && !事件.altKey) {
      事件.preventDefault(); 进入编辑(事件.key)
    }
  }

  const 取激活态 = (标识: string): boolean => {
    const 格式 = 读取单元格(工作表, 取首格地址()).格式
    if (标识 === 'cell.bold') return 格式.加粗 === true
    if (标识 === 'cell.italic') return 格式.斜体 === true
    if (标识 === 'cell.underline') return 格式.下划线 === true
    if (标识 === 'cell.alignLeft') return 格式.水平对齐 === 'left'
    if (标识 === 'cell.alignCenter') return 格式.水平对齐 === 'center'
    if (标识 === 'cell.alignRight') return 格式.水平对齐 === 'right'
    if (标识 === 'view.freeze') return 冻结 !== undefined
    if (标识 === 'view.split') return 已拆分
    if (标识 === 'data.filter') return 当前筛选 !== undefined
    if (标识 === 'review.protect') return 工作表.保护 !== undefined
    if (标识 === 'view.normal') return 当前视图 === '普通'
    if (标识 === 'view.pageLayout') return 当前视图 === '页面布局'
    return false
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(RibbonTabs, {
      activeKey: 当前标签,
      onChange: set当前标签,
      tabs: 表格标签,
    }),
    React.createElement(RibbonPanel, {
      缩放,
      activeKey: 当前标签,
      tabs: 表格标签,
      onCommand: 执行命令,
      onDropdownOpen: () => set浮窗位置(null),
      获取激活态: 取激活态,
      获取当前值: (标识: string) => {
        if (标识 === 'cell.font') return 读取单元格(工作表, 取首格地址()).格式?.字体 ?? '宋体'
        if (标识 === 'layout.margin') return 工作表.页面设置?.页边距 ?? '常规'
        if (标识 === 'layout.orientation') return 工作表.页面设置?.方向 ?? '纵向'
        if (标识 === 'layout.paperSize') return 工作表.页面设置?.纸张大小 ?? 'A4'
        return undefined
      },
    }),
    React.createElement('input', {
      ref: 图片输入引用,
      type: 'file',
      accept: '.png,.jpg,.jpeg,image/png,image/jpeg',
      'aria-label': '选择表格图片',
      style: { display: 'none' },
      onChange: 处理图片选择,
    }),
    图表打开 ? React.createElement(SheetChartDialog, { sheet: 工作表, selection: 选区, onClose: () => set图表打开(false), onInsert: image => {
      const latest = 图片目标引用.current
      if (latest.文档标识 !== activeDocumentId || latest.工作表.id !== 工作表.id) throw new Error('工作表已切换，请重新插入图表')
      const next = 添加图片(latest.工作表, { ...image, id: `sheet-chart-${Date.now()}`, 行: Math.min(工作表.行数 - 1, Math.max(选区.起点.行, 选区.终点.行) + 2), 列: Math.min(选区.起点.列, 选区.终点.列) })
      if (!更新工作表(next)) throw new Error('当前工作表无法插入图表')
      message.success('图表图片已插入')
    } }) : null,
    React.createElement(SheetToolbar, {
      key: `${activeDocumentId ?? '独立'}:${草稿重置版本}`,
      兼容模式: 工作表.公式兼容模式 ?? 'Excel',
      on兼容模式: (模式: 'Excel' | 'WPS') => {
        if (实时协作.readOnly) return
        结束草稿();set编辑地址(null);set编辑值('')
        set工作表列表(当前 => 当前.map(sheet => ({...sheet,公式兼容模式:模式})))
        message.info(`已切换为 ${模式} 公式兼容模式`)
      },
      地址文本: 生成区域地址(选区.起点, 选区.终点),
      公式值: 读取单元格(工作表, 读取单元格(工作表, 取首格地址()).溢出锚点 ?? 取首格地址()).原始值,
      只读提示: 实时协作.readOnly ? '当前共享文档为只读' : 读取单元格(工作表, 取首格地址()).溢出锚点 ? `动态数组结果，请编辑锚点 ${读取单元格(工作表, 取首格地址()).溢出锚点}` : undefined,
      on文件按键: 处理按键,
      on取消草稿: 结束草稿,
      on草稿变化: (value: string, composing: boolean) => {
        const address = 取首格地址()
        const result = 同步草稿(address, value, composing)
        公式草稿.current = { address, value: result.值, composing }
        return result
      },
      on地址提交: (文本: string) => {
        const 位置 = 解析地址(文本)
        if (位置 === null) {
          message.warning('地址格式无效，请输入形如 A1 的地址')
          return
        }
        set选区({ 起点: 位置, 终点: 位置 })
      },
      on公式提交: (值: string) => {
        const 目标地址 = 取首格地址()
        if (提示数组子格(目标地址)) return
        公式草稿.current = { address: 目标地址, value: 值, composing: false }
        if (!读取草稿快照()) return false
        结束草稿()
        const 目标位置 = 解析地址(目标地址)
        if (目标位置 !== null && 目标位置.行 + 1 < 工作表.行数) {
          set选区({ 起点: { 行: 目标位置.行 + 1, 列: 目标位置.列 }, 终点: { 行: 目标位置.行 + 1, 列: 目标位置.列 } })
        }
        message.success(`已写入 ${目标地址}`)
        return true
      },
    }),
    查找可见
      ? React.createElement(
          'div',
          { className: 'wps-sheet-findbar' },
          React.createElement('input', {
            className: 'wps-sheet-findbar__input',
            placeholder: '查找内容，回车定位下一个',
            value: 查找词,
            autoFocus: true,
            'aria-label': '查找内容',
            onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set查找词(事件.target.value),
            onKeyDown: (事件: React.KeyboardEvent) => {
              if (事件.nativeEvent.isComposing || 事件.nativeEvent.keyCode === 229) return
              if (事件.key === 'Enter') {
                事件.preventDefault()
                查找下一个()
              }
              if (事件.key === 'Escape') {
                set查找可见(false)
              }
            },
          }),
          React.createElement(
            'button',
            { className: 'wps-sheet-findbar__btn', onClick: 查找下一个 },
            '查找下一个'
          ),
          React.createElement(
            'button',
            {
              className: 'wps-sheet-findbar__btn',
              onClick: () => set查找可见(false),
              'aria-label': '关闭查找',
            },
            '关闭'
          )
        )
      : null,
    React.createElement(
      'div',
      {
        className: `wps-sheet-stage${显示网格线 ? '' : ' wps-sheet-stage--no-gridlines'}${已拆分 ? ' wps-sheet-stage--split' : ''}`,
        ref: 编辑区引用,
      },
      当前筛选 ? React.createElement('div', { className: 'wps-sheet-filterbar' },
        `第 ${当前筛选.列 + 1} 列筛选：${当前筛选.值 === '' ? '空白' : 当前筛选.值}，显示 ${工作表.行数 - 1 - 隐藏行.size} 行`,
        React.createElement('button', { type: 'button', onClick: () => 执行命令('data.filter') }, '清除筛选')
      ) : null,
      工作表.保护 ? React.createElement('div', { className: 'wps-sheet-protectionbar' },
        工作表.保护 === '外部' ? '原文件受保护，当前只读' : '工作表已保护，当前只读'
      ) : null,
      Object.values(工作表.单元格).some(单元 => 单元.公式状态) ? React.createElement('div', { className: 'wps-sheet-filterbar', role: 'status' },
        '部分公式使用来源缓存或等待计算；缓存可能已过期，修改数据后需在支持该公式的表格软件中重新计算。公式原文将保留。'
      ) : null,
      读取单元格(工作表, 取首格地址()).溢出锚点 ? React.createElement('div', { className: 'wps-sheet-filterbar', role: 'status' }, `动态数组结果来自 ${读取单元格(工作表, 取首格地址()).溢出锚点}，请在锚点编辑公式；结果区域不能单独修改。`) : null,
      读取单元格(工作表, 取首格地址()).溢出错误 ? React.createElement('div', { className: 'wps-sheet-filterbar', role: 'status' }, `#SPILL! ${读取单元格(工作表, 取首格地址()).溢出错误}`) : null,
      当前视图 === '页面布局'
        ? React.createElement(SheetPagePreview, { 工作表 })
        : Array.from({ length: 已拆分 ? 2 : 1 }, (_, 窗格) => React.createElement(GridView, {
        key: `${工作表.id}-${窗格}`,
        工作表,
        选区,
        编辑地址: 窗格 === 活动窗格 ? 编辑地址 : null,
        编辑值,
        只读: 实时协作.readOnly,
        scale: 缩放,
        冻结,
        隐藏行,
        跟随选区: 窗格 === 活动窗格,
        on选中: (位置: 单元格位置, 扩展选区: boolean) => {
          set活动窗格(窗格)
          if (扩展选区) {
            set选区((当前) => ({ 起点: 当前.起点, 终点: 位置 }))
          } else {
            set选区({ 起点: 位置, 终点: 位置 })
          }
        },
        on双击: (地址: string) => {
          if (实时协作.readOnly) { message.info('当前共享文档为只读'); return }
          if (提示数组子格(地址)) return
          if (工作表.保护) {
            modal.warning({ title: '工作表已保护', content: '请先解除保护，再编辑单元格。' })
            return
          }
          set活动窗格(窗格)
          开始草稿(地址)
          set编辑地址(地址)
          set编辑值(读取单元格(工作表, 地址).原始值)
        },
        on编辑值变化: (值: string) => {
          if (!编辑地址) return
          set编辑值(同步草稿(编辑地址, 值, 草稿.current?.composing).值)
        },
        on组合开始: () => { if (编辑地址) { 开始草稿(编辑地址).composing = true; 通知编辑草稿变化() } },
        on组合结束: (值: string) => { if (编辑地址) set编辑值(同步草稿(编辑地址, 值, false).值) },
        on提交编辑: 提交编辑,
        on取消编辑: () => {
          结束草稿()
          set编辑地址(null)
          set编辑值('')
        },
        on选中整列: (列: number) =>
          set选区({ 起点: { 行: 0, 列 }, 终点: { 行: 工作表.行数 - 1, 列 } }),
        on选中整行: (行: number) =>
          set选区({ 起点: { 行, 列: 0 }, 终点: { 行, 列: 工作表.列数 - 1 } }),
        on全选: () =>
          set选区({
            起点: { 行: 0, 列: 0 },
            终点: { 行: 工作表.行数 - 1, 列: 工作表.列数 - 1 },
          }),
        on按键: 处理按键,
        on拖选扩展: (位置: 单元格位置) => {
          set选区((当前) => ({ 起点: 当前.起点, 终点: 位置 }))
        },
        on列宽拖动开始: (列: number, 起始横坐标: number) => {
          if (工作表.保护) {
            modal.warning({ title: '工作表已保护', content: '请先解除保护，再调整列宽。' })
            return
          }
          // 拖动只在开始时记录一次历史，避免逐帧占满撤销栈
          历史.record(工作表列表)
          列宽拖动.current = {
            列,
            起始横坐标,
            原宽: 工作表.列宽[列] ?? 默认列宽,
          }
        },
        onContextMenu: (x: number, y: number) => {
          set菜单坐标({ x, y })
          set菜单可见(true)
        },
        on删除图片: (标识: string) => {
          if (更新工作表(删除图片(工作表, 标识))) message.success('图片已删除')
        },
      }))
    ),
    React.createElement(ContextMenu, {
      open: 菜单可见,
      x: 菜单坐标.x,
      y: 菜单坐标.y,
      items: withShortcutLabels(构建表格菜单(), 'sheet'),
      取锚点: () => 读取可见矩形(编辑区引用.current?.querySelectorAll('.wps-sheet__cell--selected') ?? []),
      onCommand: (命令标识: string, 参数?: string) => {
        if (命令标识 === '__close__') {
          关闭菜单()
          return
        }
        // 颜色与 AI 快捷动作由本模块解析，其余仍走表格命令表
        if (处理表格颜色命令(命令标识, 执行命令) || 处理表格AI命令(命令标识, 取选区文本)) {
          关闭菜单()
          return
        }
        执行命令(命令标识, 参数)
        关闭菜单()
      },
    }),
    React.createElement(SelectionFloatPanel, {
      打开: !菜单可见 && 浮窗位置 !== null,
      位置: 浮窗位置,
      按钮: 构建表格浮窗按钮({ 执行命令, 取选区文本, 选区有内容 }),
      on关闭: () => set浮窗位置(null),
      名称: '选中单元格操作',
    }),
    React.createElement(SheetTabs, {
      工作表列表: 工作表列表.map((项) => ({ id: 项.id, name: 项.name })),
      当前标识: 工作表.id,
      on切换: (标识: string) => {
        const 下标 = 工作表列表.findIndex((项) => 项.id === 标识)
        if (下标 >= 0) {
          set当前索引(下标)
          set选区({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } })
        }
      },
      on新建: () => {
        const 新表 = { ...创建工作表(`Sheet${工作表列表.length + 1}`), ...(工作表列表[0]?.日期系统1904 ? { 日期系统1904: true } : {}), ...(工作表列表[0]?.公式兼容模式 ? {公式兼容模式:工作表列表[0].公式兼容模式} : {}) }
        set工作表列表((当前) => [...当前, 新表])
        set当前索引(工作表列表.length)
        message.success(`已新建工作表 ${新表.name}`)
      },
      on删除: (标识: string) => {
        if (工作表列表.find((项) => 项.id === 标识)?.保护) {
          modal.warning({ title: '工作表已保护', content: '请先解除保护，再删除此工作表。' })
          return
        }
        if (工作表列表.length <= 1) {
          message.warning('至少需要保留一个工作表')
          return
        }
        const 剩余 = 工作表列表.filter((项) => 项.id !== 标识)
        set工作表列表(剩余)
        set当前索引(0)
        message.success('已删除工作表')
      },
    }),
    React.createElement(SheetStatusBar, {
      统计: 选区统计,
      缩放,
      on缩放变化: set缩放,
    }),
    打印预览 ? React.createElement(PrintPreview, { 内容: 打印预览.内容, 格式: 'html', 标题: 打印预览.标题, onClose: () => set打印预览(null) }) : null
  )
}

export default SheetEditor
