// 编辑区：contentEditable 容器与页面纸张。
// 采用非受控写法，仅在外来内容与当前 DOM 不一致时同步，避免 React 重渲染打断输入。
import React, { useEffect, useRef } from 'react'
import { 净化富文本 } from './sanitizeHtml'

/** 纸张尺寸映射（96dpi 像素，宽×高），未知值回落 A4 */
const 纸张尺寸: Record<string, [number, number]> = {
  A4: [794, 1123],
  A5: [559, 794],
  B5: [665, 945],
  Letter: [816, 1056],
}

/** 页边距映射（上下边距、左右边距，像素） */
const 页边距映射: Record<string, [number, number]> = {
  常规: [96, 90],
  窄: [36, 36],
  适中: [96, 72],
  宽: [96, 144],
}

/** 分栏数映射；偏左/偏右以两栏近似呈现 */
const 分栏映射: Record<string, number> = {
  一栏: 1,
  两栏: 2,
  三栏: 3,
  偏左: 2,
  偏右: 2,
}

/** 页面边框样式映射 */
const 页面边框样式: Record<string, React.CSSProperties> = {
  方框: { border: '2px solid #4A4A4A' },
  阴影: { border: '2px solid #4A4A4A', boxShadow: '4px 4px 6px rgba(0,0,0,0.35)' },
  三维: { border: '5px ridge #9AA4B0' },
}

/** 水印文案映射 */
const 水印文案: Record<string, string> = {
  草稿: '草稿',
  机密: '机密',
  禁止复制: '禁止复制',
}

interface Props {
  html: string
  editable?: boolean
  showParagraphMark?: boolean
  gridlines?: boolean
  /** 竖排文字，用于文字方向切换 */
  vertical?: boolean
  /** 是否显示批注标记 */
  showComments?: boolean
  scale?: number
  /** 页面布局设置（来自视图状态，未提供时保持默认 A4 纵向外观） */
  paper?: string
  orientation?: string
  margin?: string
  columns?: string
  watermark?: string
  pageBorder?: string
  pageColor?: string
  customPaper?: { 宽: number; 高: number }
  customMargin?: { 上: number; 右: number; 下: number; 左: number }
  headerHtml?: string
  footerHtml?: string
  onHeaderChange?: (html: string) => void
  onFooterChange?: (html: string) => void
  onChange?: (html: string) => void
  onBeforeChange?: (元素: HTMLDivElement) => void
  onReady?: (元素: HTMLDivElement) => void
  /** 右键点击回调，返回坐标 */
  onContextMenu?: (x: number, y: number) => void
}

