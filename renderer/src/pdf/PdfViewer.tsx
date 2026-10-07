import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { 载入PDF } from './pdfLoader'
import Icon from '../components/Icon'

interface Props {
  数据?: string
  文件名?: string
  onError?: (文本: string) => void
}

type 阅读状态 = '空白' | '加载中' | '就绪' | '失败'
interface 页面文字项 { 文本: string; x: number; y: number; 宽: number; 高: number }
const 缩放下限 = 0.5
const 缩放上限 = 2
const 缩放步长 = 0.25

const PdfViewer = ({ 数据, 文件名 = 'PDF 文件', onError }: Props) => {
  const [文档, set文档] = useState<PDFDocumentProxy | null>(null)
  const [状态, set状态] = useState<阅读状态>('空白')
  const [当前页, set当前页] = useState(1)
  const [缩放, set缩放] = useState(1)
  const [可用宽度, set可用宽度] = useState<number | null>(null)
  const [页面文字, set页面文字] = useState('')
  const [文字项, set文字项] = useState<页面文字项[]>([])
  const [页面尺寸, set页面尺寸] = useState({ 宽: 0, 高: 0 })
  const [复制状态, set复制状态] = useState('')
  const 画布 = useRef<HTMLCanvasElement | null>(null)
  const 阅读区 = useRef<HTMLDivElement | null>(null)
  const 报错回调 = useRef(onError)
  报错回调.current = onError

  useEffect(() => {
    const 节点 = 阅读区.current
    if (!节点) return
    const 更新宽度 = () => {
      const 样式 = window.getComputedStyle(节点)
      const 左边距 = Number.parseFloat(样式.paddingLeft) || 0
      const 右边距 = Number.parseFloat(样式.paddingRight) || 0
      const 宽度 = Math.max(0, 节点.clientWidth - 左边距 - 右边距)
      if (宽度 > 0) set可用宽度((当前) => 当前 === 宽度 ? 当前 : 宽度)
    }
    更新宽度()
    window.addEventListener('resize', 更新宽度)
    const 观察器 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(更新宽度)
    观察器?.observe(节点)
    return () => {
      window.removeEventListener('resize', 更新宽度)
      观察器?.disconnect()
    }
  }, [])

  useEffect(() => {
    let 已取消 = false
    let 关闭文档: (() => void) | null = null
    set文档(null)
    set当前页(1)
    set缩放(1)
    set页面文字('')
    set文字项([])
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
    set页面文字('')
    set文字项([])
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
        const 原始宽度 = 视口.width / 缩放
        const 显示宽度 = Math.min(原始宽度, 可用宽度 ?? 原始宽度) * 缩放
        节点.style.width = `${显示宽度}px`
        const 显示高度 = 视口.height * 显示宽度 / 视口.width
        节点.style.height = `${显示高度}px`
        set页面尺寸({ 宽: 显示宽度, 高: 显示高度 })
        渲染任务 = 页面.render({
          canvas: 节点,
          canvasContext: 画笔,
          viewport: 视口,
          transform: 像素比 === 1 ? undefined : [像素比, 0, 0, 像素比, 0, 0],
        })
        await 渲染任务.promise
        const 文本内容 = await 页面.getTextContent()
        if (已取消) return
        const 比例 = 显示宽度 / 视口.width
        const 行 = [] as 页面文字项[]
        for (const 原项 of 文本内容.items) {
          const 项 = 原项 as unknown as { str?: string; transform?: number[]; width?: number; height?: number }
          if (!项.str || !项.transform || 项.transform.length < 6) continue
          const [x, y] = 视口.convertToViewportPoint(项.transform[4], 项.transform[5])
          const 高 = Math.max(1, (项.height || Math.hypot(项.transform[2], 项.transform[3])) * 缩放 * 比例)
          行.push({ 文本: 项.str, x: x * 比例, y: y * 比例 - 高, 宽: Math.max(1, (项.width || 1) * 缩放 * 比例), 高 })
        }
        set文字项(行)
        set页面文字(行.map((项) => 项.文本).join(' '))
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
  }, [文档, 状态, 当前页, 缩放, 文件名, 可用宽度])

  const 总页数 = 文档?.numPages ?? 0
  const 翻页 = (差值: number) => set当前页((页码) => Math.min(总页数, Math.max(1, 页码 + 差值)))
  const 调整缩放 = (差值: number) => set缩放((当前) => Math.min(缩放上限, Math.max(缩放下限, 当前 + 差值)))
  const 复制本页 = async () => {
    if (!页面文字.trim()) return
    try {
      await navigator.clipboard.writeText(页面文字)
      set复制状态('已复制本页文字')
    } catch { set复制状态('复制失败，请检查剪贴板权限') }
  }
  const 复制全文 = async () => {
    if (!文档) return
    try {
      const 页面: string[] = []
      for (let 页码 = 1; 页码 <= 文档.numPages; 页码 += 1) {
        const 内容 = await (await 文档.getPage(页码)).getTextContent()
        页面.push(内容.items.map((项) => 'str' in 项 ? 项.str : '').join(' '))
      }
      const 文字 = 页面.join('\n').trim()
      if (!文字) { set复制状态('这份 PDF 没有可复制的文字'); return }
      await navigator.clipboard.writeText(文字)
      set复制状态(`已复制全文，共 ${文档.numPages} 页`)
    } catch { set复制状态('复制失败，请检查剪贴板权限') }
  }

  return (
    <section className="pdf-viewer" aria-label="PDF 阅读预览">
      <div className="pdf-viewer__toolbar">
        <span className="pdf-viewer__name" title={文件名}>{数据 ? 文件名 : '文档预览'}</span>
        <div className="pdf-viewer__controls">
          <button type="button" aria-label="上一页" title="上一页" disabled={状态 !== '就绪' || 当前页 <= 1} onClick={() => 翻页(-1)}><Icon name="arrow-left" size={15} /></button>
          <span className="pdf-viewer__counter" aria-live="polite">{总页数 > 0 ? `第 ${当前页} 页 / 共 ${总页数} 页` : '未打开文件'}</span>
          <button type="button" aria-label="下一页" title="下一页" disabled={状态 !== '就绪' || 当前页 >= 总页数} onClick={() => 翻页(1)}><Icon name="arrow-left" size={15} className="pdf-viewer__forward" /></button>
          <span className="pdf-viewer__divider" aria-hidden="true" />
          <button type="button" aria-label="缩小" title="缩小" disabled={状态 !== '就绪' || 缩放 <= 缩放下限} onClick={() => 调整缩放(-缩放步长)}><Icon name="zoom-out" size={15} /></button>
          <span className="pdf-viewer__zoom" aria-live="polite">{Math.round(缩放 * 100)}%</span>
          <button type="button" aria-label="放大" title="放大" disabled={状态 !== '就绪' || 缩放 >= 缩放上限} onClick={() => 调整缩放(缩放步长)}><Icon name="zoom-in" size={15} /></button>
          <button type="button" aria-label="复制本页文字" title="复制本页文字" disabled={!页面文字.trim()} onClick={() => void 复制本页()}>复制文字</button>
          <button type="button" aria-label="复制全文文字" title="复制全文文字" disabled={状态 !== '就绪'} onClick={() => void 复制全文()}>复制全文</button>
        </div>
      </div>
      {复制状态 && <span className="pdf-viewer__copy-status" role="status">{复制状态}</span>}
      <div ref={阅读区} className="pdf-viewer__stage">
        {状态 === '空白' && <div className="pdf-viewer__empty">选择本机 PDF 文件后，在这里阅读页面</div>}
        {状态 === '加载中' && <div className="pdf-viewer__empty" role="status">正在打开 PDF 文件…</div>}
        {状态 === '失败' && <div className="pdf-viewer__empty" role="status">无法预览这份 PDF 文件</div>}
        <div className="pdf-viewer__page" style={页面尺寸.宽 ? { width: 页面尺寸.宽, height: 页面尺寸.高 } : undefined} hidden={状态 !== '就绪'}>
          <canvas ref={画布} className="pdf-viewer__canvas" aria-label={`第 ${当前页} 页`} />
          <div className="pdf-viewer__text-layer" aria-label="可选择的 PDF 文字">
            {文字项.map((项, 索引) => <span key={索引} style={{ left: 项.x, top: 项.y, minWidth: 项.宽, height: 项.高, fontSize: 项.高 }}>{项.文本}</span>)}
          </div>
        </div>
      </div>
    </section>
  )
}

export default PdfViewer
