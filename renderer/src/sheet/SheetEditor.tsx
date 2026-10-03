// 表格编辑器容器：装配 Ribbon、名称框与公式栏、网格、工作表标签与状态栏。
import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  重算工作表,
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
import { 下载文本 } from '../editor/exportDoc'
import GridView from './GridView'
import SheetPagePreview from './SheetPagePreview'
import SheetValidationForm, { 创建验证草稿, type 验证草稿 } from './SheetValidationForm'
import { 应用工作表拼写建议, 扫描工作表拼写 } from './sheetSpell'
import SheetToolbar from './SheetToolbar'
import { SheetStatusBar, SheetTabs } from './SheetChrome'
import ContextMenu from '../components/ContextMenu'
import type { 菜单节点 } from '../components/ContextMenu'
import { useAppStore } from '../store'
import { 读取本地文件内容, 记录最近文档 } from '../fileOpen'
import { 从Html表格构建工作表, type Xlsx工作表元数据 } from './sheetImport'
import { 读取本机图片 } from './sheetImageFile'
import './sheetFeatures.css'

/** 取路径中的文件名，供最近文档记录使用 */
const 基准名 = (路径: string): string => {
  const 规整 = 路径.split('\\').join('/')
  const 部件 = 规整.split('/').filter((项) => 项.length > 0)
  return 部件.length > 0 ? 部件[部件.length - 1] : 路径
}

