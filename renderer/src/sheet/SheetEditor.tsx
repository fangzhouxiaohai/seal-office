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
  清空单元格,
  默认列宽,
  type Sheet,
} from './model'
import { 生成地址, 生成区域地址, 展开区域, 解析地址, type 单元格位置 } from './address'
import { 统计选区 } from './selectionStats'
import { 导出为Csv, 导出为Html表格, 导出为Xlsx, 生成表格文件名 } from './sheetExport'
import { 下载文本 } from '../editor/exportDoc'
import GridView from './GridView'
import SheetToolbar from './SheetToolbar'
import { SheetStatusBar, SheetTabs } from './SheetChrome'
import ContextMenu from '../components/ContextMenu'
import type { 菜单节点 } from '../components/ContextMenu'
import { useAppStore } from '../store'
import { 记录最近文档 } from '../fileOpen'
import { 从Html表格构建工作表 } from './sheetImport'
import DocumentTabs from '../editor/DocumentTabs'

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
    documents, 表格文档模型, 更新表格文档模型, createDoc, createEditorDoc,
    closeEditorDoc, setActiveDocumentId, activeDocumentId,
    文档路径: 已知文档路径, set文档路径: 设置全局文档路径,
  } = useAppStore()
  const 当前文档 = documents.find((项) => 项.id === activeDocumentId)
  const 已开表格文档 = documents.filter((项) => 项.type === 'table')
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
  const [显示网格线, set显示网格线] = useState(true)
  const [文档路径, set文档路径] = useState<string | null>(() => 已知文档路径[activeDocumentId ?? ''] ?? null)

  useEffect(() => {
    set文档路径(已知文档路径[activeDocumentId ?? ''] ?? null)
  }, [activeDocumentId, 已知文档路径])

  const 记录当前路径 = (路径: string) => {
    set文档路径(路径)
    if (activeDocumentId !== null) 设置全局文档路径(activeDocumentId, 路径)
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

  const 工作表 = 工作表列表[有效当前索引]

  /** 应用修改并记录新状态，使撤销与重做都落在真实存在过的快照上 */
  const 更新工作表 = (新表: Sheet) => {
    const 下一个 = 工作表列表.map((项, 下标) => (下标 === 有效当前索引 ? 新表 : 项))
    历史.record(下一个)
    set工作表列表(下一个)
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
    notify: (文本: string) => message.info(文本),
    撤销,
    重做,
    更新选区: set选区,
  }

  const 执行命令 = (标识: string, 参数?: string) => {
    if (标识 === 'view.gridlines') {
      const 目标 = !显示网格线
      set显示网格线(目标)
      message.info(目标 ? '已显示网格线' : '已隐藏网格线')
      return
    }
    if (标识 === 'edit.find') {
      set查找可见(true)
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
            if (保真风险 && 是同一路径(规范表格路径(文件路径), 保真风险.来源路径)) {
              提示禁止覆盖(保真风险.警告)
              return
            }
            if (保真风险 && !await 确认保存副本(保真风险.警告)) return
            return 桥接.saveToFile(文件路径, 结果.数据, '二进制').then((保存结果) => {
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
    // 文件操作命令：表格文档的打开与保存类型就是 xlsx（json 仅作为旧格式兼容读取）
    if (标识 === 'file.open') {
      if (!桥接.可用) {
        message.info('当前环境不支持打开文件功能，请使用打包后的版本')
        return
      }
      桥接.showOpenDialog('table' as const).then((文件路径) => {
        if (文件路径) {
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
                createDoc('table', 数据, { 路径: 文件路径 })
                记录最近文档(文件路径, 基准名(文件路径), 'table')
                message.success('文件已打开')
              } catch {
                提示文件错误('打开表格失败', '文件格式不正确，无法打开')
              }
              return
            }
            if (扩展 === '.xlsx' && 结果.二进制) {
              // 标准 xlsx：主进程解析出全部工作表的 HTML，再逐表导入为工作表模型
              桥接.office.readXlsx(结果.内容).then((解析: any) => {
                const 表列表: Array<{ 名称: string; html: string }> | undefined = 解析?.工作表列表
                if (!解析 || 解析.成功 === false || !表列表 || 表列表.length === 0) {
                  提示文件错误('打开表格失败', 解析?.错误 || '表格内容解析失败')
                  return
                }
                const 解析表 = 表列表.map((项) => 从Html表格构建工作表(项.html, 项.名称))
                if (解析表.some((表) => 表 === null)) {
                  提示文件错误('打开表格失败', '部分工作表内容解析失败，文件未打开')
                  return
                }
                const 新表 = 解析表 as Sheet[]
                createDoc('table', 新表, { 路径: 文件路径, 警告: Array.isArray(解析.警告) ? 解析.警告 : [] })
                记录最近文档(文件路径, 基准名(文件路径), 'table')
                message.success('文件已打开')
              }).catch(() => {
                提示文件错误('打开表格失败', '表格内容解析失败')
              })
              return
            }
            提示文件错误('打开表格失败', '请选择 xlsx 表格文件（或旧版 json 表格文件）')
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
      // 无路径时弹出保存对话框（表格类型过滤器），有路径时静默保存
      const 选择路径 = 文档路径 ?? 桥接.showSaveDialog(生成表格文件名(工作表.name, '.xlsx'), 'table' as const)
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
    命令.run(上下文, 参数)
  }

  /** 保存表格文档：xlsx 为标准格式（未带扩展名时补齐），旧版 json 路径兼容回写 */
  const 保存表格文件 = (原始路径: string, 成功提示: string) => {
    const 文件路径 = 规范表格路径(原始路径)
    if (保真风险 && 是同一路径(文件路径, 保真风险.来源路径)) {
      提示禁止覆盖(保真风险.警告)
      return
    }
    const 扩展匹配 = 文件路径.match(/\.[^\/]+$/)
    const 扩展 = (扩展匹配 !== null ? 扩展匹配[0] : '').toLowerCase()
    if (扩展 === '.json') {
      桥接.saveToFile(文件路径, JSON.stringify(工作表列表), '文本').then((结果) => {
        if (结果.成功) {
          记录当前路径(文件路径)
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
      工作表: [{ 名称: 工作表.name, 数据: [] }],
    }
    桥接.office.writeXlsx(模型).then((结果: any) => {
      if (!(结果 && 结果.成功 && 结果.数据)) {
        提示文件错误('保存表格失败', 结果?.错误 || '表格格式转换失败，请检查内容后重试')
        return
      }
      return 桥接.saveToFile(文件路径, 结果.数据, '二进制').then((保存结果) => {
        if (保存结果.成功) {
          记录当前路径(文件路径)
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

  /** 剪贴板缓存：复制操作暂存选区源地址和目标值 */
  const 剪贴板 = useRef<{ 源地址: string; 值: string } | null>(null)

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
          const 首格地址 = 生成地址(起点.行, 起点.列)
          const 值 = 读取单元格(工作表, 首格地址).原始值
          剪贴板.current = { 源地址: 首格地址, 值 }
          // 尝试写入系统剪贴板
          try {
            navigator.clipboard?.writeText(值)
          } catch {
            // 浏览器环境不可用时忽略
          }
          message.success(`已复制 ${首格地址} 的内容`)
          return
        }
        break
      // ---- 粘贴 ----
      case 'v':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          const 目标地址 = 生成地址(起点.行, 起点.列)
          const 本地值 = 剪贴板.current?.值 ?? ''
          const 执行粘贴 = (粘贴值: string) => {
            更新工作表(写入单元格(工作表, 目标地址, 粘贴值))
            message.success(`已粘贴到 ${目标地址}`)
          }
          const 系统读取 = navigator.clipboard?.readText
          if (typeof 系统读取 === 'function') {
            // 优先读取系统剪贴板，读取成功才覆盖本地值
            系统读取.call(navigator.clipboard).then((系统值) => {
              执行粘贴(系统值 || 本地值)
            }).catch(() => {
              // 系统剪贴板不可用时回退到本地缓存
              执行粘贴(本地值)
            })
          } else {
            // 无系统剪贴板接口，直接用本地缓存
            执行粘贴(本地值)
          }
          return
        }
        break
      // ---- 剪切：复制首格并清空选区 ----
      case 'x':
        if (事件.ctrlKey || 事件.metaKey) {
          事件.preventDefault()
          const 剪切地址 = 生成地址(起点.行, 起点.列)
          const 剪切值 = 读取单元格(工作表, 剪切地址).原始值
          剪贴板.current = { 源地址: 剪切地址, 值: 剪切值 }
          try {
            navigator.clipboard?.writeText(剪切值)
          } catch {
            // 浏览器环境不可用时忽略
          }
          const 剪切区域 = 展开区域(生成区域地址(起点, 终点)).map((位置) =>
            生成地址(位置.行, 位置.列)
          )
          更新工作表(清空单元格(工作表, 剪切区域))
          message.success(`已剪切 ${剪切地址} 的内容`)
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
        const 地址列表 = 展开区域(生成区域地址(起点, 终点)).map((位置) =>
          生成地址(位置.行, 位置.列)
        )
        更新工作表(清空单元格(工作表, 地址列表))
        message.success(`已清除 ${地址列表.length} 个单元格`)
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
    return false
  }

  const 处理关闭文档 = (标识: string) => {
    const 文档 = 已开表格文档.find((项) => 项.id === 标识)
    if (!文档) return
    modal.confirm({
      title: '关闭表格',
      content: `关闭「${文档.name}」后，该表格未保存的修改将丢失。`,
      okText: '关闭表格',
      cancelText: '取消',
      onOk: () => closeEditorDoc(标识),
    })
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(DocumentTabs, {
      documents: 已开表格文档,
      activeId: activeDocumentId,
      onSelect: setActiveDocumentId,
      onClose: 处理关闭文档,
      onCreate: createEditorDoc,
    }),
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
        更新工作表(写入单元格(工作表, 目标地址, 值))
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
      { className: `wps-sheet-stage${显示网格线 ? '' : ' wps-sheet-stage--no-gridlines'}` },
      React.createElement(GridView, {
        工作表,
        选区,
        编辑地址,
        编辑值,
        scale: 缩放,
        on选中: (位置: 单元格位置, 扩展选区: boolean) => {
          if (扩展选区) {
            set选区((当前) => ({ 起点: 当前.起点, 终点: 位置 }))
          } else {
            set选区({ 起点: 位置, 终点: 位置 })
          }
        },
        on双击: (地址: string) => {
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
      })
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
