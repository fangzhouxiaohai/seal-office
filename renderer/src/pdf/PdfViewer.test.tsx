import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PdfViewer from './PdfViewer'

const PDF模拟 = vi.hoisted(() => ({ 取文档: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: PDF模拟.取文档,
  GlobalWorkerOptions: { workerSrc: '' },
}))

describe('PDF 阅读预览', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  })

  it('显示真实页数，并允许翻页和调整缩放', async () => {
    const 渲染 = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    const 取视口 = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }))
    const 取页面 = vi.fn(async () => ({ getViewport: 取视口, render: 渲染, getTextContent: async () => ({ items: [] }) }))
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 3, getPage: 取页面 }),
      destroy: vi.fn(),
    })

    render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)

    expect(await screen.findByText('第 1 页 / 共 3 页')).toBeInTheDocument()
    await waitFor(() => expect(取页面).toHaveBeenCalledWith(1))
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(取页面).toHaveBeenCalledWith(2))
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    await waitFor(() => expect(取视口).toHaveBeenCalledWith({ scale: 1.75 }))
    expect(screen.getByText('175%')).toBeInTheDocument()
  })

  it('窄阅读区先适配页面宽度，放大后允许横向滚动', async () => {
    const 渲染 = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: 渲染, getTextContent: async () => ({ items: [] }) })) }),
      destroy: vi.fn(),
    })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)
    const 舞台 = container.querySelector('.pdf-viewer__stage') as HTMLDivElement
    Object.defineProperty(舞台, 'clientWidth', { configurable: true, value: 400 })
    舞台.style.padding = '24px'
    fireEvent(window, new Event('resize'))
    const 画布 = await waitFor(() => {
      const 节点 = container.querySelector('.pdf-viewer__canvas') as HTMLCanvasElement | null
      expect(节点?.style.width).toBe('352px')
      return 节点!
    })
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    await waitFor(() => expect(Number.parseFloat(画布.style.width)).toBeCloseTo(352 * 1.75 / 1.5, 1))
  })

  it('解析失败时通知工作台并显示失败状态', async () => {
    const 报错 = vi.fn()
    const 失败 = Promise.reject(new Error('文件结构损坏'))
    void 失败.catch(() => {})
    PDF模拟.取文档.mockReturnValue({ promise: 失败, destroy: vi.fn() })

    render(<PdfViewer 数据={btoa('bad')} 文件名="损坏.pdf" onError={报错} />)

    await waitFor(() => expect(报错).toHaveBeenCalledWith('无法打开「损坏.pdf」：文件结构损坏'))
    expect(screen.getByText('无法预览这份 PDF 文件')).toBeInTheDocument()
  })

  it('可复制本页和全文的可选中文字', async () => {
    const 写入 = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: 写入 } })
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage: vi.fn(async (页码: number) => ({
        getViewport: () => ({ width: 600, height: 800, convertToViewportPoint: () => [10, 30] }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [{ str: `第${页码}页合同`, transform: [1, 0, 0, 12, 10, 30], width: 60, height: 12 }] }),
      })) }), destroy: vi.fn(),
    })
    render(<PdfViewer 数据={btoa('%PDF-1.7')} />)
    const 本页按钮 = screen.getByRole('button', { name: '复制本页文字' })
    const 全文按钮 = screen.getByRole('button', { name: '复制全文文字' })
    // 工具条按钮统一为 32×32 的图标按钮，文案只保留在提示与无障碍名称里
    expect(本页按钮).toHaveTextContent('')
    expect(全文按钮).toHaveTextContent('')
    expect(本页按钮.querySelector('svg')).not.toBeNull()
    expect(全文按钮.querySelector('svg')).not.toBeNull()
    expect(本页按钮.getAttribute('title')).toBe('复制本页文字')
    await waitFor(() => expect(本页按钮).toBeEnabled())
    fireEvent.click(本页按钮)
    await waitFor(() => expect(写入).toHaveBeenCalledWith('第1页合同'))
    fireEvent.click(全文按钮)
    await waitFor(() => expect(写入).toHaveBeenCalledWith('第1页合同\n第2页合同'))
  })

  it('Ctrl+滚轮缩放阅读视口，未按 Ctrl 时不缩放', async () => {
    const 渲染 = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    const 取视口 = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }))
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => ({ getViewport: 取视口, render: 渲染, getTextContent: async () => ({ items: [] }) })) }),
      destroy: vi.fn(),
    })

    render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)
    expect(await screen.findByText('第 1 页 / 共 1 页')).toBeInTheDocument()

    const 滚 = (deltaY: number, ctrlKey = true) =>
      fireEvent(window, new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true }))
    滚(-100)
    await waitFor(() => expect(取视口).toHaveBeenCalledWith({ scale: 1.75 }))
    expect(screen.getByText('175%')).toBeInTheDocument()
    // 未按 Ctrl 时不缩放
    滚(-100, false)
    await waitFor(() => expect(screen.getByText('175%')).toBeInTheDocument())
    // 从默认 150% 放大：175% → 200% → 250%，继续滚动最终停在上限 6400%
    for (let 次 = 0; 次 < 2; 次 += 1) 滚(-100)
    await waitFor(() => expect(screen.getByText('250%')).toBeInTheDocument())
    for (let 次 = 0; 次 < 40; 次 += 1) 滚(-100)
    await waitFor(() => expect(screen.getByText('6400%')).toBeInTheDocument())
  })

  it('高倍缩放的渲染画布受像素预算限制，显示尺寸仍按缩放', async () => {
    const 渲染 = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    const 取视口 = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }))
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => ({ getViewport: 取视口, render: 渲染, getTextContent: async () => ({ items: [] }) })) }),
      destroy: vi.fn(),
    })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)
    await screen.findByText('第 1 页 / 共 1 页')
    for (let 次 = 0; 次 < 40; 次 += 1) fireEvent(window, new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }))
    await waitFor(() => expect(screen.getByText('6400%')).toBeInTheDocument())
    const 画布 = container.querySelector('.pdf-viewer__canvas') as HTMLCanvasElement
    // 6400% 下按显示尺寸分配画布会申请数亿像素，实际渲染按预算降采样
    expect(画布.width * 画布.height).toBeLessThanOrEqual(16_000_000)
    expect(Number.parseFloat(画布.style.width)).toBeCloseTo(600 * 64, 0)
  })

  it('连续排出所有页，滚动更新页码，输入页码可直接跳转并只渲染附近页面', async () => {
    const 取页面 = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getTextContent: async () => ({ items: [] }),
    }))
    PDF模拟.取文档.mockReturnValue({ promise: Promise.resolve({ numPages: 12, getPage: 取页面 }), destroy: vi.fn() })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="长文档.pdf" />)
    await screen.findByText('第 1 页 / 共 12 页')
    const 舞台 = container.querySelector('.pdf-viewer__stage') as HTMLDivElement
    const 页 = [...container.querySelectorAll<HTMLElement>('[data-pdf-page]')]
    expect(页).toHaveLength(12)
    Object.defineProperty(舞台, 'clientHeight', { configurable: true, value: 600 })
    舞台.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    页.forEach((节点, 索引) => {
      节点.getBoundingClientRect = () => ({ top: 索引 * 1000 - 舞台.scrollTop, bottom: (索引 + 1) * 1000 - 舞台.scrollTop } as DOMRect)
    })
    fireEvent.scroll(舞台)
    await waitFor(() => expect(页[0].querySelector('canvas')).not.toBeNull())
    expect(页[9].querySelector('canvas')).toBeNull()

    舞台.scrollTop = 2100
    fireEvent.scroll(舞台)
    await screen.findByText('第 3 页 / 共 12 页')
    await waitFor(() => expect(页[2].querySelector('canvas')).not.toBeNull())
    expect(页[0].querySelector('canvas')).toBeNull()

    fireEvent.change(screen.getByRole('spinbutton', { name: '跳转页码' }), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '跳转到指定页' }))
    await screen.findByText('第 10 页 / 共 12 页')
    expect(舞台.scrollTop).toBe(9000)
    await waitFor(() => expect(页[9].querySelector('canvas')).not.toBeNull())
    expect(取页面).toHaveBeenCalledWith(10)
  })
})
