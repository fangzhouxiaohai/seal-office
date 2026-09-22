// 表格编辑器容器：装配 Ribbon、名称框与公式栏、网格、工作表标签与状态栏。
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp } from 'antd'
import { HistoryStack } from '../editor/history'
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
import { 导出为Csv, 导出为Html表格, 生成表格文件名 } from './sheetExport'
import { 下载文本 } from '../editor/exportDoc'
import GridView from './GridView'
import SheetToolbar from './SheetToolbar'
import { SheetStatusBar, SheetTabs } from './SheetChrome'

const SheetEditor = () => {
  const { message } = AntdApp.useApp()
  const [工作表列表, set工作表列表] = useState<Sheet[]>(() => [创建工作表('Sheet1')])
  const [当前索引, set当前索引] = useState(0)
  const [选区, set选区] = useState<选区范围>({
    起点: { 行: 0, 列: 0 },
    终点: { 行: 0, 列: 0 },
  })
  const [编辑地址, set编辑地址] = useState<string | null>(null)
  const [编辑值, set编辑值] = useState('')
  const [当前标签, set当前标签] = useState('start')
  const [缩放, set缩放] = useState(1)
  const [显示网格线, set显示网格线] = useState(true)
  const 历史 = useMemo(() => new HistoryStack<Sheet[]>(), [])
  /** 列宽拖动状态；拖动过程中不逐帧记录历史，只在开始时记录一次 */
  const 列宽拖动 = useRef<{ 列: number; 起始横坐标: number; 原宽: number } | null>(null)

  // 列宽拖动：监听文档级鼠标移动与松开，避免鼠标移出网格后卡住
  useEffect(() => {
    const 处理移动 = (事件: MouseEvent) => {
      const 状态 = 列宽拖动.current
      if (状态 === null) {
        return
      }
      const 新宽 = Math.max(40, 状态.原宽 + (事件.clientX - 状态.起始横坐标))
      set工作表列表((当前) =>
        当前.map((项, 下标) => (下标 === 当前索引 ? 设置列宽(项, 状态.列, 新宽) : 项))
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
  }, [当前索引])

  // 记录初始状态，否则最新状态永远不在栈中，重做将无处可去
  useEffect(() => {
    历史.record(工作表列表)
    // 仅在挂载时记录一次初始快照
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const 工作表 = 工作表列表[当前索引]

  /** 应用修改并记录新状态，使撤销与重做都落在真实存在过的快照上 */
  const 更新工作表 = (新表: Sheet) => {
    const 下一个 = 工作表列表.map((项, 下标) => (下标 === 当前索引 ? 新表 : 项))
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
  }

  const 执行命令 = (标识: string, 参数?: string) => {
    if (标识 === 'view.gridlines') {
      const 目标 = !显示网格线
      set显示网格线(目标)
      message.info(目标 ? '已显示网格线' : '已隐藏网格线')
      return
    }
    if (标识 === 'formula.calculate') {
      set工作表列表((当前) =>
        当前.map((项, 下标) => (下标 === 当前索引 ? 重算工作表(项) : 项))
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
    const 命令 = 查找表格命令(标识)
    if (命令 === undefined) {
      message.error('该命令未注册')
      return
    }
    命令.run(上下文, 参数)
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
          // 优先尝试系统剪贴板
          let 粘贴值 = 剪贴板.current?.值 ?? ''
          navigator.clipboard?.readText().then((系统值) => {
            if (系统值) 粘贴值 = 系统值
          }).catch(() => {
            // 不可用时回退到本地缓存
          })
          const 目标地址 = 生成地址(起点.行, 起点.列)
          更新工作表(写入单元格(工作表, 目标地址, 粘贴值))
          message.success(`已粘贴到 ${目标地址}`)
          return
        }
        break
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
        移动(-1, 0)
        return
      case 'ArrowDown':
        事件.preventDefault()
        移动(1, 0)
        return
      case 'ArrowLeft':
        事件.preventDefault()
        移动(0, -1)
        return
      case 'ArrowRight':
        事件.preventDefault()
        移动(0, 1)
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
        更新工作表(写入单元格(工作表, 取首格地址(), 值))
        message.success(`已写入 ${取首格地址()}`)
      },
    }),
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
        on列宽拖动开始: (列: number, 起始横坐标: number) => {
          // 拖动只在开始时记录一次历史，避免逐帧占满撤销栈
          历史.record(工作表列表)
          列宽拖动.current = {
            列,
            起始横坐标,
            原宽: 工作表.列宽[列] ?? 默认列宽,
          }
        },
      })
    ),
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
