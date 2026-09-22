// 表格编辑器容器：装配 Ribbon、名称框与公式栏、网格、工作表标签与状态栏。
import React, { useMemo, useState } from 'react'
import { App as AntdApp } from 'antd'
import { HistoryStack } from '../editor/history'
import RibbonTabs from '../editor/ribbon/RibbonTabs'
import RibbonPanel from '../editor/ribbon/RibbonPanel'
import { 表格标签 } from './ribbonSpecs'
import { 查找表格命令, type 表格命令上下文, type 选区范围 } from './sheetCommands'
import { 创建工作表, 读取单元格, 写入单元格, 重算工作表, type Sheet } from './model'
import { 生成地址, 生成区域地址, 展开区域, 解析地址, type 单元格位置 } from './address'
import { 统计选区 } from './selectionStats'
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

  const 工作表 = 工作表列表[当前索引]

  const 更新工作表 = (新表: Sheet) => {
    历史.record(工作表列表)
    set工作表列表((当前) => 当前.map((项, 下标) => (下标 === 当前索引 ? 新表 : 项)))
  }

  const 上下文: 表格命令上下文 = {
    工作表,
    选区,
    更新工作表,
    notify: (文本: string) => message.info(文本),
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
