// 编辑器容器：装配文档标签栏、Ribbon、标尺、编辑区、查找面板与状态栏。
// 全部编辑行为通过 commands.ts 的命令注册表派发，此文件只负责上下文实现与区域编排。
import React, { useEffect, useRef, useState } from 'react'
import { App as AntdApp } from 'antd'
import { useAppStore } from '../store'
import { 基准文件名, 扩展转类型, 记录最近文档 } from '../fileOpen'
import { 命令表, type CommandContext, type InsertableKind, type ViewState, type 选区格式 } from './commands'
import { HistoryStack } from './history'
import { countWords } from './wordCount'
import { 下载文本, 导出为Html, 导出为文本, 生成文件名 } from './exportDoc'
import { 检查文本 } from './spellCheck'
import { 提取大纲 } from './toc'
import NavigationPane from './NavigationPane'
import TableGridPicker from './TableGridPicker'
import SourceManager from './SourceManager'
import CompareDialog from './CompareDialog'
import TranslateDialog from './TranslateDialog'
import MailMergeDialog from './MailMergeDialog'
import { 比较文本, 抽取文本, 生成修订Html, 统计差异 } from './compare'
import type { 文献 } from './citation'
import RibbonTabs from './ribbon/RibbonTabs'
import { 保存选区, 恢复选区, 选区覆盖的段落 } from './selection'
import RibbonPanel from './ribbon/RibbonPanel'
import EditorCanvas from './EditorCanvas'
import ImageTools from './ImageTools'
import Ruler from './Ruler'
import FindReplacePanel from './FindReplacePanel'
import { 查找文字, 高亮搜索, 清除搜索高亮, 定位文字, 替换范围 } from './textSearch'
import EditorStatusBar from './EditorStatusBar'
import ContextMenu from '../components/ContextMenu'
import PrintPreview from '../components/PrintPreview'
import type { 菜单节点 } from '../components/ContextMenu'
import type { 文字页面设置 } from '../office/docModel'
import { 读取插入图片, 准备图片保存内容 } from '../office/docImages'
import { 默认文件缩放, use滚轮缩放, 文字缩放范围 } from './wheelZoom'
import { 构建文字浮窗按钮, 构建颜色菜单组, 构建AI菜单组, 处理颜色菜单命令, 处理AI菜单命令 } from './floatActions'
import { use选区浮窗 } from '../components/SelectionFloatPanel'
import SelectionFloatPanel from '../components/SelectionFloatPanel'
import { 应用精确字号, 规范化字号标记, 读取字号磅值 } from './fontSize'
import { 中文字号表 } from './fontOptions'

const 默认视图: ViewState = {
  缩放: 默认文件缩放,
  标尺: true,
  网格线: false,
  段落标记: false,
  视图模式: '页面视图',
  纸张: 'A4',
  纸张方向: '纵向',
  页边距: '常规',
  分栏: '一栏',
  水印: '无',
  页面边框: '无',
  页面颜色: '无',
  文字方向: '横排',
  显示批注: true,
  修订模式: false,
  文档保护: false,
}

const 新文字历史 = (读取页面: () => 文字页面设置 | undefined) => new HistoryStack(
  (a, b) => a.html === b.html && JSON.stringify(a.页面设置) === JSON.stringify(b.页面设置),
  item => ({ ...item, 页面设置: item.页面设置 === undefined ? 读取页面() ?? null : item.页面设置 }),
)
const 修改正文命令 = (标识: string) => /^(font\.|para\.|style\.|insert\.|layout\.|table\.|link\.|comment\.|track\.|merge\.)/.test(标识) || ['clipboard.cut', 'clipboard.paste', 'clipboard.formatPainter', 'edit.undo', 'edit.redo'].includes(标识)

const 布局字段 = ['纸张', '纸张方向', '页边距', '分栏', '水印', '页面边框', '页面颜色', '文字方向', '原始纸张', '原始页边距', '页眉Html', '页脚Html'] as const

function 提取页面设置(视图: ViewState): 文字页面设置 {
  return Object.fromEntries(布局字段.map((字段) => [字段, 视图[字段]])) as unknown as 文字页面设置
}

/** 个别运行环境不提供 queryCommandState；缺失或抛错时按“未生效”处理，避免浮窗取格式时异常 */
function 安全查询格式(指令: string): boolean {
  try {
    return typeof document.queryCommandState === 'function' ? document.queryCommandState(指令) : false
  } catch {
    return false
  }
}

const 表格模板 = (): string => {
  const 单元格 = '<td style="border:1px solid #E8EBF0;padding:6px 8px">&nbsp;</td>'
  const 行 = `<tr>${单元格.repeat(3)}</tr>`
  return `<table style="border-collapse:collapse;width:100%"><tbody>${行.repeat(3)}</tbody></table><p><br></p>`
}
const 封面模板 = (): string =>
  '<p style="text-align:center"><span style="font-size:32px;font-weight:600">文档标题</span></p>' +
  '<p style="text-align:center"><span style="font-size:14px;color:#5C6472">作者名称</span></p>' +
  '<p style="text-align:center"><span style="font-size:14px;color:#5C6472">2026 年 9 月</span></p>' +
  '<div class="wps-page-break"></div>'

