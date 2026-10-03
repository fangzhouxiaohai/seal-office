import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { 载入PDF } from './pdfLoader'

interface Props {
  数据?: string
  文件名?: string
  onError?: (文本: string) => void
}

type 阅读状态 = '空白' | '加载中' | '就绪' | '失败'
const 缩放下限 = 0.5
const 缩放上限 = 2
const 缩放步长 = 0.25

const PdfViewer = ({ 数据, 文件名 = 'PDF 文件', onError }: Props) => {
  const [文档, set文档] = useState<PDFDocumentProxy | null>(null)
  const [状态, set状态] = useState<阅读状态>('空白')
  const [当前页, set当前页] = useState(1)
  const [缩放, set缩放] = useState(1)
  const 画布 = useRef<HTMLCanvasElement | null>(null)
  const 报错回调 = useRef(onError)
  报错回调.current = onError

  useEffect(() => {
    let 已取消 = false
    let 关闭文档: (() => void) | null = null
    set文档(null)
    set当前页(1)
    set缩放(1)
    if (!数据) {
      set状态('空白')
      return
    }
    set状态('加载中')
    void 载入PDF(数据).then((结果) => {
      if (已取消) {
        结果.关闭()
        return
      }
      关闭文档 = 结果.关闭
      set文档(结果.文档)
      set状态('就绪')
    }).catch((错误: unknown) => {
      if (已取消) return
      set状态('失败')
      报错回调.current?.(`无法打开「${文件名}」：${错误 instanceof Error ? 错误.message : '文件格式无法识别'}`)
    })
    return () => {
      已取消 = true
      关闭文档?.()
    }
  }, [数据, 文件名])

  useEffect(() => {
    if (文档 === null || 状态 !== '就绪') return
    let 已取消 = false
    let 渲染任务: RenderTask | null = null
    void (async () => {
      try {
        const 页面 = await 文档.getPage(当前页)
        if (已取消) return
        const 视口 = 页面.getViewport({ scale: 缩放 })
        const 节点 = 画布.current
        const 画笔 = 节点?.getContext('2d')
        if (!节点 || !画笔) throw new Error('无法创建页面画布')
        const 像素比 = Math.min(window.devicePixelRatio || 1, 2)
        节点.width = Math.floor(视口.width * 像素比)
        节点.height = Math.floor(视口.height * 像素比)
        节点.style.width = `${视口.width}px`
        渲染任务 = 页面.render({
          canvas: 节点,
          canvasContext: 画笔,
          viewport: 视口,
          transform: 像素比 === 1 ? undefined : [像素比, 0, 0, 像素比, 0, 0],
        })
        await 渲染任务.promise
      } catch (错误) {
        if (已取消 || (错误 instanceof Error && 错误.name === 'RenderingCancelledException')) return
        set状态('失败')
        报错回调.current?.(`无法显示「${文件名}」第 ${当前页} 页：${错误 instanceof Error ? 错误.message : '页面渲染失败'}`)
      }
    })()
    return () => {
      已取消 = true
      渲染任务?.cancel()
    }
  }, [文档, 状态, 当前页, 缩放, 文件名])

  const 总页数 = 文档?.numPages ?? 0
  const 翻页 = (差值: number) => set当前页((页码) => Math.min(总页数, Math.max(1, 页码 + 差值)))
  const 调整缩放 = (差值: number) => set缩放((当前) => Math.min(缩放上限, Math.max(缩放下限, 当前 + 差值)))

  return (
    <section className="pdf-viewer" aria-label="PDF 阅读预览">
      <div className="pdf-viewer__toolbar">
        <span className="pdf-viewer__name" title={文件名}>{数据 ? 文件名 : '文档预览'}</span>
        <div className="pdf-viewer__controls">
          <button type="button" aria-label="上一页" disabled={状态 !== '就绪' || 当前页 <= 1} onClick={() => 翻页(-1)}>上一页</button>
          <span className="pdf-viewer__counter" aria-live="polite">{总页数 > 0 ? `第 ${当前页} 页 / 共 ${总页数} 页` : '未打开文件'}</span>
          <button type="button" aria-label="下一页" disabled={状态 !== '就绪' || 当前页 >= 总页数} onClick={() => 翻页(1)}>下一页</button>
          <span className="pdf-viewer__divider" aria-hidden="true" />
          <button type="button" aria-label="缩小" disabled={状态 !== '就绪' || 缩放 <= 缩放下限} onClick={() => 调整缩放(-缩放步长)}>缩小</button>
          <span className="pdf-viewer__zoom" aria-live="polite">{Math.round(缩放 * 100)}%</span>
          <button type="button" aria-label="放大" disabled={状态 !== '就绪' || 缩放 >= 缩放上限} onClick={() => 调整缩放(缩放步长)}>放大</button>
        </div>
      </div>
      <div className="pdf-viewer__stage">
        {状态 === '空白' && <div className="pdf-viewer__empty">选择本机 PDF 文件后，在这里阅读页面</div>}
        {状态 === '加载中' && <div className="pdf-viewer__empty" role="status">正在打开 PDF 文件…</div>}
        {状态 === '失败' && <div className="pdf-viewer__empty" role="status">无法预览这份 PDF 文件</div>}
        <canvas ref={画布} className="pdf-viewer__canvas" aria-label={`第 ${当前页} 页`} hidden={状态 !== '就绪'} />
      </div>
    </section>
  )
}

export default PdfViewer
