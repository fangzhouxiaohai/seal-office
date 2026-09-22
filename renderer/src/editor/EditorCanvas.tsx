// 编辑区：contentEditable 容器与 A4 纸张。
// 采用非受控写法，仅在外来内容与当前 DOM 不一致时同步，避免 React 重渲染打断输入。
import React, { useEffect, useRef } from 'react'

interface Props {
  html: string
  editable?: boolean
  showParagraphMark?: boolean
  gridlines?: boolean
  /** 竖排文字，用于文字方向切换 */
  vertical?: boolean
  scale?: number
  onChange?: (html: string) => void
  onReady?: (元素: HTMLDivElement) => void
}

const EditorCanvas = ({
  html,
  editable = true,
  showParagraphMark = false,
  gridlines = false,
  vertical = false,
  scale = 1,
  onChange,
  onReady,
}: Props) => {
  const 引用 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const 元素 = 引用.current
    if (元素 !== null && 元素.innerHTML !== html) {
      元素.innerHTML = html
    }
  }, [html])

  useEffect(() => {
    if (引用.current !== null && onReady !== undefined) {
      onReady(引用.current)
    }
    // 仅在挂载时回调一次，元素引用在组件生命周期内不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const 处理输入 = () => {
    const 元素 = 引用.current
    if (元素 !== null && onChange !== undefined) {
      onChange(元素.innerHTML)
    }
  }

  const 容器类名 = [
    'wps-editor-canvas',
    showParagraphMark ? 'wps-editor-canvas--marks' : '',
    gridlines ? 'wps-editor-canvas--gridlines' : '',
    vertical ? 'wps-editor-canvas--vertical' : '',
  ]
    .filter((项) => 项.length > 0)
    .join(' ')

  return React.createElement(
    'div',
    { className: 容器类名 },
    React.createElement(
      'div',
      { className: 'wps-editor-canvas__paper', style: { transform: `scale(${scale})` } },
      React.createElement('div', {
        ref: 引用,
        className: 'wps-editor-canvas__content',
        contentEditable: editable,
        suppressContentEditableWarning: true,
        spellCheck: false,
        onInput: 处理输入,
      })
    )
  )
}

export default EditorCanvas
