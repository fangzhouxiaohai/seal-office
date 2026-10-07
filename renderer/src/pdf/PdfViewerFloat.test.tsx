import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PdfViewer from './PdfViewer'

const PDF模拟 = vi.hoisted(() => ({ 取文档: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: PDF模拟.取文档,
  GlobalWorkerOptions: { workerSrc: '' },
}))

beforeEach(() => {
  // jsdom 不实现布局：给出合成矩形，浮窗才能按选区定位
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 160, y: 220, left: 160, top: 220, right: 320, bottom: 240, width: 160, height: 20, toJSON: () => ({}) }),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
})

afterEach(() => { vi.restoreAllMocks() })

/** 选中文字层里的第一段文字（等待文字层渲染完成） */
const 选中文字层 = async (容器: HTMLElement, 文本: string) => {
  const 层 = 容器.querySelector('.pdf-viewer__text-layer') as HTMLElement
  const 项 = await waitFor(() => {
    const 命中 = [...层.querySelectorAll('span')].find((节点) => (节点.textContent ?? '').includes(文本))
    if (!命中) throw new Error(`文字层尚未渲染：${文本}`)
    return 命中 as HTMLElement
  })
  const 范围 = document.createRange()
  范围.selectNodeContents(项)
  const 选择 = window.getSelection()
  选择?.removeAllRanges()
  选择?.addRange(范围)
  fireEvent.mouseUp(层)
  return 层
}

describe('PDF 阅读选区浮窗', () => {
  it('选中文字后浮出复制与 AI 面板，未选中不出现', async () => {
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, convertToViewportPoint: () => [10, 30] }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [{ str: '合同条款正文', transform: [1, 0, 0, 12, 10, 30], width: 80, height: 12 }] }),
      })) }),
      destroy: vi.fn(),
    })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)
    await screen.findByText('第 1 页 / 共 1 页')
    expect(screen.queryByRole('toolbar', { name: '选中文字操作' })).toBeNull()

    await 选中文字层(container, '合同条款正文')
    const 面板 = await screen.findByRole('toolbar', { name: '选中文字操作' })
    for (const 名称 of ['复制', '翻译', '解释', '总结', '问答']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
  })

  it('复制按钮写入选中文字，AI 按钮把文字交给助手', async () => {
    const 写入 = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: 写入 } })
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, convertToViewportPoint: () => [10, 30] }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [{ str: '需要翻译的句子', transform: [1, 0, 0, 12, 10, 30], width: 90, height: 12 }] }),
      })) }),
      destroy: vi.fn(),
    })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="样本.pdf" onError={vi.fn()} />)
    await screen.findByText('第 1 页 / 共 1 页')
    await 选中文字层(container, '需要翻译的句子')
    const 面板 = await screen.findByRole('toolbar', { name: '选中文字操作' })

    await userEvent.click(within(面板).getByRole('button', { name: '复制' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('需要翻译的句子'))

    const 收到 = vi.fn()
    window.addEventListener('seal-assistant-ask', 收到)
    try {
      await userEvent.click(within(面板).getByRole('button', { name: '翻译' }))
      expect(收到).toHaveBeenCalledOnce()
      const 文本 = (收到.mock.calls[0][0] as CustomEvent<{ 文本: string }>).detail.文本
      expect(文本).toContain('翻译')
      expect(文本).toContain('需要翻译的句子')
    } finally {
      window.removeEventListener('seal-assistant-ask', 收到)
    }
  })
})
