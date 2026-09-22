// 编辑器容器：装配文档标签栏、Ribbon、标尺、编辑区、查找面板与状态栏。
// 全部编辑行为通过 commands.ts 的命令注册表派发，此文件只负责上下文实现与区域编排。
import React, { useRef, useState } from 'react'
import { App as AntdApp } from 'antd'
import { useAppStore } from '../store'
import { 命令表, type CommandContext, type InsertableKind, type ViewState, type 选区格式 } from './commands'
import { HistoryStack } from './history'
import { countWords } from './wordCount'
import { 下载文本, 导出为Html, 导出为文本, 生成文件名 } from './exportDoc'
import { 检查文本 } from './spellCheck'
import RibbonTabs from './ribbon/RibbonTabs'
import RibbonPanel from './ribbon/RibbonPanel'
import DocumentTabs from './DocumentTabs'
import EditorCanvas from './EditorCanvas'
import Ruler from './Ruler'
import FindReplacePanel from './FindReplacePanel'
import EditorStatusBar from './EditorStatusBar'

const 默认视图: ViewState = {
  缩放: 1,
  标尺: true,
  网格线: false,
  段落标记: false,
  视图模式: '页面视图',
  纸张: 'A4',
  页边距: '常规',
  分栏: '一栏',
  水印: '无',
  页面边框: '无',
  页面颜色: '无',
  文字方向: '横排',
  显示批注: true,
  修订模式: false,
}