const EditorCanvas = ({
  html,
  editable = true,
  showParagraphMark = false,
  gridlines = false,
  vertical = false,
  showComments = true,
  scale = 1,
  paper = 'A4',
  orientation = '纵向',
  margin = '常规',
  columns = '一栏',
  watermark = '无',
  pageBorder = '无',
  pageColor = '无',
  customPaper,
  customMargin,
  headerHtml,
  footerHtml,
  onHeaderChange,
  onFooterChange,
  onChange,
  onBeforeChange,
  onReady,
  onContextMenu,
}: Props) => {
  const 引用 = useRef<HTMLDivElement>(null)
  const 页眉引用 = useRef<HTMLDivElement>(null)
  const 页脚引用 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const 元素 = 引用.current
    const 安全内容 = 净化富文本(html)
    if (元素 !== null && 元素.innerHTML !== 安全内容) {
      元素.innerHTML = 安全内容
    }
  }, [html])

  useEffect(() => {
    for (const [元素, 内容] of [[页眉引用.current, headerHtml], [页脚引用.current, footerHtml]] as const) {
      if (元素) {
        const 安全内容 = 净化富文本(内容 ?? '')
        if (元素.innerHTML !== 安全内容) 元素.innerHTML = 安全内容
      }
    }
  }, [headerHtml, footerHtml])

  useEffect(() => {
    if (引用.current !== null && onReady !== undefined) {
      onReady(引用.current)
    }
    // 仅在挂载时回调一次，元素引用在组件生命周期内不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const 处理输入 = () => {
    const 元素 = 引用.current
    if (元素 !== null) {
      onBeforeChange?.(元素)
      const 安全内容 = 净化富文本(元素.innerHTML)
      if (元素.innerHTML !== 安全内容) 元素.innerHTML = 安全内容
      onChange?.(安全内容)
    }
  }

  const 处理右键 = (事件: React.MouseEvent) => {
    if (onContextMenu !== undefined) {
      事件.preventDefault()
      onContextMenu(事件.clientX, 事件.clientY)
    }
  }

  // 纸张尺寸与边距：横向时宽高互换
  const 自定义纸张 = paper === '自定义' && customPaper !== undefined
  const [宽, 高] = 自定义纸张
    ? [customPaper.宽 / 15, customPaper.高 / 15]
    : (纸张尺寸[paper] ?? 纸张尺寸.A4)
  const 横向 = orientation === '横向'
  const [边距上下, 边距左右] = 页边距映射[margin] ?? 页边距映射.常规
  const 页面宽 = 自定义纸张 ? 宽 : 横向 ? 高 : 宽
  const 页面高 = 自定义纸张 ? 高 : 横向 ? 宽 : 高
  const 内边距 = margin === '自定义' && customMargin
    ? `${customMargin.上 / 15}px ${customMargin.右 / 15}px ${customMargin.下 / 15}px ${customMargin.左 / 15}px`
    : `${边距上下}px ${边距左右}px`
  const 栏数 = 分栏映射[columns] ?? 1
  const 页眉页脚样式: React.CSSProperties = {
    left: margin === '自定义' && customMargin ? customMargin.左 / 15 : 边距左右,
    right: margin === '自定义' && customMargin ? customMargin.右 / 15 : 边距左右,
  }
  const 纸张样式: React.CSSProperties = {
    // Layout zoom reserves the full scaled height, including multi-page content.
    // A centered transform otherwise puts the left side outside the scroll range.
    zoom: scale,
    flex: '0 0 auto',
    width: 页面宽,
    minHeight: 页面高,
    padding: 内边距,
    ...(pageColor !== '无' && pageColor !== '' ? { background: pageColor } : {}),
    ...(页面边框样式[pageBorder] ?? {}),
    position: 'relative',
    boxSizing: 'border-box',
  }
  const 水印文本 = 水印文案[watermark]

  const 容器类名 = [
    'wps-editor-canvas',
    showParagraphMark ? 'wps-editor-canvas--marks' : '',
    gridlines ? 'wps-editor-canvas--gridlines' : '',
    vertical ? 'wps-editor-canvas--vertical' : '',
    showComments ? '' : 'wps-editor-canvas--hide-comments',
  ]
    .filter((项) => 项.length > 0)
    .join(' ')

  return React.createElement(
    'div',
    { className: 容器类名, style: { minWidth: 页面宽 * scale + 40 } },
    React.createElement(
      'div',
      { className: 'wps-editor-canvas__paper', style: 纸张样式 },
      水印文本 !== undefined
        ? React.createElement(
            'div',
            {
              className: 'wps-editor-canvas__watermark',
              'aria-hidden': true,
            },
            水印文本
          )
        : null,
      headerHtml !== undefined || onHeaderChange
        ? React.createElement('div', {
            ref: 页眉引用,
            className: 'wps-editor-canvas__header',
            style: 页眉页脚样式,
            contentEditable: editable,
            suppressContentEditableWarning: true,
            'aria-label': '页眉',
            onInput: (event: React.FormEvent<HTMLDivElement>) => { onBeforeChange?.(event.currentTarget); onHeaderChange?.(净化富文本(event.currentTarget.innerHTML)) },
          }) : null,
      React.createElement('div', {
        ref: 引用,
        className: 'wps-editor-canvas__content',
        contentEditable: editable,
        suppressContentEditableWarning: true,
        spellCheck: false,
        style: 栏数 > 1 ? { columnCount: 栏数, columnGap: '24px' } : undefined,
        onInput: 处理输入,
        onContextMenu: 处理右键,
      }),
      footerHtml !== undefined || onFooterChange
        ? React.createElement('div', {
            ref: 页脚引用,
            className: 'wps-editor-canvas__footer',
            style: 页眉页脚样式,
            contentEditable: editable,
            suppressContentEditableWarning: true,
            'aria-label': '页脚',
            onInput: (event: React.FormEvent<HTMLDivElement>) => { onBeforeChange?.(event.currentTarget); onFooterChange?.(净化富文本(event.currentTarget.innerHTML)) },
          }) : null
    )
  )
}

export default EditorCanvas
