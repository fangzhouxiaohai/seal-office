// 演示文稿编辑器容器：装配 Ribbon、缩略图、画布与状态栏。
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp } from 'antd'
import { HistoryStack } from '../editor/history'
import { 桥接 } from '../ipc/bridge'
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
import ContextMenu, { 菜单节点 } from '../components/ContextMenu'

const PptEditor = () => {
  const { message } = AntdApp.useApp()
  const [文稿, set文稿] = useState<演示文稿>(() => 创建演示文稿())
  const [选中框标识, set选中框标识] = useState<string | null>(null)
  const [编辑框标识, set编辑框标识] = useState<string | null>(null)
  const [编辑值, set编辑值] = useState('')
  const [当前标签, set当前标签] = useState('start')
  const [缩放, set缩放] = useState(1)
  const [显示网格线, set显示网格线] = useState(false)
  const [文档路径, set文档路径] = useState<string | null>(null)
  const [菜单可见, set菜单可见] = useState(false)
  const [菜单坐标, set菜单坐标] = useState({ x: 0, y: 0 })
  const [选中起始, set选中起始] = useState<number | undefined>(undefined)
  const [选中结束, set选中结束] = useState<number | undefined>(undefined)
  /** 下拉框打开时保存的选区快照，防止焦点转移导致选区丢失 */
  const 选区快照 = useRef<{ 起始?: number; 结束?: number } | null>(null)
  /** 记录最后一次选中的文本框标识，防止打开下拉框时画布点击清除选框后命令找不到目标 */
  const 最近选中框标识 = useRef<string | null>(null)
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
    选中框标识: 选中框标识 ?? 最近选中框标识.current,
    选中起始,
    选中结束,
    选区快照: 选区快照.current,
    更新文稿,
    notify: (文本: string) => message.info(文本),
    撤销,
    重做,
  }

  const 处理文本选择 = (标识: string, 起始: number, 结束: number) => {
    if (选中框标识 !== 标识) return
    最近选中框标识.current = 标识
    set选中起始(起始)
    set选中结束(结束)
  }

  /** 包装选框回调，同步更新最近选中框标识 */
  const 处理选框 = (标识: string | null) => {
    if (标识 !== null) 最近选中框标识.current = 标识
    set选中框标识(标识)
  }

  /** 下拉框打开前保存选区快照 */
  const 处理下拉框打开 = () => {
    选区快照.current = { 起始: 选中起始, 结束: 选中结束 }
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
    // 文件操作命令
    if (标识 === 'file.open') {
      if (!桥接.可用) {
        message.info('当前环境不支持打开文件功能，请使用打包后的版本')
        return
      }
      桥接.showOpenDialog().then((文件路径) => {
        if (文件路径) {
          // 判断文件扩展名
          const 扩展 = 文件路径.slice((文件路径.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase()
          if (扩展 === 'pptx') {
            // pptx 文件：读取为二进制，通过主进程解析为演示文稿模型
            桥接.readFile(文件路径).then((读取结果) => {
              if (读取结果.成功 && 读取结果.二进制 && 读取结果.内容) {
                桥接.office.readPptx(读取结果.内容).then((解析结果) => {
                  if (解析结果 && 解析结果.演示文稿) {
                    set文稿(解析结果.演示文稿)
                    set文档路径(文件路径)
                    历史.record(解析结果.演示文稿)
                    message.success('文件已打开')
                  } else {
                    message.error('演示文稿格式转换失败，请检查内容后重试')
                  }
                }).catch((error: unknown) => {
                  message.error(`打开文件失败：${(error as Error).message || '未知错误'}`)
                })
              } else {
                message.error('文件读取失败')
              }
            }).catch((error: unknown) => {
              message.error(`打开文件失败：${(error as Error).message || '未知错误'}`)
            })
          } else {
            // json 文件：直接解析
            桥接.readFile(文件路径).then((结果) => {
              if (结果.成功 && 结果.内容) {
                try {
                  const 数据 = JSON.parse(结果.内容) as 演示文稿
                  set文稿(数据)
                  set文档路径(文件路径)
                  历史.record(数据)
                  message.success('文件已打开')
                } catch {
                  message.error('文件格式不正确，无法打开')
                }
              } else {
                message.error(`打开文件失败：${结果.错误}`)
              }
            }).catch((error: unknown) => {
              message.error(`打开文件失败：${(error as Error).message || '未知错误'}`)
            })
          }
        }
      }).catch((error: unknown) => {
        message.error(`打开文件失败：${(error as Error).message || '未知错误'}`)
      })
      return
    }
    if (标识 === 'file.save') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      const 基准名 = 文稿.name.replace(/\.(pptx|pptx\.json)$/i, '').trim()
      const 默认路径 = 文档路径 ?? `${基准名 || '未命名演示'}.pptx`
      桥接.showSaveDialog(默认路径).then((文件路径: string | null) => {
        if (文件路径) {
          const 幻灯片模型 = 文稿.幻灯片列表.map((幻灯片) => ({
            文本: 幻灯片.文本框列表.map((框) =>框.text).join('\n'),
          }))
          const 模型 = { 幻灯片: 幻灯片模型 }
          桥接.office.writePptx(模型).then((结果: any) => {
            if (结果 && 结果.成功 && 结果.数据) {
              const 二进制内容 = 结果.数据
              桥接.saveToFile(文件路径, 二进制内容, '二进制').then((保存结果: any) => {
                if (保存结果.成功) {
                  set文档路径(文件路径)
                  set文稿((prev: any) => ({ ...prev, name: 基准名 || '未命名演示' }))
                  message.success('文件已保存')
                } else {
                  message.error(`保存失败：${保存结果.错误}`)
                }
              })
            } else {
              message.error('生成演示文稿文件失败，请重试')
            }
          }).catch((error: unknown) => {
            message.error(`保存失败：${(error as Error).message || '未知错误'}`)
          })
        }
      }).catch((error: unknown) => {
        message.error(`保存失败：${(error as Error).message || '未知错误'}`)
      })
      return
    }
    if (标识 === 'file.saveAs') {
      if (!桥接.可用) {
        message.info('当前环境不支持保存功能，请使用打包后的版本')
        return
      }
      const 基准名 = 文稿.name.replace(/\.(pptx|pptx\.json)$/i, '').trim()
      桥接.showSaveDialog(`${基准名 || '未命名演示'}.pptx`).then((文件路径: string | null) => {
        if (文件路径) {
          const 幻灯片模型 = 文稿.幻灯片列表.map((幻灯片) => ({
            文本: 幻灯片.文本框列表.map((框) =>框.text).join('\n'),
          }))
          const 模型 = { 幻灯片: 幻灯片模型 }
          桥接.office.writePptx(模型).then((结果: any) => {
            if (结果 && 结果.成功 && 结果.数据) {
              const 二进制内容 = 结果.数据
              桥接.saveToFile(文件路径, 二进制内容, '二进制').then((保存结果: any) => {
                if (保存结果.成功) {
                  set文档路径(文件路径)
                  set文稿((prev: any) => ({ ...prev, name: 基准名 || '未命名演示' }))
                  message.success('文件已另存为')
                } else {
                  message.error(`保存失败：${保存结果.错误}`)
                }
              })
            } else {
              message.error('生成演示文稿文件失败，请重试')
            }
          }).catch((error: unknown) => {
            message.error(`保存失败：${(error as Error).message || '未知错误'}`)
          })
        }
      }).catch((error: unknown) => {
        message.error(`保存失败：${(error as Error).message || '未知错误'}`)
      })
      return
    }
    if (标识 === 'edit.undo') {
      撤销()
      return
    }
    if (标识 === 'edit.redo') {
      重做()
      return
    }
    if (标识 === 'edit.cut' || 标识 === 'edit.copy' || 标识 === 'edit.paste') {
      message.info('剪切、复制、粘贴功能待接入')
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
    const 当前框标识 = 选中框标识 ?? 最近选中框标识.current
    if (当前幻灯片 === null || 当前框标识 === null) {
      return false
    }
    const 框 = 当前幻灯片.文本框列表.find((项) => 项.id === 当前框标识)
    if (框 === undefined) {
      return false
    }
    // 如果有片段列表，检查选中片段中是否有对应格式
    if (框.片段列表 && 框.片段列表.length > 0 && 选中起始 != null && 选中结束 != null) {
      // 简化：有选区时检查选中片段
      const 开始 = Math.min(选中起始, 选中结束)
      const 结束 = Math.max(选中起始, 选中结束)
      if (开始 !== 结束) {
        let 偏移量 = 0
        for (let i = 0; i < 框.片段列表.length; i++) {
          const 片段结束 = 偏移量 + 框.片段列表[i].文本.length
          if (偏移量 < 结束 && 片段结束 > 开始) {
            if (标识 === 'text.bold' && 框.片段列表[i].加粗) return true
            if (标识 === 'text.italic' && 框.片段列表[i].斜体) return true
            if (标识 === 'text.underline' && 框.片段列表[i].下划线) return true
          }
          偏移量 = 片段结束
        }
      }
    }
    if (标识 === 'text.bold') return 框.加粗
    if (标识 === 'text.italic') return 框.斜体
    if (标识 === 'text.underline') return 框.下划线
    if (标识 === 'para.alignLeft') return 框.对齐 === 'left'
    if (标识 === 'para.alignCenter') return 框.对齐 === 'center'
    if (标识 === 'para.alignRight') return 框.对齐 === 'right'
    return false
  }

  const 关闭菜单 = () => {
    set菜单可见(false)
  }

  const 构建演示菜单 = (): 菜单节点[] => {
    return [
      { type: 'group', 子项: [
        { type: 'item', commandId: 'slide.new', label: '新建幻灯片' },
        { type: 'item', commandId: 'slide.duplicate', label: '复制幻灯片' },
        { type: 'item', commandId: 'slide.delete', label: '删除幻灯片' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'slide.moveUp', label: '上移' },
        { type: 'item', commandId: 'slide.moveDown', label: '下移' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'edit.cut', label: '剪切' },
        { type: 'item', commandId: 'edit.copy', label: '复制' },
        { type: 'item', commandId: 'edit.paste', label: '粘贴' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'slide.layout', label: '版式' },
        { type: 'item', commandId: 'slide.background', label: '设置背景' },
        { type: 'item', commandId: 'view.gridlines', label: 显示网格线 ? '隐藏网格线' : '显示网格线' },
      ]},
      { type: 'divider' },
      { type: 'group', 子项: [
        { type: 'item', commandId: 'edit.undo', label: '撤销' },
        { type: 'item', commandId: 'edit.redo', label: '重做' },
      ]},
    ]
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
      onDropdownOpen: 处理下拉框打开,
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
            on选中框: 处理选框,
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
            on文本选择: 处理文本选择,
            onContextMenu: (x: number, y: number) => {
              set菜单坐标({ x, y })
              set菜单可见(true)
            },
          })
    ),
    React.createElement(PptStatusBar, { 文稿, 缩放, on缩放变化: set缩放 }),
    React.createElement(ContextMenu, {
      open: 菜单可见,
      x: 菜单坐标.x,
      y: 菜单坐标.y,
      items: 构建演示菜单(),
      onCommand: (命令标识: string, 参数?: string) => {
        if (命令标识 === '__close__') {
          关闭菜单()
          return
        }
        执行命令(命令标识, 参数)
        关闭菜单()
      },
    })
  )
}

export default PptEditor