const 规范表格路径 = (路径: string): string => /\.[^\\/]+$/.test(路径) ? 路径 : `${路径}.xlsx`
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
  } = useAppStore()
  const 当前文档 = documents.find((项) => 项.id === activeDocumentId)
  const 已提示导入警告 = useRef<Set<string>>(new Set())
  const 保真风险 = 当前文档?.来源路径 && 当前文档.警告?.length
    ? { 来源路径: 当前文档.来源路径, 警告: 当前文档.警告 }
    : null
  const [独立工作表列表, set独立工作表列表] = useState<Sheet[]>(() => [创建工作表('Sheet1')])
  const 工作表列表 = activeDocumentId === null ? 独立工作表列表 : 表格文档模型[activeDocumentId]
  if (!工作表列表 || 工作表列表.length === 0) throw new Error('表格编辑状态缺失，已阻止覆盖文件')
  const set工作表列表: React.Dispatch<React.SetStateAction<Sheet[]>> = (更新) => {
    if (activeDocumentId === null) set独立工作表列表(更新)
    else 更新表格文档模型(activeDocumentId, 更新)
  }
  const [当前索引, set当前索引] = useState(0)
  const 有效当前索引 = Math.min(Math.max(当前索引, 0), 工作表列表.length - 1)
  const [选区, set选区] = useState<选区范围>({
    起点: { 行: 0, 列: 0 },
    终点: { 行: 0, 列: 0 },
  })
  const [编辑地址, set编辑地址] = useState<string | null>(null)
  const [编辑值, set编辑值] = useState('')
  const [当前标签, set当前标签] = useState('start')
  const [缩放, set缩放] = useState(1)
  const [当前视图, set当前视图] = useState<'普通' | '页面布局'>('普通')
  const [显示网格线, set显示网格线] = useState(true)
  const [拆分映射, set拆分映射] = useState<Record<string, boolean>>({})
  const [活动窗格, set活动窗格] = useState(0)
  const 图片输入引用 = useRef<HTMLInputElement>(null)
  const [文档路径, set文档路径] = useState<string | null>(() => 已知文档路径[activeDocumentId ?? ''] ?? null)

  useEffect(() => {
    set文档路径(已知文档路径[activeDocumentId ?? ''] ?? null)
  }, [activeDocumentId, 已知文档路径])

  const 记录当前路径 = (路径: string, 文件指纹?: string) => {
    set文档路径(路径)
    if (activeDocumentId !== null) {
      设置全局文档路径(activeDocumentId, 路径)
      if (文件指纹) 更新文件指纹(activeDocumentId, 文件指纹)
      markDocumentSaved(activeDocumentId, '', JSON.stringify(工作表列表))
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
    if (当前文档?.警告?.length && !已提示导入警告.current.has(当前文档.id)) {
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
  const 关闭菜单 = (): void => {
    set菜单可见(false)
  }

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
    set查找可见(false)
    // 新建历史栈或切换文档时记录该文档的初始状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [历史])

  // 状态层可由智能助手等外部入口更新，补入撤销栈；编辑器内部已记录的引用不会重复入栈。
  useEffect(() => {
    if (历史.current() !== 工作表列表) 历史.record(工作表列表)
  }, [历史, 工作表列表])

  const 工作表 = 工作表列表[有效当前索引]
  const 图片目标引用 = useRef({ 文档标识: activeDocumentId, 工作表, 工作表列表 })
  图片目标引用.current = { 文档标识: activeDocumentId, 工作表, 工作表列表 }

  const 处理图片选择 = async (事件: React.ChangeEvent<HTMLInputElement>) => {
    const 文件 = 事件.currentTarget.files?.[0]
    事件.currentTarget.value = ''
    if (!文件) return
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
    const 错误 = 检查工作表更新(工作表, 新表, 允许解除保护)
    if (错误) {
      最近更新被拒绝 = true
      modal.error({ title: 错误.includes('数据验证') ? '输入不符合数据验证' : '工作表已保护', content: 错误 })
      return false
    }
    最近更新被拒绝 = false
    const 下一个 = 工作表列表.map((项, 下标) => (下标 === 有效当前索引 ? 新表 : 项))
    历史.record(下一个)
    set工作表列表(下一个)
    return true
  }

  /** 撤销：回到上一份工作表列表快照 */
  const 撤销 = () => {
    const 上一步 = 历史.undo()
    if (上一步 === null) {
      message.info('没有可撤销的操作')
      return
    }
    set工作表列表(上一步)
    set当前索引((当前) => Math.min(当前, 上一步.length - 1))
    message.success('已撤销')
  }

  /** 重做：前进到下一份工作表列表快照 */
  const 重做 = () => {
    const 下一步 = 历史.redo()
    if (下一步 === null) {
      message.info('没有可重做的操作')
      return
    }
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

  const 执行命令 = (标识: string, 参数?: string) => {
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
      set工作表列表((当前) =>
        当前.map((项, 下标) => (下标 === 有效当前索引 ? 重算工作表(项) : 项))
      )
      message.info('已重新计算工作表')
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
            if (保真风险 && 是同一路径(保存路径, 保真风险.来源路径)) {
              提示禁止覆盖(保真风险.警告)
              return
            }
            if (保真风险 && !await 确认保存副本(保真风险.警告)) return
            if (导出路径已打开(保存路径)) return
            return 桥接.saveToFile(保存路径, 结果.数据, '二进制').then((保存结果) => {
              if (保存结果.成功) {
                message.success('已导出为表格文件')
              } else {
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
    // 文件操作命令：XLSX 为主要保存格式，CSV 按文本导入，JSON 仅兼容旧版读取。
    if (标识 === 'file.open') {
      if (!桥接.可用) {
        message.info('当前环境不支持打开文件功能，请使用打包后的版本')
        return
      }
      桥接.showOpenDialog('table' as const).then((文件路径) => {
        if (文件路径) {
          if (/\.csv$/i.test(文件路径)) {
            void 读取本地文件内容(文件路径).then((内容) => {
              if (内容.类型 !== 'table' || typeof 内容.内容 !== 'string') throw new Error('CSV 内容无法作为表格打开')
              createDoc('table', 内容.内容, { 路径: 文件路径, 文件指纹: 内容.文件指纹 })
              void 记录最近文档(文件路径, 基准名(文件路径), 'table').catch((错误: unknown) => {
                提示文件错误('最近文档记录失败', 错误 instanceof Error ? 错误.message : '无法记录最近文档')
              })
            }).catch((错误: unknown) => {
              提示文件错误('打开表格失败', 错误 instanceof Error ? 错误.message : 'CSV 文件读取失败')
            })
            return
          }
          桥接.readFile(文件路径).then((结果) => {
            if (!(结果.成功 && 结果.内容)) {
              提示文件错误('打开表格失败', 结果.错误 || '文件读取失败')
              return
            }
            const 扩展匹配 = 文件路径.match(/\.[^\/]+$/)
            const 扩展 = (扩展匹配 !== null ? 扩展匹配[0] : '').toLowerCase()
            if (扩展 === '.json') {
              // 旧版私有格式：工作表列表 JSON
              try {
                const 数据 = JSON.parse(结果.内容) as Sheet[]
                if (!Array.isArray(数据) || 数据.length === 0) {
                  throw new Error('结构不正确')
                }
                createDoc('table', 数据, { 路径: 文件路径, 文件指纹: 结果.文件指纹 })
                记录最近文档(文件路径, 基准名(文件路径), 'table')
              } catch {
                提示文件错误('打开表格失败', '文件格式不正确，无法打开')
              }
              return
            }
            if (扩展 === '.xlsx' && 结果.二进制) {
              // 标准 xlsx：主进程解析出全部工作表的 HTML，再逐表导入为工作表模型
              桥接.office.readXlsx(结果.内容).then((解析: any) => {
                const 表列表: Array<{ 名称: string; html: string; 页面设置?: Sheet['页面设置']; 元数据?: Xlsx工作表元数据 }> | undefined = 解析?.工作表列表
                if (!解析 || 解析.成功 === false || !表列表 || 表列表.length === 0) {
                  提示文件错误('打开表格失败', 解析?.错误 || '表格内容解析失败')
                  return
                }
                const 解析表 = 表列表.map((项) => 从Html表格构建工作表(项.html, 项.名称, 项.页面设置, 项.元数据))
                if (解析表.some((表) => 表 === null)) {
                  提示文件错误('打开表格失败', '部分工作表内容解析失败，文件未打开')
                  return
                }
                const 新表 = 解析表 as Sheet[]
                createDoc('table', 新表, { 路径: 文件路径, 警告: Array.isArray(解析.警告) ? 解析.警告 : [], 文件指纹: 结果.文件指纹 })
                记录最近文档(文件路径, 基准名(文件路径), 'table')
              }).catch(() => {
                提示文件错误('打开表格失败', '表格内容解析失败')
              })
              return
            }
            提示文件错误('打开表格失败', '请选择 XLSX、CSV 表格文件（或旧版 JSON 表格文件）')
          }).catch((error: unknown) => {
            提示文件错误('打开表格失败', (error as Error).message || '未知错误')
          })
        }
      }).catch((error: unknown) => {
        提示文件错误('打开表格失败', (error as Error).message || '未知错误')
      })
      return
    }
    if (标识 === 'file.save') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      // CSV 来源需要换成 XLSX 文件；直接回写会把 XLSX 二进制写入 .csv。
      const 可直接保存 = 文档路径 !== null && /\.(xlsx|json)$/i.test(文档路径)
      const 默认名称 = 文档路径 && !可直接保存
        ? `${基准名(文档路径).replace(/\.[^.]+$/, '')}.xlsx`
        : 生成表格文件名(工作表.name, '.xlsx')
      const 选择路径 = 可直接保存 ? 文档路径 : 桥接.showSaveDialog(默认名称, 'table' as const)
      Promise.resolve(选择路径).then((文件路径) => {
        if (文件路径) {
          保存表格文件(文件路径, '文件已保存')
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
      桥接.showSaveDialog(生成表格文件名(工作表.name, '.xlsx'), 'table' as const).then(async (文件路径) => {
        if (文件路径) {
          if (路径被其他标签占用(规范表格路径(文件路径))) return
          if (保真风险 && 是同一路径(规范表格路径(文件路径), 保真风险.来源路径)) {
            提示禁止覆盖(保真风险.警告)
            return
          }
          if (保真风险 && !await 确认保存副本(保真风险.警告)) return
          保存表格文件(文件路径, '文件已另存为')
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

  /** 保存表格文档：xlsx 为标准格式（未带扩展名时补齐），旧版 json 路径兼容回写 */
  const 保存表格文件 = (原始路径: string, 成功提示: string) => {
    const 文件路径 = 规范表格路径(原始路径)
    const 预期文件指纹 = 当前文档 && 文档路径 && 是同一路径(文件路径, 文档路径)
      ? 当前文档.文件指纹 : undefined
    if (!/\.(xlsx|json)$/i.test(文件路径)) {
      提示文件错误('保存表格失败', '请选择 XLSX 格式的文件路径；当前路径不能保存为表格文件。')
      return
    }
    if (路径被其他标签占用(文件路径)) return
    if (保真风险 && 是同一路径(文件路径, 保真风险.来源路径)) {
      提示禁止覆盖(保真风险.警告)
      return
    }
    const 扩展匹配 = 文件路径.match(/\.[^\/]+$/)
    const 扩展 = (扩展匹配 !== null ? 扩展匹配[0] : '').toLowerCase()
    if (扩展 === '.json') {
      桥接.saveToFile(文件路径, JSON.stringify(工作表列表), '文本', 预期文件指纹).then((结果) => {
        if (结果.成功) {
          记录当前路径(文件路径, 结果.文件指纹)
          记录最近文档(文件路径, 基准名(文件路径), 'table')
          message.success(成功提示)
        } else {
          提示文件错误('保存表格失败', 结果.错误 || '文件写入失败')
        }
      }).catch((error: unknown) => {
        提示文件错误('保存表格失败', (error as Error).message || '未知错误')
      })
      return
    }
    // 空工作簿也允许保存（与 WPS 行为一致），导出模型为空时回落为空表定义
    const 模型 = 导出为Xlsx(工作表列表.length > 1 ? 工作表列表 : 工作表) ?? {
      工作表: [{ 名称: 工作表.name, 数据: [], 页面设置: 工作表.页面设置 }],
    }
    桥接.office.writeXlsx(模型).then((结果: any) => {
      if (!(结果 && 结果.成功 && 结果.数据)) {
        提示文件错误('保存表格失败', 结果?.错误 || '表格格式转换失败，请检查内容后重试')
        return
      }
      if (路径被其他标签占用(文件路径)) return
      return 桥接.saveToFile(文件路径, 结果.数据, '二进制', 预期文件指纹).then((保存结果) => {
        if (保存结果.成功) {
          记录当前路径(文件路径, 保存结果.文件指纹)
          记录最近文档(文件路径, 基准名(文件路径), 'table')
          message.success(成功提示)
        } else {
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

  const 提交编辑 = () => {
    if (编辑地址 !== null) {
      更新工作表(写入单元格(工作表, 编辑地址, 编辑值))
    }
    set编辑地址(null)
    set编辑值('')
  }

  const 取首格地址 = (): string => 生成地址(选区.起点.行, 选区.起点.列)

  const 选区统计 = (() => {
    const 地址列表 = 展开区域(生成区域地址(选区.起点, 选区.终点)).map((位置) =>
      生成地址(位置.行, 位置.列)
    )
    return 统计选区(地址列表.map((地址) => 读取单元格(工作表, 地址).显示值))
  })()


  /** 键盘操作：方向键移动选区、回车或 F2 编辑、Delete 清空、可见字符直接输入、快捷键 */
  const 处理按键 = (事件: React.KeyboardEvent) => {
    if (编辑地址 !== null) {
      // 编辑态由单元格内的输入框自行处理按键
      return
    }
    const { 起点, 终点 } = 选区
    const 移动 = (行偏移: number, 列偏移: number) => {
      const 目标 = {
        行: Math.max(0, Math.min(起点.行 + 行偏移, 工作表.行数 - 1)),
        列: Math.max(0, Math.min(起点.列 + 列偏移, 工作表.列数 - 1)),
      }
      set选区({ 起点: 目标, 终点: 目标 })
    }
    /** Shift+方向键：锚定起点，仅移动终点扩展选区 */
    const 扩展 = (行偏移: number, 列偏移: number) => {
      const 新终点 = {
        行: Math.max(0, Math.min(终点.行 + 行偏移, 工作表.行数 - 1)),
        列: Math.max(0, Math.min(终点.列 + 列偏移, 工作表.列数 - 1)),
      }
      set选区({ 起点, 终点: 新终点 })
    }
    /** Ctrl+方向键：沿方向跳到连续数据区边缘或下一个非空格（与 WPS/Excel 行为一致） */
    const 跳边缘 = (行步进: number, 列步进: number) => {
      const 在界内 = (行: number, 列: number) =>
        行 >= 0 && 行 < 工作表.行数 && 列 >= 0 && 列 < 工作表.列数
      const 有值 = (行: number, 列: number) =>
        在界内(行, 列) && 读取单元格(工作表, 生成地址(行, 列)).原始值 !== ''
      let 行 = 起点.行
      let 列 = 起点.列
      const 邻格有值 = 有值(行 + 行步进, 列 + 列步进)
      if (有值(行, 列) && 邻格有值) {
        // 当前处于数据区内部：滑到最后一个连续非空格
        while (有值(行 + 行步进, 列 + 列步进)) {
          行 += 行步进
          列 += 列步进
        }
      } else {
        // 跳到方向上第一个非空格；没有则滑到工作表边缘
        while (在界内(行 + 行步进, 列 + 列步进)) {
          行 += 行步进
          列 += 列步进
          if (有值(行, 列)) {
            break
          }
        }
      }
      set选区({ 起点: { 行, 列 }, 终点: { 行, 列 } })
    }
    const 进入编辑 = (初始值: string) => {
      if (工作表.保护) {
        modal.warning({ title: '工作表已保护', content: '请先解除保护，再编辑单元格。' })
        return
      }
      set编辑地址(生成地址(起点.行, 起点.列))
      set编辑值(初始值)
    }

    switch (事件.key) {
      // ---- 撤销 / 重做 ----
      case 'z':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          撤销()
          return
        }
        break
      case 'y':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          重做()
          return
        }
        break
      // ---- 全选 ----
      case 'a':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          set选区({
            起点: { 行: 0, 列: 0 },
            终点: { 行: 工作表.行数 - 1, 列: 工作表.列数 - 1 },
          })
          return
        }
        break
      // ---- 复制 ----
      case 'c':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          执行命令('clipboard.copy')
          return
        }
        break
      // ---- 粘贴 ----
      case 'v':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          执行命令('clipboard.paste')
          return
        }
        break
      // ---- 剪切 ----
      case 'x':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          执行命令('clipboard.cut')
          return
        }
        break
      // ---- 保存 / 查找 ----
      case 's':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          执行命令('file.save')
          return
        }
        break
      case 'f':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          set查找可见(true)
          return
        }
        break
      // ---- 回到 A1 ----
      case 'Home':
        事件.preventDefault()
        set选区({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } })
        return
      // ---- 自动求和 ----
      case '=':
        if (事件.altKey) {
          事件.preventDefault()
          执行命令('edit.sum')
          return
        }
        break
      // ---- 方向键 / Tab / 编辑 / 删除（原有逻辑）----
      case 'ArrowUp':
        事件.preventDefault()
        if (事件.ctrlKey || 事件.metaKey) 跳边缘(-1, 0)
        else if (事件.shiftKey) 扩展(-1, 0)
        else 移动(-1, 0)
        return
      case 'ArrowDown':
        事件.preventDefault()
        if (事件.ctrlKey || 事件.metaKey) 跳边缘(1, 0)
        else if (事件.shiftKey) 扩展(1, 0)
        else 移动(1, 0)
        return
      case 'ArrowLeft':
        事件.preventDefault()
        if (事件.ctrlKey || 事件.metaKey) 跳边缘(0, -1)
        else if (事件.shiftKey) 扩展(0, -1)
        else 移动(0, -1)
        return
      case 'ArrowRight':
        事件.preventDefault()
        if (事件.ctrlKey || 事件.metaKey) 跳边缘(0, 1)
        else if (事件.shiftKey) 扩展(0, 1)
        else 移动(0, 1)
        return
      case 'Tab':
        事件.preventDefault()
        移动(0, 事件.shiftKey ? -1 : 1)
        return
      case 'Enter':
      case 'F2':
        事件.preventDefault()
        进入编辑(读取单元格(工作表, 生成地址(起点.行, 起点.列)).原始值)
        return
      case 'Delete':
      case 'Backspace': {
        事件.preventDefault()
        if (工作表.保护) {
          modal.warning({ title: '工作表已保护', content: '请先解除保护，再清除单元格。' })
          return
        }
        const 地址列表 = 展开区域(生成区域地址(起点, 终点)).map((位置) =>
          生成地址(位置.行, 位置.列)
        )
        if (更新工作表(清空单元格(工作表, 地址列表))) message.success(`已清除 ${地址列表.length} 个单元格`)
        return
      }
      default: {
        // 可见字符直接进入编辑并预填，符合表格软件的输入习惯
        if (事件.key.length === 1 && !事件.ctrlKey && !事件.metaKey && !事件.altKey) {
          事件.preventDefault()
          进入编辑(事件.key)
        }
      }
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
      activeKey: 当前标签,
      tabs: 表格标签,
      onCommand: 执行命令,
      获取激活态: 取激活态,
      获取当前值: (标识: string) => {
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
    React.createElement(SheetToolbar, {
      地址文本: 生成区域地址(选区.起点, 选区.终点),
      公式值: 读取单元格(工作表, 取首格地址()).原始值,
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
        if (!更新工作表(写入单元格(工作表, 目标地址, 值))) return
        const 目标位置 = 解析地址(目标地址)
        if (目标位置 !== null && 目标位置.行 + 1 < 工作表.行数) {
          set选区({ 起点: { 行: 目标位置.行 + 1, 列: 目标位置.列 }, 终点: { 行: 目标位置.行 + 1, 列: 目标位置.列 } })
        }
        message.success(`已写入 ${目标地址}`)
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
      { className: `wps-sheet-stage${显示网格线 ? '' : ' wps-sheet-stage--no-gridlines'}${已拆分 ? ' wps-sheet-stage--split' : ''}` },
      当前筛选 ? React.createElement('div', { className: 'wps-sheet-filterbar' },
        `第 ${当前筛选.列 + 1} 列筛选：${当前筛选.值 === '' ? '空白' : 当前筛选.值}，显示 ${工作表.行数 - 1 - 隐藏行.size} 行`,
        React.createElement('button', { type: 'button', onClick: () => 执行命令('data.filter') }, '清除筛选')
      ) : null,
      工作表.保护 ? React.createElement('div', { className: 'wps-sheet-protectionbar' },
        工作表.保护 === '外部' ? '原文件受保护，当前只读' : '工作表已保护，当前只读'
      ) : null,
      当前视图 === '页面布局'
        ? React.createElement(SheetPagePreview, { 工作表 })
        : Array.from({ length: 已拆分 ? 2 : 1 }, (_, 窗格) => React.createElement(GridView, {
        key: `${工作表.id}-${窗格}`,
        工作表,
        选区,
        编辑地址: 窗格 === 活动窗格 ? 编辑地址 : null,
        编辑值,
        scale: 缩放,
        冻结,
        隐藏行,
        on选中: (位置: 单元格位置, 扩展选区: boolean) => {
          set活动窗格(窗格)
          if (扩展选区) {
            set选区((当前) => ({ 起点: 当前.起点, 终点: 位置 }))
          } else {
            set选区({ 起点: 位置, 终点: 位置 })
          }
        },
        on双击: (地址: string) => {
          if (工作表.保护) {
            modal.warning({ title: '工作表已保护', content: '请先解除保护，再编辑单元格。' })
            return
          }
          set活动窗格(窗格)
          set编辑地址(地址)
          set编辑值(读取单元格(工作表, 地址).原始值)
        },
        on编辑值变化: set编辑值,
        on提交编辑: 提交编辑,
        on取消编辑: () => {
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
      items: 构建表格菜单(),
      onCommand: (命令标识: string, 参数?: string) => {
        if (命令标识 === '__close__') {
          关闭菜单()
          return
        }
        执行命令(命令标识, 参数)
        关闭菜单()
      },
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
        const 新表 = 创建工作表(`Sheet${工作表列表.length + 1}`)
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
    })
  )
}

export default SheetEditor