const DocEditor = () => {
  const { message, modal } = AntdApp.useApp()
  const {
    documents,
    activeDocumentId,
    updateEditorHtml,
    更新文字页面设置,
    markDocumentSaved,
    文档路径,
    set文档路径,
    查找保存路径占用,
    更新文件指纹,
    createDoc,
  } = useAppStore()

  const [当前标签, set当前标签] = useState('start')
  const [视图, set视图] = useState<ViewState>(默认视图)
  const [查找打开, set查找打开] = useState(false)
  const 查找位置 = useRef({ 关键词: '', 区分大小写: false, html: '', 序号: -1 })
  const [导航打开, set导航打开] = useState(false)
  const [网格打开, set网格打开] = useState(false)
  const [文献面板打开, set文献面板打开] = useState(false)
  const [比较面板打开, set比较面板打开] = useState(false)
  const [翻译面板打开, set翻译面板打开] = useState(false)
  const [邮件合并面板打开, set邮件合并面板打开] = useState(false)
  const [文献列表, set文献列表] = useState<文献[]>([])
  const [内容版本, set内容版本] = useState(0)
  const [打印预览, set打印预览] = useState<{ 内容: string; 标题: string } | null>(null)

  // Ctrl+滚轮缩放页面内容，与状态栏的缩放按钮共用同一个视图状态
  use滚轮缩放(视图.缩放, (值) => set视图((当前) => ({ ...当前, 缩放: 值 })), 文字缩放范围)
  /** 右键菜单状态 */
  const [菜单可见, set菜单可见] = useState(false)
  const [菜单坐标, set菜单坐标] = useState({ x: 0, y: 0 })

  /** 关闭右键菜单 */
  const 关闭菜单 = (): void => {
    set菜单可见(false)
  }

  /** 构建文字编辑器的右键菜单项 */
  const 构建文字菜单 = (): 菜单节点[] => [
    { type: 'item', commandId: 'clipboard.paste', label: '粘贴', shortcut: 'Ctrl+V' },
    { type: 'item', commandId: 'clipboard.cut', label: '剪切', shortcut: 'Ctrl+X' },
    { type: 'item', commandId: 'clipboard.copy', label: '复制', shortcut: 'Ctrl+C' },
    { type: 'divider' },
    { type: 'group', 标题: '格式', 子项: [
      { type: 'item', commandId: 'clipboard.formatPainter', label: '格式刷' },
      { type: 'divider' },
      { type: 'item', commandId: 'font.bold', label: '加粗', shortcut: 'Ctrl+B' },
      { type: 'item', commandId: 'font.italic', label: '斜体', shortcut: 'Ctrl+I' },
      { type: 'item', commandId: 'font.underline', label: '下划线', shortcut: 'Ctrl+U' },
      { type: 'item', commandId: 'font.strike', label: '删除线' },
      { type: 'divider' },
      { type: 'item', commandId: 'para.bullet', label: '项目符号' },
      { type: 'item', commandId: 'para.number', label: '编号' },
      { type: 'item', commandId: 'para.indentDecrease', label: '减少缩进', shortcut: 'Shift+Tab' },
      { type: 'item', commandId: 'para.indentIncrease', label: '增加缩进', shortcut: 'Tab' },
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
    { type: 'item', commandId: 'comment.new', label: '插入批注' },
    { type: 'item', commandId: 'link.insert', label: '超链接', shortcut: 'Ctrl+K' },
    { type: 'divider' },
    { type: 'item', commandId: 'font.clear', label: '清除格式' },
    ...构建颜色菜单组(),
    { type: 'divider' },
    ...构建AI菜单组(),
  ]

  const 编辑区引用 = useRef<HTMLDivElement | null>(null)
  const 历史表 = useRef<Map<string, HistoryStack>>(new Map())
  const 内部写入内容 = useRef<Map<string, string>>(new Map())
  const 输入计时器 = useRef<number | null>(null)
  const 已提示导入警告 = useRef<Set<string>>(new Set())
  /** 格式刷暂存；使用稳定对象以便命令读写同一份状态 */
  const 格式刷容器 = useRef<{ 值: 选区格式 | null }>({ 值: null })
  /** 下拉浮层打开前的选区快照，供格式化命令恢复选区后再执行 */
  const 选区快照 = useRef<Range | null>(null)
  const 待输入字号 = useRef<number | null>(null)
  const 格式编辑区 = useRef<HTMLElement | null>(null)
  const 格式操作中 = useRef(false)
  const 页面视图引用 = useRef(视图)
  const 页面设置引用 = useRef<文字页面设置 | undefined>(undefined)
  页面视图引用.current = 视图
  const [选区显示格式, set选区显示格式] = useState({ 字体: '宋体', 字号: '五号', 加粗: false, 斜体: false, 下划线: false, 删除线: false })
  /** 右键菜单打开时的选中文本，供颜色与 AI 菜单项使用（菜单点击会改变焦点） */
  const 右键选区文本 = useRef('')

  const 当前文档 = documents.find((项) => 项.id === activeDocumentId) ?? null
  const 文档标识 = 当前文档?.id ?? ''
  页面设置引用.current = 当前文档?.页面设置
  const 当前文档标识引用 = useRef(文档标识)
  当前文档标识引用.current = 文档标识

  useEffect(() => {
    格式编辑区.current = null
    待输入字号.current = null
    选区快照.current = null
    set视图((当前) => ({ ...当前, 缩放: 默认文件缩放, ...提取页面设置(默认视图), 原始纸张: undefined, 原始页边距: undefined, 页眉Html: undefined, 页脚Html: undefined, ...(当前文档?.页面设置 ?? {}) }))
  }, [文档标识])

  // 助手等外部更新直接写入状态层；把新内容加入当前文档历史，保留撤销入口。
  useEffect(() => {
    if (!当前文档 || !文档标识) return
    const 已由编辑器写入 = 内部写入内容.current.get(文档标识)
    if (已由编辑器写入 === 当前文档.html) return
    const 历史 = 历史表.current.get(文档标识) ?? 新文字历史(() => 页面设置引用.current)
    if (!历史表.current.has(文档标识)) 历史表.current.set(文档标识, 历史)
    if (输入计时器.current !== null) {
      window.clearTimeout(输入计时器.current)
      输入计时器.current = null
    }
    if (已由编辑器写入 !== undefined && 历史.current()?.html !== 已由编辑器写入) {
      历史.record({ html: 已由编辑器写入, selection: null })
    }
    if (历史.current()?.html !== 当前文档.html) 历史.record({ html: 当前文档.html, selection: null })
    内部写入内容.current.set(文档标识, 当前文档.html)
  }, [当前文档?.html, 文档标识])

  useEffect(() => {
    const 现有标识 = new Set(documents.map((项) => 项.id))
    for (const 标识 of 已提示导入警告.current) {
      if (!现有标识.has(标识)) {
        已提示导入警告.current.delete(标识)
      }
    }
  }, [documents])

  const 展示导入警告 = (警告: string[]) => {
    modal.warning({
      title: '文档内容可能未完整导入',
      content: React.createElement('div', null,
        React.createElement('p', null, '本文件的部分内容无法完整导入。为保护原文件，请通过另存为保存副本。'),
        React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
      ),
      okText: '我知道了',
    })
  }

  useEffect(() => {
    if (当前文档?.警告?.length && !已提示导入警告.current.has(当前文档.id)) {
      已提示导入警告.current.add(当前文档.id)
      展示导入警告(当前文档.警告)
    }
  }, [当前文档?.id, 当前文档?.警告])

  const 当前保真风险 = 当前文档?.来源路径 && 当前文档.警告?.length
    ? { 来源路径: 当前文档.来源路径, 警告: 当前文档.警告 }
    : null

  /** 查询格式化指令的开关状态，jsdom 等环境不支持时返回 false */
  const 查询状态 = (指令: string): boolean => {
    try {
      return document.queryCommandState(指令)
    } catch {
      return false
    }
  }

  /** 查询格式化指令的取值，不支持时返回空字符串 */
  const 查询取值 = (指令: string): string => {
    try {
      return String(document.queryCommandValue(指令) ?? '')
    } catch {
      return ''
    }
  }

  const 取历史 = (): HistoryStack => {
    const 已有 = 历史表.current.get(文档标识)
    if (已有 !== undefined) {
      return 已有
    }
    const 新栈 = 新文字历史(() => 页面设置引用.current)
    历史表.current.set(文档标识, 新栈)
    return 新栈
  }

  const 刷新 = () => set内容版本((值) => 值 + 1)

  const 记录历史 = (): void => {
    if (输入计时器.current !== null) { window.clearTimeout(输入计时器.current); 输入计时器.current = null }
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    取历史().record({ html: 元素.innerHTML, selection: null, 页面设置: 页面设置引用.current ?? null })
  }

  const 同步内容 = (): void => {
    const 元素 = 编辑区引用.current
    if (元素 !== null && 文档标识.length > 0) {
      内部写入内容.current.set(文档标识, 元素.innerHTML)
      updateEditorHtml(文档标识, 元素.innerHTML)
    }
  }

  useEffect(() => {
    查找位置.current = { 关键词: '', 区分大小写: false, html: '', 序号: -1 }
    清除搜索高亮()
    return 清除搜索高亮
  }, [查找打开, 文档标识, 当前文档?.html])

  const 执行查找 = (关键词: string, 区分大小写: boolean, 方向 = 1) => {
    const 根 = 编辑区引用.current
    if (!根) return { 总数: 0, 当前位置: 0 }
    const 命中 = 查找文字(根, 关键词, 区分大小写), 旧 = 查找位置.current
    const 连续 = 旧.关键词 === 关键词 && 旧.区分大小写 === 区分大小写 && 旧.html === 根.innerHTML
    const 序号 = 命中.length ? ((连续 ? 旧.序号 : 方向 === 1 ? -1 : 0) + 方向 + 命中.length) % 命中.length : -1
    查找位置.current = { 关键词, 区分大小写, html: 根.innerHTML, 序号 }
    高亮搜索(命中, 命中[序号])
    if (序号 >= 0) { 定位文字(根, 命中[序号]); 选区快照.current = 命中[序号].cloneRange() }
    return { 总数: 命中.length, 当前位置: 序号 + 1 }
  }

  const 取格式编辑区 = (): HTMLElement | null => {
    const 正文 = 编辑区引用.current
    if (!正文) return null
    const 纸张 = 正文.closest('.wps-editor-canvas__paper')
    const 范围 = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null
    const 区域 = [正文, ...(纸张?.querySelectorAll<HTMLElement>('.wps-editor-canvas__header,.wps-editor-canvas__footer') ?? [])]
    const 选中区域 = 范围 && 区域.find(x => x.contains(范围.startContainer) && x.contains(范围.endContainer))
    if (选中区域) 格式编辑区.current = 选中区域
    return 格式编辑区.current && 区域.includes(格式编辑区.current) ? 格式编辑区.current : 正文
  }

  const 同步格式区域 = (元素: HTMLElement): void => {
    if (元素 === 编辑区引用.current) { 同步内容(); return }
    const 字段 = 元素.classList.contains('wps-editor-canvas__header') ? '页眉Html' : '页脚Html'
    const 下一个 = { ...页面视图引用.current, [字段]: 元素.innerHTML || undefined }
    页面视图引用.current = 下一个
    页面设置引用.current = 提取页面设置(下一个)
    set视图(下一个)
    if (文档标识) 更新文字页面设置(文档标识, 提取页面设置(下一个))
  }

  useEffect(() => {
    const 更新格式 = () => {
      const 根 = 取格式编辑区()
      const 选择 = window.getSelection()
      if (!根 || !选择?.anchorNode || !根.contains(选择.anchorNode)) return
      const 磅值 = 待输入字号.current ?? 读取字号磅值(根)
      const 节点 = 选择.anchorNode instanceof HTMLElement ? 选择.anchorNode : 选择.anchorNode.parentElement
      const 字体 = 节点 ? getComputedStyle(节点).fontFamily.split(',')[0].replace(/["']/g, '').trim() : '宋体'
      const 新格式 = { 字体, 字号: 中文字号表.find(x => Math.abs(x.磅值 - 磅值) < 0.02)?.名称 ?? `${Math.round(磅值 * 100) / 100}`,
        加粗: 安全查询格式('bold'), 斜体: 安全查询格式('italic'), 下划线: 安全查询格式('underline'), 删除线: 安全查询格式('strikeThrough') }
      set选区显示格式(旧 => JSON.stringify(旧) === JSON.stringify(新格式) ? 旧 : 新格式)
    }
    const 重置输入字号 = (事件: Event) => {
      if (!(事件.target instanceof Node) || !编辑区引用.current?.closest('.wps-editor-canvas__paper')?.contains(事件.target)) return
      if (事件 instanceof KeyboardEvent && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'].includes(事件.key)) return
      待输入字号.current = null
    }
    更新格式()
    document.addEventListener('selectionchange', 更新格式)
    document.addEventListener('mousedown', 重置输入字号, true)
    document.addEventListener('keydown', 重置输入字号, true)
    return () => { document.removeEventListener('selectionchange', 更新格式); document.removeEventListener('mousedown', 重置输入字号, true); document.removeEventListener('keydown', 重置输入字号, true) }
  }, [文档标识, 内容版本])

  const 执行格式化 = (指令: string, 值?: string): void => {
    if (视图.文档保护 && !['copy', 'selectAll'].includes(指令)) { message.info('文档已保护，请先解除保护'); return }
    const 元素 = 取格式编辑区()
    if (元素 === null) {
      return
    }
    // 先尝试恢复下拉浮层打开前保存的选区；未恢复成功时再退回普通聚焦。
    // 缺少这一步时，浮层抢焦点已折叠选区，focus() 又把光标重置到起始位置，
    // 导致 foreColor 等命令只影响后续输入而非选中文字。
    if (!恢复选区(元素, 选区快照.current)) {
      元素.focus({ preventScroll: true })
    }
    记录历史()
    格式操作中.current = true
    try { if (指令 === 'fontSizePt') {
      const 磅值 = Number(值)
      if (Number.isFinite(磅值) && 磅值 > 0) 待输入字号.current = 应用精确字号(元素, 磅值) ? null : 磅值
    } else {
      document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(指令, false, 值)
    } } finally { 格式操作中.current = false }
    // 快照已消费，避免后续命令误用过期选区
    选区快照.current = null
    同步格式区域(元素)
    记录历史()
  }

  const 插入内容 = (html: string): void => {
    if (视图.文档保护) { message.info('文档已保护，请先解除保护'); return }
    const 元素 = 取格式编辑区()
    if (元素 === null) {
      return
    }
    记录历史()
    if (!恢复选区(元素, 选区快照.current)) 元素.focus({ preventScroll: true })
    选区快照.current = null
    // 修订模式下把插入内容标记为修订，便于后续接受或拒绝
    const 实际内容 = 视图.修订模式 ? `<span class="wps-insert">${html}</span>` : html
    格式操作中.current = true
    try { document.execCommand('insertHTML', false, 实际内容) } finally { 格式操作中.current = false }
    同步格式区域(元素)
    记录历史()
  }

  const 选择图片 = (): void => {
    const 目标文档标识 = 文档标识
    const 原编辑区 = 编辑区引用.current
    const 插入位置 = 原编辑区 ? 保存选区(原编辑区) : null
    const 输入 = document.createElement('input')
    输入.type = 'file'
    输入.accept = 'image/png,image/jpeg,image/gif,image/bmp,.png,.jpg,.jpeg,.gif,.bmp'
    输入.onchange = () => {
      const 文件 = 输入.files?.[0]
      if (文件 === undefined) {
        return
      }
      const 目标编辑区 = 编辑区引用.current
      const 正文样式 = 目标编辑区 ? window.getComputedStyle(目标编辑区) : null
      const 栏数 = 正文样式 ? Math.max(1, parseInt(正文样式.columnCount) || 1) : 1
      const 栏间距 = 正文样式 && 栏数 > 1 ? parseFloat(正文样式.columnGap) : 0
      const 可用宽 = 目标编辑区 ? (目标编辑区.clientWidth - 栏间距 * (栏数 - 1)) / 栏数 : 0
      if (!可用宽) {
        modal.error({ title: '图片插入失败', content: '未能获取正文可用宽度，请返回文档后重新插入。', okText: '确定' })
        return
      }
      void 读取插入图片(文件, 可用宽).then((html) => {
        const 编辑区 = 编辑区引用.current
        if (当前文档标识引用.current !== 目标文档标识 || !编辑区?.isConnected || 编辑区 !== 原编辑区) throw new Error('当前文档已经切换，请在目标文档中重新插入图片')
        if (编辑区.contentEditable === 'false') throw new Error('当前文档处于只读状态，无法插入图片')
        if (插入位置 && !恢复选区(编辑区, 插入位置)) throw new Error('原插入位置已改变，请重新选择插入位置')
        if (!插入位置) {
          const 范围 = document.createRange()
          范围.selectNodeContents(编辑区)
          范围.collapse(false)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(范围)
        }
        插入内容(html)
      }).catch((错误) => { modal.error({ title: '图片插入失败', content: 错误 instanceof Error ? 错误.message : '图片读取失败', okText: '确定' }) })
    }
    输入.click()
  }

  const 仅供网页或Pdf = (名称: string, 继续插入: () => void): void => {
    modal.confirm({
      title: `${名称}无法保存为 DOCX`,
      content: `当前版本可在编辑区预览${名称}并导出网页或 PDF，但无法把它写入 DOCX。插入后，保存 DOCX 会被阻止以避免内容丢失。`,
      okText: '仍要插入',
      cancelText: '取消',
      onOk: 继续插入,
    })
  }

  const 提示不可用插入项 = (名称: string): void => {
    modal.warning({
      title: `${名称}暂不可用`,
      content: `当前版本尚无法创建并完整保存${名称}。文档内容未修改。`,
      okText: '确定',
    })
  }

  const 插入资源 = (类型: InsertableKind): void => {
    switch (类型) {
      case '页眉':
      case '页脚': {
        const 键 = 类型 === '页眉' ? '页眉Html' : '页脚Html'
        const 当前 = 视图[键] ?? ''
        const 解析容器 = document.createElement('div')
        解析容器.innerHTML = 当前
        let 输入 = 解析容器.textContent ?? ''
        modal.confirm({
          title: `编辑${类型}`,
          content: React.createElement('textarea', {
            defaultValue: 输入,
            rows: 4,
            style: { width: '100%' },
            onChange: (事件: React.ChangeEvent<HTMLTextAreaElement>) => { 输入 = 事件.target.value },
          }),
          okText: '应用', cancelText: '取消',
          onOk: () => {
            const 安全 = 输入.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[字符] ?? 字符)
            const 下一个 = { ...视图, [键]: 安全 ? `<p>${安全}</p>` : undefined }
            set视图(下一个)
            if (文档标识) 更新文字页面设置(文档标识, 提取页面设置(下一个))
          },
        })
        break
      }
      case '封面':
        插入内容(封面模板())
        break
      case '空白页':
        插入内容('<div class="wps-page-break"></div><p><br></p>')
        break
      case '分页符':
        插入内容('<div class="wps-page-break"></div>')
        break
      case '表格':
        插入内容(表格模板())
        break
      case '图片':
        选择图片()
        break
      case '形状':
        仅供网页或Pdf('形状', () => 插入内容('<div style="width:160px;height:80px;border:1.6px solid #2B6CF6;border-radius:6px"></div><p><br></p>'))
        break
      case '文本框':
        仅供网页或Pdf('文本框', () => 插入内容('<div style="border:1px solid #E8EBF0;padding:8px 10px;border-radius:6px">文本框内容</div><p><br></p>'))
        break
      case '艺术字':
        插入内容('<p style="font-size:28px;font-weight:700;color:#2B6CF6">艺术字</p>')
        break
      case '日期时间': {
        const 当前时间 = new Date()
        const 文本 = `${当前时间.getFullYear()} 年 ${当前时间.getMonth() + 1} 月 ${当前时间.getDate()} 日`
        插入内容(文本)
        break
      }
      case '符号':
        插入内容('※')
        break
      case '超链接':
        提示不可用插入项('超链接')
        break
      case '书签':
        提示不可用插入项('书签')
        break
      case '脚注':
        提示不可用插入项('脚注')
        break
      case '尾注':
        提示不可用插入项('尾注')
        break
      default:
        提示不可用插入项(类型)
        break
    }
  }

  const 设置段落样式 = (样式: {
    lineHeight?: string
    textAlign?: string
    backgroundColor?: string
  }): void => {
    const 元素 = 取格式编辑区()
    if (元素 === null) {
      return
    }
    // 行距与底纹同样经下拉触发，需先恢复选区再定位目标段落
    恢复选区(元素, 选区快照.current)
    选区快照.current = null

    const 目标 = 选区覆盖的段落(元素)
    if (目标.length === 0) {
      message.info('请先将光标置于段落中')
      return
    }
    记录历史()
    目标.forEach((块) => {
      if (样式.lineHeight !== undefined) delete 块.dataset.sealLineRule
      Object.assign(块.style, 样式)
    })
    同步格式区域(元素)
    记录历史()
  }

  const 应用样式 = (样式名: string): void => {
    if (样式名 === '正文') {
      执行格式化('formatBlock', 'p')
      return
    }
    const 级别 = 样式名.replace('标题 ', '')
    执行格式化('formatBlock', `h${级别}`)
  }

  const 导出 = (格式: 'html' | 'text'): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    const 文档名 = 当前文档?.name ?? '未命名文档.docx'
    const 标题 = 文档名.replace(/\.[^.]+$/, '')
    if (格式 === 'html') {
      下载文本(导出为Html(标题, 元素.innerHTML), 生成文件名(文档名, 'html'), 'text/html')
    } else {
      下载文本(导出为文本(元素.innerHTML), 生成文件名(文档名, 'txt'), 'text/plain')
    }
    message.success('已导出文件')
  }

  const 检查拼写 = (): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    const 问题列表 = 检查文本(元素.textContent ?? '')
    if (问题列表.length === 0) {
      message.success('未发现明显的拼写问题')
      return
    }
    message.warning(
      `发现 ${问题列表.length} 处可疑内容，首处为「${问题列表[0].片段}」：${问题列表[0].建议}`
    )
  }

  const 切换全选 = (): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    const 范围 = document.createRange()
    范围.selectNodeContents(元素)
    const 选区 = window.getSelection()
    选区?.removeAllRanges()
    选区?.addRange(范围)
  }

  /** 在选区所在段落上切换类名；无明确选区时作用于全部段落 */
  const 切换段落类名 = (类名: string): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    const 选区 = window.getSelection()
    let 块: HTMLElement | null = null
    if (选区 !== null && 选区.anchorNode !== null) {
      let 节点: Node | null = 选区.anchorNode
      while (节点 !== null && 节点 !== 元素) {
        if (节点 instanceof HTMLElement && /^(P|H[1-6]|DIV|LI)$/.test(节点.tagName)) {
          块 = 节点
          break
        }
        节点 = 节点.parentNode
      }
    }
    记录历史()
    if (块 === null) {
      元素.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((项) => 项.classList.toggle(类名))
    } else {
      块.classList.toggle(类名)
    }
    同步内容()
  }

  const 读取选区格式 = (): 选区格式 => ({
    加粗: 查询状态('bold'),
    斜体: 查询状态('italic'),
    下划线: 查询状态('underline'),
    字体: 查询取值('fontName'),
    字号: String(读取字号磅值(取格式编辑区()!)),
    颜色: 查询取值('foreColor'),
  })

  const 应用选区格式 = (格式: 选区格式): void => {
    const 元素 = 取格式编辑区()
    if (元素 === null) {
      return
    }
    // 与 执行格式化 同理：优先恢复选区，否则格式刷会作用到光标而非选中文字
    if (!恢复选区(元素, 选区快照.current)) {
      元素.focus({ preventScroll: true })
    }
    选区快照.current = null
    格式操作中.current = true
    try {
    document.execCommand('styleWithCSS', false, 'true')
    if (格式.加粗 !== 查询状态('bold')) {
      document.execCommand('bold')
    }
    if (格式.斜体 !== 查询状态('italic')) {
      document.execCommand('italic')
    }
    if (格式.下划线 !== 查询状态('underline')) {
      document.execCommand('underline')
    }
    if (格式.字体.length > 0) {
      document.execCommand('fontName', false, 格式.字体)
    }
    if (格式.字号.length > 0) {
      const 磅值 = Number(格式.字号)
      待输入字号.current = 应用精确字号(元素, 磅值) ? null : 磅值
    }
    if (格式.颜色.length > 0) {
      document.execCommand('foreColor', false, 格式.颜色)
    }
    } finally { 格式操作中.current = false }
    同步格式区域(元素)
    记录历史()
  }

  const 上下文: CommandContext = {
    root: 编辑区引用.current ?? document.createElement('div'),
    history: 取历史(),
    refresh: 刷新,
    notify: (文本: string) => {
      if (文本 === '文件已保存' || 文本 === '文件已另存为') message.info({ content: 文本, key: `document-save-${文档标识}` })
      else message.info(文本)
    },
    view: 视图,
    setView: (部分) => {
      const 下一个 = { ...视图, ...部分 }
      if (部分.纸张 !== undefined) 下一个.原始纸张 = undefined
      if (部分.页边距 !== undefined) 下一个.原始页边距 = undefined
      页面视图引用.current = 下一个
      if (布局字段.some((字段) => Object.prototype.hasOwnProperty.call(部分, 字段))) 页面设置引用.current = 提取页面设置(下一个)
      set视图(下一个)
      if (文档标识 && 布局字段.some((字段) => Object.prototype.hasOwnProperty.call(部分, 字段))) {
        更新文字页面设置(文档标识, 提取页面设置(下一个))
      }
      set内容版本((值) => 值 + 1)
    },
    执行格式化,
    查询格式: (指令: string) => {
      if (指令 === 'fontSizePt') return String(待输入字号.current ?? 读取字号磅值(取格式编辑区()!))
      try {
        return String(document.queryCommandValue(指令) ?? '')
      } catch {
        return ''
      }
    },
    应用内容: (html: string, _选区) => {
      const 元素 = 编辑区引用.current
      if (元素 === null) {
        return
      }
      元素.innerHTML = html
      const 页面快照 = 取历史().current()?.页面设置 as 文字页面设置 | null | undefined
      if (页面快照 !== undefined) {
        const 下一个 = { ...页面视图引用.current, ...提取页面设置(默认视图), ...(页面快照 ?? {}) }
        页面视图引用.current = 下一个
        页面设置引用.current = 页面快照 ?? undefined
        set视图(下一个)
        if (文档标识) 更新文字页面设置(文档标识, 页面快照 ?? undefined)
      }
      同步内容()
    },
    插入内容,
    读取内容: () => 编辑区引用.current?.innerHTML ?? '',
    准备保存内容: () => {
      const 根 = 编辑区引用.current
      if (!根 || 当前文档标识引用.current !== 文档标识) throw new Error('当前文档已切换，请在目标文档中重新保存')
      const 内容 = 准备图片保存内容(根)
      同步内容()
      return 内容
    },
    下载: (内容: string, 文件名: string, 类型: string) => 下载文本(内容, 文件名, 类型),
    打开查找: () => set查找打开(true),
    导出,
    检查拼写,
    切换全选,
    插入资源,
    确认仅供网页或Pdf: 仅供网页或Pdf,
    设置段落样式,
    应用样式,
    切换段落类名,
    读取选区格式,
    应用选区格式,
    格式刷暂存: 格式刷容器.current,
    当前文档名: 当前文档?.name ?? '未命名文档',
    当前文档路径: 文档路径[文档标识] ?? null,
    当前文件指纹: 当前文档?.文件指纹,
    打开新文档: (类型, 内容, 路径, 警告, 页面设置, 文件指纹) => createDoc(类型, 内容, { 路径, 警告, 页面设置, 文件指纹 }),
    显示文件错误: (标题, 内容) => modal.error({ title: 标题, content: 内容 }),
    检查保存路径: (路径) => {
      const 占用 = 查找保存路径占用(文档标识, 路径)
      if (!占用) return true
      modal.warning({
        title: '目标文件已在其他标签打开',
        content: `「${占用.name}」正在使用该路径。请先关闭对应标签，或选择其他保存位置。`,
        okText: '确定',
      })
      return false
    },
    保真风险: 当前保真风险,
    提示保真风险: (警告: string[]) => {
      modal.warning({
        title: '已阻止覆盖来源文件',
        content: React.createElement('div', null,
          React.createElement('p', null, '当前版本无法完整保留此文件的内容。请通过另存为保存到不同路径。'),
          React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
        ),
        okText: '我知道了',
      })
    },
    确认保真另存: (警告: string[]) => new Promise<boolean>((完成) => {
      modal.confirm({
        title: '确认保存副本',
        content: React.createElement('div', null,
          React.createElement('p', null, '部分内容未完整导入，保存的副本可能缺少以下内容：'),
          React.createElement('ul', null, 警告.map((项, 序号) => React.createElement('li', { key: 序号 }, 项)))
        ),
        okText: '保存副本',
        cancelText: '取消',
        onOk: () => 完成(true),
        onCancel: () => 完成(false),
      })
    }),
    设置文档路径: (路径: string, 已保存内容?: string, 文件指纹?: string, 页面设置快照?: 文字页面设置) => {
      markDocumentSaved(文档标识, 已保存内容 ?? 编辑区引用.current?.innerHTML ?? '', undefined, { 页面设置: 页面设置快照 })
      if (文件指纹) 更新文件指纹(文档标识, 文件指纹)
      set文档路径(文档标识, 路径)
      // 保存成功后计入最近文档，按扩展名归类。
      记录最近文档(路径, 基准文件名(路径), 扩展转类型(路径))
    },
    打开表格网格: () => set网格打开(true),
    打开文献管理: () => set文献面板打开(true),
    打开比较面板: () => set比较面板打开(true),
    打开翻译面板: () => set翻译面板打开(true),
    打开邮件合并面板: () => set邮件合并面板打开(true),
    切换导航窗格: () => set导航打开((当前) => !当前),
    文献列表,
  }

  const 执行命令 = (命令标识: string, 参数?: string): void => {
    if (视图.文档保护 && 修改正文命令(命令标识)) { message.info('文档已保护，请先解除保护'); return }
    if (输入计时器.current !== null) 记录历史()
    if (命令标识 === 'file.print') {
      const 正文 = 编辑区引用.current?.innerHTML
      if (!正文) { message.warning('文档为空，无法打印'); return }
      const 名称 = 当前文档?.name ?? '未命名文档'
      set打印预览({ 内容: 导出为Html(名称, 正文, 视图.页眉Html, 视图.页脚Html), 标题: 名称 })
      return
    }
    const 命令 = 命令表[命令标识]
    if (命令 === undefined) {
      modal.error({ title: '操作失败', content: '该功能未正确加载，请重新打开文档后重试。', okText: '确定' })
      return
    }
    if (!['edit.undo', 'edit.redo'].includes(命令标识)) 记录历史()
    if (命令标识 === 'file.save' || 命令标识 === 'file.saveAs') 同步内容()
    命令.run(上下文, 参数)
    if (!['edit.undo', 'edit.redo'].includes(命令标识)) { 记录历史(); 同步内容() }
  }

  // 键盘快捷键层：补齐文字编辑快捷键（右键菜单与帮助手册中均已标注）。
  // 处理器经引用间接调用，确保监听器只挂载一次的同时始终使用最新闭包状态。
  const 快捷键处理引用 = useRef<(事件: KeyboardEvent) => void>(() => {})
  快捷键处理引用.current = (事件: KeyboardEvent) => {
    if (事件.key === 'F3') {
      事件.preventDefault(); set查找打开(true)
      const 查询 = 查找位置.current
      if (查询.关键词) 执行查找(查询.关键词, 查询.区分大小写, 事件.shiftKey ? -1 : 1)
      return
    }
    if (!(事件.ctrlKey || 事件.metaKey)) {
      return
    }
    const 目标 = 事件.target as HTMLElement | null
    const 在输入框 = 目标 !== null && (目标.tagName === 'INPUT' || 目标.tagName === 'TEXTAREA')
    const 小写键 = 事件.key.toLowerCase()
    // 查找面板等输入框内只放行保存，格式类快捷键不作用于输入文字
    if (在输入框 && 小写键 !== 's' && 小写键 !== 'p') {
      return
    }
    switch (小写键) {
      case 'p':
        事件.preventDefault()
        执行命令('file.print')
        break
      case 'b':
        事件.preventDefault()
        执行命令('font.bold')
        break
      case 'i':
        事件.preventDefault()
        执行命令('font.italic')
        break
      case 'u':
        事件.preventDefault()
        执行命令('font.underline')
        break
      case 'z':
        事件.preventDefault()
        执行命令('edit.undo')
        break
      case 'y':
        事件.preventDefault()
        执行命令('edit.redo')
        break
      case 'a':
        事件.preventDefault()
        执行命令('edit.selectAll')
        break
      case 'f':
      case 'h':
        事件.preventDefault()
        set查找打开(true)
        break
      case 'e':
        事件.preventDefault()
        执行命令('para.alignCenter')
        break
      case 'l':
        事件.preventDefault()
        执行命令('para.alignLeft')
        break
      case 'r':
        事件.preventDefault()
        执行命令('para.alignRight')
        break
      case 'j':
        事件.preventDefault()
        执行命令('para.alignJustify')
        break
      case 's':
        事件.preventDefault()
        执行命令('file.save')
        break
      default:
        if (事件.key === 'Enter' && !在输入框) {
          // Ctrl+Enter 插入分页符
          事件.preventDefault()
          执行命令('layout.break')
        } else if (事件.key === 'Home' && !在输入框) {
          事件.preventDefault()
          编辑区引用.current?.scrollIntoView({ block: 'start' })
        } else if (事件.key === 'End' && !在输入框) {
          事件.preventDefault()
          const 元素 = 编辑区引用.current
          if (元素 !== null) {
            const 末段 = 元素.lastElementChild
            if (末段 !== null) 末段.scrollIntoView({ block: 'end' })
            else 元素.scrollIntoView({ block: 'end' })
          }
        }
    }
  }
  useEffect(() => {
    const 监听 = (事件: KeyboardEvent) => 快捷键处理引用.current(事件)
    document.addEventListener('keydown', 监听)
    return () => document.removeEventListener('keydown', 监听)
  }, [])

  const 文本内容 = (() => {
    void 内容版本
    return 编辑区引用.current?.textContent ?? ''
  })()
  const 统计 = countWords(文本内容)
  const 页数 = Math.max(1, Math.ceil(统计.词数 / 500))

  // 选区浮窗：选中正文后浮出格式与 AI 快捷动作，不抢焦点、滚动即收起
  const 取选区文本 = (): string => {
    const 选择 = window.getSelection()
    const 元素 = 编辑区引用.current
    if (!选择 || !元素 || 选择.rangeCount === 0) return ''
    if (选择.anchorNode && !元素.contains(选择.anchorNode)) return ''
    return 选择.toString()
  }
  const 处理菜单命令 = (命令标识: string): boolean => {
    // 右键菜单点击会改变焦点，颜色与 AI 动作都要用“打开菜单那一刻”的选区
    const 快照文本 = 右键选区文本.current
    if (处理颜色菜单命令(命令标识, 执行格式化)) return true
    return 处理AI菜单命令(命令标识, () => 快照文本 || 取选区文本())
  }

  const 选区浮窗 = use选区浮窗({
    容器: 编辑区引用,    取按钮: () => 构建文字浮窗按钮({
      执行命令,
      执行格式化,
      取选区文本,
      // 个别运行环境不提供格式查询接口，取不到时按未生效处理，避免浮窗因异常不显示
      读取格式: () => ({
        加粗: 安全查询格式('bold'),
        斜体: 安全查询格式('italic'),
        下划线: 安全查询格式('underline'),
        删除线: 安全查询格式('strikeThrough'),
      }),
    }).map(项 => ({ ...项, 禁用: 视图.文档保护 && 修改正文命令(项.id) })),
  })

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(RibbonTabs, { activeKey: 当前标签, onChange: set当前标签 }),
    React.createElement(RibbonPanel, {
      activeKey: 当前标签,
      缩放: 视图.缩放,
      onCommand: 执行命令,
      获取禁用态: (标识: string) => 视图.文档保护 && 修改正文命令(标识),
      获取禁用原因: (标识: string) => 视图.文档保护 && 修改正文命令(标识) ? '文档已保护，请先解除保护' : undefined,
      获取当前值: (标识: string) => 标识 === 'font.name' ? 选区显示格式.字体 : 标识 === 'font.size' ? 选区显示格式.字号 : undefined,
      // 浮层打开瞬间抓取选区，此时尚未被浮层折叠
      onDropdownOpen: () => {
        选区浮窗.关闭()
        const 元素 = 取格式编辑区()
        选区快照.current = 元素 === null ? null : 保存选区(元素)
      },
      获取激活态: (命令标识: string) => {
        if (命令标识 === 'font.bold') return 选区显示格式.加粗
        if (命令标识 === 'font.italic') return 选区显示格式.斜体
        if (命令标识 === 'font.underline') return 选区显示格式.下划线
        if (命令标识 === 'font.strike') return 选区显示格式.删除线
        if (命令标识 === 'track.enable') {
          return 视图.修订模式
        }
        if (命令标识 === 'comment.show') {
          return 视图.显示批注
        }
        if (命令标识 === 'protect.start') {
          return 视图.文档保护
        }
        if (命令标识 === 'view.ruler') {
          return 视图.标尺
        }
        if (命令标识 === 'view.gridlines') {
          return 视图.网格线
        }
        if (命令标识 === 'view.paragraphMark') {
          return 视图.段落标记
        }
        if (命令标识 === 'view.navigation') {
          return 导航打开
        }
        return false
      },
    }),
    查找打开
      ? React.createElement(FindReplacePanel, {
          open: 查找打开,
          onClose: () => set查找打开(false),
          onQueryChange: () => { 查找位置.current.序号 = -1; 清除搜索高亮() },
          getRoot: () => 编辑区引用.current,
          documentId: 文档标识,
          onPrevious: (关键词, 区分大小写) => 执行查找(关键词, 区分大小写, -1),
          onFind: (关键词: string, 区分大小写: boolean) => {
            return 执行查找(关键词, 区分大小写)
          },
          onReplace: (关键词: string, 替换为: string, 区分大小写: boolean) => {
            const 元素 = 编辑区引用.current
            if (元素 === null) {
              return 0
            }
            if (视图.文档保护) { message.info('文档已保护，不能替换'); return 0 }
            const 命中 = 查找文字(元素, 关键词, 区分大小写)
            const 旧 = 查找位置.current
            const 序号 = 旧.关键词 === 关键词 && 旧.区分大小写 === 区分大小写 && 旧.html === 元素.innerHTML && 旧.序号 >= 0 ? 旧.序号 : 0
            const 计数 = 命中[序号] ? 1 : 0
            if (计数 > 0) {
              记录历史()
              替换范围(命中[序号], 替换为)
              同步内容()
              记录历史()
              查找位置.current = { 关键词, 区分大小写, html: 元素.innerHTML, 序号: 序号 - 1 }
              执行查找(关键词, 区分大小写)
            }
            return 计数
          },
          onReplaceAll: (关键词: string, 替换为: string, 区分大小写: boolean) => {
            const 元素 = 编辑区引用.current
            if (元素 === null) {
              return 0
            }
            if (视图.文档保护) { message.info('文档已保护，不能替换'); return 0 }
            const 命中 = 查找文字(元素, 关键词, 区分大小写)
            const 计数 = 命中.length
            if (计数 > 0) {
              记录历史()
              for (const 范围 of 命中.reverse()) 替换范围(范围, 替换为)
              同步内容()
              记录历史()
              查找位置.current.序号 = -1
              清除搜索高亮()
            }
            return 计数
          },
        })
      : null,
    React.createElement(TableGridPicker, {
      open: 网格打开,
      onClose: () => set网格打开(false),
      onPick: (行数: number, 列数: number) => {
        set网格打开(false)
        const 表头 =
          '<tr>' +
          Array.from({ length: 列数 }, () => '<td style="border:1px solid #E8EBF0;padding:6px 8px">&nbsp;</td>').join('') +
          '</tr>'
        const 数据行 =
          '<tr>' +
          Array.from({ length: 列数 }, () => '<td style="border:1px solid #E8EBF0;padding:6px 8px">&nbsp;</td>').join('') +
          '</tr>'
        插入内容(
          `<table style="border-collapse:collapse;width:100%"><tbody>${表头}${数据行.repeat(Math.max(0, 行数 - 1))}</tbody></table><p><br></p>`
        )
        message.success(`已插入 ${行数} 行 ${列数} 列的表格`)
      },
    }),
    React.createElement(SourceManager, {
      open: 文献面板打开,
      sources: 文献列表,
      onClose: () => set文献面板打开(false),
      onChange: set文献列表,
    }),
    React.createElement(CompareDialog, {
      open: 比较面板打开,
      onClose: () => set比较面板打开(false),
      onCompare: (另一版本: string) => {
        const 元素 = 编辑区引用.current
        if (元素 === null) {
          return
        }
        const 差异 = 比较文本(抽取文本(元素.innerHTML), 抽取文本(另一版本))
        if (差异.length === 0) {
          message.warning('两个版本都没有可比较的内容')
          return
        }
        const 统计 = 统计差异(差异)
        message.info(`共比对 ${差异.length} 段，其中新增 ${统计.新增} 处、删除 ${统计.删除} 处`)
      },
      onMerge: (另一版本: string) => {
        const 元素 = 编辑区引用.current
        if (元素 === null) {
          return
        }
        const 差异 = 比较文本(抽取文本(元素.innerHTML), 抽取文本(另一版本))
        const html = 生成修订Html(差异)
        if (html.length === 0) {
          message.warning('没有可合并的差异')
          return
        }
        记录历史()
        元素.innerHTML = html
        同步内容()
        set比较面板打开(false)
        message.success('已合并为修订标记，可用接受修订或拒绝修订收敛')
      },
    }),
    React.createElement(TranslateDialog, {
      open: 翻译面板打开,
      onClose: () => set翻译面板打开(false),
    }),
    React.createElement(MailMergeDialog, {
      open: 邮件合并面板打开,
      templateHtml: 编辑区引用.current?.innerHTML ?? 当前文档?.html ?? '',
      onClose: () => set邮件合并面板打开(false),
      onGenerate: (html: string) => createDoc('word', html, { 名称: '邮件合并结果.docx' }),
    }),
    视图.标尺 ? React.createElement(Ruler, null) : null,
    React.createElement(
      'div',
      { className: 'wps-editor-workspace' },
      导航打开
        ? React.createElement(NavigationPane, {
            标题: 提取大纲(当前文档?.html ?? ''),
            onClose: () => set导航打开(false),
            onSelect: (序号: number) => {
              const 标题 = Array.from(编辑区引用.current?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])
                .filter((节点) => (节点.textContent ?? '').trim().length > 0)
              标题[序号]?.scrollIntoView({ block: 'start' })
            },
          })
        : null,
      React.createElement(
        'div',
        { className: 'wps-editor-stage' },
        React.createElement(EditorCanvas, {
        html: 当前文档?.html ?? '<p><br></p>',
        editable: !视图.文档保护,
        showParagraphMark: 视图.段落标记,
        gridlines: 视图.网格线,
        vertical: 视图.文字方向 === '竖排',
        showComments: 视图.显示批注,
        scale: 视图.缩放,
        paper: 视图.纸张,
        orientation: 视图.纸张方向,
        margin: 视图.页边距,
        columns: 视图.分栏,
        watermark: 视图.水印,
        pageBorder: 视图.页面边框,
        pageColor: 视图.页面颜色,
        customPaper: 视图.原始纸张,
        customMargin: 视图.原始页边距,
        headerHtml: 视图.页眉Html,
        footerHtml: 视图.页脚Html,
        onHeaderChange: (html: string) => {
          if (格式操作中.current) return
          记录历史()
          const 下一个 = { ...视图, 页眉Html: html || undefined }
          页面视图引用.current = 下一个
          页面设置引用.current = 提取页面设置(下一个)
          set视图(下一个)
          if (文档标识) 更新文字页面设置(文档标识, 提取页面设置(下一个))
          记录历史()
        },
        onFooterChange: (html: string) => {
          if (格式操作中.current) return
          记录历史()
          const 下一个 = { ...视图, 页脚Html: html || undefined }
          页面视图引用.current = 下一个
          页面设置引用.current = 提取页面设置(下一个)
          set视图(下一个)
          if (文档标识) 更新文字页面设置(文档标识, 提取页面设置(下一个))
          记录历史()
        },
        onReady: (元素: HTMLDivElement) => {
          编辑区引用.current = 元素
          取历史().record({ html: 元素.innerHTML, selection: null })
          if (文档标识) 内部写入内容.current.set(文档标识, 元素.innerHTML)
        },
        onChange: (html: string) => {
          if (文档标识.length > 0) {
            内部写入内容.current.set(文档标识, html)
            updateEditorHtml(文档标识, html)
          }
          // 输入停止 300 毫秒后记录一次历史，使撤销能回到输入前的状态
          if (输入计时器.current !== null) {
            window.clearTimeout(输入计时器.current)
          }
          输入计时器.current = window.setTimeout(() => {
            取历史().record({ html, selection: null })
            输入计时器.current = null
          }, 300)
          set内容版本((值) => 值 + 1)
        },
        onBeforeChange: (元素: HTMLDivElement) => {
          if (待输入字号.current !== null) 规范化字号标记(元素, 待输入字号.current)
        },
        onContextMenu: (x: number, y: number) => {
          // 记录选区与选中文本：菜单点击会改变焦点，命令需要据此恢复选区
          const 元素 = 编辑区引用.current
          选区快照.current = 元素 ? 保存选区(元素) : null
          右键选区文本.current = 取选区文本()
          set菜单坐标({ x, y })
          set菜单可见(true)
        },
        })
      )
    ),
    React.createElement(ImageTools, {
      编辑区: 编辑区引用,
      文档标识,
      只读: 视图.文档保护,
      开始修改: () => {
        if (输入计时器.current !== null) { window.clearTimeout(输入计时器.current); 输入计时器.current = null }
        记录历史()
      },
      完成修改: () => { 记录历史(); 同步内容(); 刷新() },
    }),
    React.createElement(ContextMenu, {
      open: 菜单可见,
      x: 菜单坐标.x,
      y: 菜单坐标.y,
      items: 构建文字菜单(),
      onCommand: (命令标识: string, 参数?: string) => {
        if (命令标识 === '__close__') {
          关闭菜单()
          return
        }
        // 颜色与 AI 快捷动作由本模块解析，其余仍走命令表
        if (处理菜单命令(命令标识)) {
          关闭菜单()
          return
        }
        执行命令(命令标识, 参数)
        关闭菜单()
      },
    }),
    React.createElement(SelectionFloatPanel, {
      打开: 选区浮窗.打开,
      位置: 选区浮窗.位置,
      按钮: 选区浮窗.按钮,
      on关闭: 选区浮窗.关闭,
      名称: '选中内容操作',
    }),
    React.createElement(EditorStatusBar, {
      页码: 1,
      总页数: 页数,
      字数: 统计.词数,
      缩放: 视图.缩放,
      视图模式: 视图.视图模式,
      on缩放变化: (值: number) => set视图((当前) => ({ ...当前, 缩放: 值 })),
    }),
    打印预览 ? React.createElement(PrintPreview, { 内容: 打印预览.内容, 格式: 'html', 标题: 打印预览.标题, onClose: () => set打印预览(null) }) : null
  )
}

export default DocEditor