/** 转义正则元字符，供查找替换使用 */
function 转义正则(文本: string): string {
  return 文本.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 统计关键词在编辑区文本中的命中次数 */
function 统计命中(根: HTMLElement, 关键词: string, 区分大小写: boolean): number {
  if (关键词.length === 0) {
    return 0
  }
  const 正则 = new RegExp(转义正则(关键词), 区分大小写 ? 'g' : 'gi')
  return ((根.textContent ?? '').match(正则) ?? []).length
}

/** 替换首个命中，返回替换处数 */
function 替换首个(根: HTMLElement, 关键词: string, 替换为: string, 区分大小写: boolean): number {
  const 正则 = new RegExp(转义正则(关键词), 区分大小写 ? '' : 'i')
  let 已替换 = 0
  const 遍历 = (节点: Node) => {
    if (已替换 > 0) {
      return
    }
    if (节点.nodeType === Node.TEXT_NODE) {
      const 原文 = 节点.textContent ?? ''
      const 匹配 = 正则.exec(原文)
      if (匹配 !== null) {
        节点.textContent =
          原文.slice(0, 匹配.index) + 替换为 + 原文.slice(匹配.index + 匹配[0].length)
        已替换 = 1
      }
      return
    }
    节点.childNodes.forEach(遍历)
  }
  遍历(根)
  return 已替换
}

/** 替换全部命中，返回替换处数 */
function 替换全部(根: HTMLElement, 关键词: string, 替换为: string, 区分大小写: boolean): number {
  const 正则 = new RegExp(转义正则(关键词), 区分大小写 ? 'g' : 'gi')
  let 计数 = 0
  const 遍历 = (节点: Node) => {
    if (节点.nodeType === Node.TEXT_NODE) {
      const 原文 = 节点.textContent ?? ''
      if (原文.length === 0) {
        return
      }
      const 新文 = 原文.replace(正则, () => {
        计数 += 1
        return 替换为
      })
      if (新文 !== 原文) {
        节点.textContent = 新文
      }
      return
    }
    节点.childNodes.forEach(遍历)
  }
  遍历(根)
  return 计数
}

const 表格模板 = (): string => {
  const 单元格 = '<td style="border:1px solid #E8EBF0;padding:6px 8px">&nbsp;</td>'
  const 行 = `<tr>${单元格.repeat(3)}</tr>`
  return `<table style="border-collapse:collapse;width:100%"><tbody>${行.repeat(3)}</tbody></table><p><br></p>`
}

const 封面模板 = (): string =>
  '<div style="text-align:center;padding:80px 0">' +
  '<p style="font-size:32px;font-weight:600;margin:0 0 24px">文档标题</p>' +
  '<p style="font-size:14px;color:#5C6472;margin:0 0 8px">作者名称</p>' +
  '<p style="font-size:14px;color:#5C6472;margin:0">2026 年 9 月</p>' +
  '</div><div class="wps-page-break"></div>'

const DocEditor = () => {
  const { message } = AntdApp.useApp()
  const {
    documents,
    activeDocumentId,
    updateEditorHtml,
    closeEditorDoc,
    createEditorDoc,
    setActiveDocumentId,
  } = useAppStore()

  const [当前标签, set当前标签] = useState('start')
  const [视图, set视图] = useState<ViewState>(默认视图)
  const [查找打开, set查找打开] = useState(false)
  const [内容版本, set内容版本] = useState(0)

  const 编辑区引用 = useRef<HTMLDivElement | null>(null)
  const 历史表 = useRef<Map<string, HistoryStack>>(new Map())
  const 输入计时器 = useRef<number | null>(null)
  /** 格式刷暂存；使用稳定对象以便命令读写同一份状态 */
  const 格式刷容器 = useRef<{ 值: 选区格式 | null }>({ 值: null })

  const 当前文档 = documents.find((项) => 项.id === activeDocumentId) ?? null
  const 文档标识 = 当前文档?.id ?? ''

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
    const 新栈 = new HistoryStack()
    历史表.current.set(文档标识, 新栈)
    return 新栈
  }

  const 刷新 = () => set内容版本((值) => 值 + 1)

  const 记录历史 = (): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    取历史().record({ html: 元素.innerHTML, selection: null })
  }

  const 同步内容 = (): void => {
    const 元素 = 编辑区引用.current
    if (元素 !== null && 文档标识.length > 0) {
      updateEditorHtml(文档标识, 元素.innerHTML)
    }
  }

  const 执行格式化 = (指令: string, 值?: string): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    元素.focus()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(指令, false, 值)
  }

  const 插入内容 = (html: string): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    元素.focus()
    // 修订模式下把插入内容标记为修订，便于后续接受或拒绝
    const 实际内容 = 视图.修订模式 ? `<span class="wps-insert">${html}</span>` : html
    document.execCommand('insertHTML', false, 实际内容)
    记录历史()
    同步内容()
  }

  const 选择图片 = (): void => {
    const 输入 = document.createElement('input')
    输入.type = 'file'
    输入.accept = 'image/*'
    输入.onchange = () => {
      const 文件 = 输入.files?.[0]
      if (文件 === undefined) {
        return
      }
      const 读取器 = new FileReader()
      读取器.onload = () => {
        插入内容(
          `<img src="${String(读取器.result)}" alt="${文件.name}" style="max-width:100%" /><p><br></p>`
        )
      }
      读取器.onerror = () => message.error('图片读取失败，请重新选择')
      读取器.readAsDataURL(文件)
    }
    输入.click()
  }

  const 插入资源 = (类型: InsertableKind): void => {
    switch (类型) {
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
        插入内容('<div style="width:160px;height:80px;border:1.6px solid #2B6CF6;border-radius:6px"></div><p><br></p>')
        break
      case '文本框':
        插入内容('<div style="border:1px solid #E8EBF0;padding:8px 10px;border-radius:6px">文本框内容</div><p><br></p>')
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
        插入内容('<a href="https://www.wps.cn" style="color:#2B6CF6">链接文字</a>')
        break
      case '书签':
        插入内容('<span style="background:#FFF3B0">书签</span>')
        break
      case '脚注':
        插入内容('<sup>[1]</sup>')
        break
      case '尾注':
        插入内容('<sup>[i]</sup>')
        break
      default:
        // 页眉、页脚与页码需要分节与页面模型，本轮不提供简化替代
        message.info('该功能开发中')
        break
    }
  }

  const 设置段落样式 = (样式: {
    lineHeight?: string
    textAlign?: string
    backgroundColor?: string
  }): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    元素.querySelectorAll('p, div, h1, h2, h3').forEach((块) => {
      Object.assign((块 as HTMLElement).style, 样式)
    })
    记录历史()
    同步内容()
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
    字号: 查询取值('fontSize'),
    颜色: 查询取值('foreColor'),
  })

  const 应用选区格式 = (格式: 选区格式): void => {
    const 元素 = 编辑区引用.current
    if (元素 === null) {
      return
    }
    元素.focus()
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
      document.execCommand('fontSize', false, 格式.字号)
    }
    if (格式.颜色.length > 0) {
      document.execCommand('foreColor', false, 格式.颜色)
    }
  }

  const 上下文: CommandContext = {
    root: 编辑区引用.current ?? document.createElement('div'),
    history: 取历史(),
    refresh: 刷新,
    notify: (文本: string) => message.info(文本),
    view: 视图,
    setView: (部分) => {
      set视图((当前) => ({ ...当前, ...部分 }))
      set内容版本((值) => 值 + 1)
    },
    执行格式化,
    查询格式: (指令: string) => {
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
      同步内容()
    },
    插入内容,
    读取内容: () => 编辑区引用.current?.innerHTML ?? '',
    下载: (内容: string, 文件名: string, 类型: string) => 下载文本(内容, 文件名, 类型),
    打开查找: () => set查找打开(true),
    导出,
    检查拼写,
    切换全选,
    插入资源,
    设置段落样式,
    应用样式,
    切换段落类名,
    读取选区格式,
    应用选区格式,
    格式刷暂存: 格式刷容器.current,
    当前文档名: 当前文档?.name ?? '未命名文档',
  }

  const 执行命令 = (命令标识: string, 参数?: string): void => {
    const 命令 = 命令表[命令标识]
    if (命令 === undefined) {
      message.error('该命令未注册')
      return
    }
    命令.run(上下文, 参数)
  }

  const 文本内容 = (() => {
    void 内容版本
    return 编辑区引用.current?.textContent ?? ''
  })()
  const 统计 = countWords(文本内容)
  const 页数 = Math.max(1, Math.ceil(统计.词数 / 500))

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(DocumentTabs, {
      documents: documents.map((项) => ({ id: 项.id, name: 项.name })),
      activeId: activeDocumentId,
      onSelect: (标识: string) => setActiveDocumentId(标识),
      onClose: closeEditorDoc,
      onCreate: createEditorDoc,
    }),
    React.createElement(RibbonTabs, { activeKey: 当前标签, onChange: set当前标签 }),
    React.createElement(RibbonPanel, {
      activeKey: 当前标签,
      onCommand: 执行命令,
      获取激活态: (命令标识: string) => {
        if (命令标识 === 'track.enable') {
          return 视图.修订模式
        }
        if (命令标识 === 'comment.show') {
          return 视图.显示批注
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
        return false
      },
    }),
    查找打开
      ? React.createElement(FindReplacePanel, {
          open: 查找打开,
          onClose: () => set查找打开(false),
          onFind: (关键词: string, 区分大小写: boolean) => {
            const 元素 = 编辑区引用.current
            return 元素 === null ? 0 : 统计命中(元素, 关键词, 区分大小写)
          },
          onReplace: (关键词: string, 替换为: string, 区分大小写: boolean) => {
            const 元素 = 编辑区引用.current
            if (元素 === null) {
              return 0
            }
            const 计数 = 替换首个(元素, 关键词, 替换为, 区分大小写)
            if (计数 > 0) {
              记录历史()
              同步内容()
            }
            return 计数
          },
          onReplaceAll: (关键词: string, 替换为: string, 区分大小写: boolean) => {
            const 元素 = 编辑区引用.current
            if (元素 === null) {
              return 0
            }
            const 计数 = 替换全部(元素, 关键词, 替换为, 区分大小写)
            if (计数 > 0) {
              记录历史()
              同步内容()
            }
            return 计数
          },
        })
      : null,
    视图.标尺 ? React.createElement(Ruler, null) : null,
    React.createElement(
      'div',
      { className: 'wps-editor-stage' },
      React.createElement(EditorCanvas, {
        html: 当前文档?.html ?? '<p><br></p>',
        showParagraphMark: 视图.段落标记,
        gridlines: 视图.网格线,
        vertical: 视图.文字方向 === '竖排',
        showComments: 视图.显示批注,
        scale: 视图.缩放,
        onReady: (元素: HTMLDivElement) => {
          编辑区引用.current = 元素
          取历史().record({ html: 元素.innerHTML, selection: null })
        },
        onChange: (html: string) => {
          if (文档标识.length > 0) {
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
      })
    ),
    React.createElement(EditorStatusBar, {
      页码: 1,
      总页数: 页数,
      字数: 统计.词数,
      缩放: 视图.缩放,
      视图模式: 视图.视图模式,
      on缩放变化: (值: number) => set视图((当前) => ({ ...当前, 缩放: 值 })),
    })
  )
}

export default DocEditor
