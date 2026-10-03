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
    const 取页面 = vi.fn(async () => ({ getViewport: 取视口, render: 渲染 }))
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 3, getPage: 取页面 }),
      destroy: vi.fn(),
    })

    render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)

    expect(await screen.findByText('第 1 页 / 共 3 页')).toBeInTheDocument()
    expect(取页面).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(取页面).toHaveBeenCalledWith(2))
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    await waitFor(() => expect(取视口).toHaveBeenCalledWith({ scale: 1.25 }))
    expect(screen.getByText('125%')).toBeInTheDocument()
  })

  it('窄阅读区先适配页面宽度，放大后允许横向滚动', async () => {
    const 渲染 = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: 渲染 })) }),
      destroy: vi.fn(),
    })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)
    const 舞台 = container.querySelector('.pdf-viewer__stage') as HTMLDivElement
    Object.defineProperty(舞台, 'clientWidth', { configurable: true, value: 400 })
    舞台.style.padding = '24px'
    fireEvent(window, new Event('resize'))
    const 画布 = container.querySelector('.pdf-viewer__canvas') as HTMLCanvasElement
    await waitFor(() => expect(画布.style.width).toBe('352px'))
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    await waitFor(() => expect(画布.style.width).toBe('440px'))
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
})
