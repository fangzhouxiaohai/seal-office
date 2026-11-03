// PDF 关键词查找条。
//
// 独立成组件的原因：查找条需要自己的输入焦点、按键处理与命中计数，
// 混进 PdfViewer 会让那 480 行的阅读器继续膨胀；而查找状态（关键词、
// 命中列表、当前命中）由 PdfViewer 持有，本组件只负责输入与展示。
import { useEffect, useRef } from 'react'
import Icon from '../components/Icon'

export interface Props {
  打开: boolean
  /** 命中总数 */
  总数: number
  /** 当前命中序号，从 1 开始；无命中为 0 */
  当前序号: number
  /** 关键词（受控，便于外部「查找选中文字」直接填入） */
  关键词: string
  /** 无可用文字层时的说明 */
  提示?: string
  on关键词变更: (值: string) => void
  on下一个: () => void
  on上一个: () => void
  on关闭: () => void
}

const PdfFindBar = ({
  打开, 总数, 当前序号, 关键词, 提示, on关键词变更, on下一个, on上一个, on关闭,
}: Props) => {
  const 输入 = useRef<HTMLInputElement | null>(null)

  // 打开后自动聚焦并全选，方便直接改关键词
  useEffect(() => {
    if (!打开) return
    const 节点 = 输入.current
    if (节点 === null) return
    节点.focus()
    节点.select()
  }, [打开])

  if (!打开) return null

  const 计数文字 = 关键词.trim() === ''
    ? '请输入关键词'
    : 总数 === 0
      ? '无匹配'
      : `${当前序号} / ${总数}`

  return (
    <div className="pdf-viewer__find" role="search" aria-label="PDF 关键词查找">
      <Icon name="search" size={15} />
      <input
        ref={输入}
        type="search"
        aria-label="查找关键词"
        placeholder="查找关键词，回车跳到下一个"
        value={关键词}
        onChange={(事件) => on关键词变更(事件.target.value)}
        onKeyDown={(事件) => {
          if (事件.key === 'Enter') {
            事件.preventDefault()
            if (事件.shiftKey) on上一个()
            else on下一个()
          } else if (事件.key === 'Escape') {
            事件.preventDefault()
            on关闭()
          }
        }}
      />
      <span className="pdf-viewer__find-count" aria-live="polite">{计数文字}</span>
      <button type="button" aria-label="上一个匹配" title="上一个匹配（Shift+Enter）" disabled={总数 === 0} onClick={on上一个}>
        <Icon name="arrow-left" size={15} className="pdf-find__prev" />
      </button>
      <button type="button" aria-label="下一个匹配" title="下一个匹配（Enter）" disabled={总数 === 0} onClick={on下一个}>
        <Icon name="arrow-left" size={15} className="pdf-find__next" />
      </button>
      <button type="button" aria-label="关闭查找" title="关闭查找（Esc）" onClick={on关闭}>
        <Icon name="close" size={15} />
      </button>
      {提示 ? <span className="pdf-viewer__find-hint" role="status">{提示}</span> : null}
    </div>
  )
}

export default PdfFindBar
