// 演示文稿编辑器容器：装配 Ribbon、缩略图、画布与状态栏。
import React, { useEffect, useMemo, useState } from 'react'
import { App as AntdApp } from 'antd'
import { HistoryStack } from '../editor/history'
import { 下载文本 } from '../editor/exportDoc'
import RibbonTabs from '../editor/ribbon/RibbonTabs'
import RibbonPanel from '../editor/ribbon/RibbonPanel'
import { 演示标签 } from './ribbonSpecs'
import { 查找演示命令, type 演示命令上下文 } from './pptCommands'
import {
  创建演示文稿,
  切换幻灯片,
  约束位置,
  读取当前幻灯片,
  更新幻灯片,
  更新文本框,
  type 演示文稿,
} from './deck'
import { 导出为Html预览, 生成演示文件名 } from './deckExport'
import { PptStatusBar, ThumbnailList } from './PptChrome'
import SlideCanvas from './SlideCanvas'

const PptEditor = () => {
  const { message } = AntdApp.useApp()
  const [文稿, set文稿] = useState<演示文稿>(() => 创建演示文稿())
  const [选中框标识, set选中框标识] = useState<string | null>(null)
  const [编辑框标识, set编辑框标识] = useState<string | null>(null)
  const [编辑值, set编辑值] = useState('')
  const [当前标签, set当前标签] = useState('start')
  const [缩放, set缩放] = useState(1)
  const [显示网格线, set显示网格线] = useState(false)
  const 历史 = useMemo(() => new HistoryStack<演示文稿>(), [])

  // 记录初始状态，否则最新状态永远不在栈中，重做将无处可去
  useEffect(() => {
    历史.record(文稿)
    // 仅在挂载时记录一次初始快照
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const 当前幻灯片 = 读取当前幻灯片(文稿)

  /** 应用修改并记录新状态，使撤销与重做都落在真实存在过的快照上 */
  const 更新文稿 = (新文稿: 演示文稿) => {
    历史.record(新文稿)
    set文稿(新文稿)
  }

  /** 撤销：回到上一份演示文稿快照 */
  const 撤销 = () => {
    const 上一步 = 历史.undo()
    if (上一步 === null) {
      message.info('没有可撤销的操作')
      return
    }
    set文稿(上一步)
    set选中框标识(null)
    message.success('已撤销')
  }

  /** 重做：前进到下一份演示文稿快照 */
  const 重做 = () => {
    const 下一步 = 历史.redo()
    if (下一步 === null) {
      message.info('没有可重做的操作')
      return
    }
    set文稿(下一步)
    set选中框标识(null)
    message.success('已重做')
  }

  const 上下文: 演示命令上下文 = {
    文稿,
    选中框标识,
    更新文稿,
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
    if (标识 === 'view.zoomIn' || 标识 === 'view.zoomOut') {
      set缩放((当前) =>
        Math.min(2, Math.max(0.5, Number((当前 + (标识 === 'view.zoomIn' ? 0.1 : -0.1)).toFixed(2))))
      )
      return
    }
    if (标识 === 'file.exportHtml') {
      const 内容 = 导出为Html预览(文稿, 文稿.name)
      if (内容.length === 0) {
        message.warning('演示文稿为空，没有可导出的内容')
        return
      }
      下载文本(内容, 生成演示文件名(文稿.name, 'html'), 'text/html')
      message.success('已导出为网页文件')
      return
    }
    const 命令 = 查找演示命令(标识)
    if (命令 === undefined) {
      message.error('该命令未注册')
      return
    }
    命令.run(上下文, 参数)
  }

  const 提交编辑 = () => {
    if (编辑框标识 !== null && 当前幻灯片 !== null) {
      更新文稿(
        更新幻灯片(文稿, 当前幻灯片.id, {
          文本框列表: 更新文本框(当前幻灯片, 编辑框标识, { text: 编辑值 }).文本框列表,
        })
      )
    }
    set编辑框标识(null)
    set编辑值('')
  }

  const 取激活态 = (标识: string): boolean => {
    if (当前幻灯片 === null || 选中框标识 === null) {
      return false
    }
    const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 选中框标识)
    if (框 === undefined) {
      return false
    }
    if (标识 === 'text.bold') return 框.加粗
    if (标识 === 'text.italic') return 框.斜体
    if (标识 === 'text.underline') return 框.下划线
    if (标识 === 'para.alignLeft') return 框.对齐 === 'left'
    if (标识 === 'para.alignCenter') return 框.对齐 === 'center'
    if (标识 === 'para.alignRight') return 框.对齐 === 'right'
    return false
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(RibbonTabs, { activeKey: 当前标签, onChange: set当前标签, tabs: 演示标签 }),
    React.createElement(RibbonPanel, {
      activeKey: 当前标签,
      tabs: 演示标签,
      onCommand: 执行命令,
      获取激活态: 取激活态,
    }),
    React.createElement(
      'div',
      { className: 'wps-ppt-body' },
      React.createElement(ThumbnailList, {
        文稿,
        on选中: (索引: number) => {
          set文稿(切换幻灯片(文稿, 索引))
          set选中框标识(null)
        },
        on新建: () => 执行命令('slide.new'),
      }),
      当前幻灯片 === null
        ? React.createElement('div', { className: 'wps-ppt-empty' }, '暂无幻灯片')
        : React.createElement(SlideCanvas, {
            幻灯片: 当前幻灯片,
            选中框标识,
            缩放,
            编辑框标识,
            编辑值,
            显示网格线,
            on选中框: set选中框标识,
            on双击框: (标识: string) => {
              const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 标识)
              set编辑框标识(标识)
              set编辑值(框?.text ?? '')
            },
            on编辑值变化: set编辑值,
            on提交编辑: 提交编辑,
            on拖动框: (标识: string, x: number, y: number) => {
              const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 标识)
              if (框 === undefined) {
                return
              }
              const 位置 = 约束位置(x, y, 框.width, 框.height)
              // 拖动过程中不逐帧记录历史，避免撤销栈被拖动事件占满
              set文稿(
                更新幻灯片(文稿, 当前幻灯片.id, {
                  文本框列表: 更新文本框(当前幻灯片, 标识, 位置).文本框列表,
                })
              )
            },
          })
    ),
    React.createElement(PptStatusBar, { 文稿, 缩放, on缩放变化: set缩放 })
  )
}

export default PptEditor
