import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PdfViewer from './PdfViewer'
import { saveShortcutOverrides, SHORTCUT_STORAGE_KEY } from '../shortcuts/shortcuts'

const PDF模拟 = vi.hoisted(() => ({ 取文档: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: PDF模拟.取文档,
  GlobalWorkerOptions: { workerSrc: '' },
}))

describe('PDF 阅读预览', () => {
  afterEach(()=>{vi.restoreAllMocks()})
  beforeEach(() => {
    localStorage.removeItem(SHORTCUT_STORAGE_KEY)
    vi.clearAllMocks()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  })

  it('退出全屏先按原阅读区实际宽度排版，再恢复同一物理页，避免旧宽度定位落到下一页', async () => {
    const rect=HTMLElement.prototype.getBoundingClientRect,computed=window.getComputedStyle
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('pdf-viewer__stage')?(this.dataset.viewMode==='pages'?390:300):0})
    vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('pdf-viewer__stage')?600:0})
    vi.spyOn(window,'getComputedStyle').mockImplementation((node,pseudo)=>{const style=computed(node,pseudo);if(node instanceof HTMLElement&&node.classList.contains('pdf-viewer__stage'))return {...style,paddingLeft:node.dataset.viewMode==='pages'?'0px':'24px',paddingRight:node.dataset.viewMode==='pages'?'0px':'24px'} as CSSStyleDeclaration;return style})
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){if(this.classList.contains('pdf-viewer__stage'))return {top:0,bottom:600,left:0,right:this.clientWidth,width:this.clientWidth,height:600} as DOMRect;if(this.dataset.pdfPage){const stage=this.closest<HTMLElement>('.pdf-viewer__stage')!,index=Number(this.dataset.pdfPage)-1,height=Number.parseFloat(this.style.height),top=stage.dataset.viewMode==='pages'?12:24+index*(height+24)-stage.scrollTop;return {top,bottom:top+height,left:0,right:300,width:300,height} as DOMRect}return rect.call(this)})
    PDF模拟.取文档.mockReturnValue({promise:Promise.resolve({numPages:3,getPage:vi.fn(async()=>({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),getTextContent:async()=>({items:[]})}))}),destroy:vi.fn()})
    const {container}=render(<PdfViewer 数据={btoa('%PDF-1.7')} />)
    await screen.findByText('第 1 页 / 共 3 页')
    await waitFor(()=>expect(container.querySelector<HTMLCanvasElement>('canvas')?.style.width).toBe('252px'))
    fireEvent.click(screen.getByRole('button',{name:'全屏左右翻页阅读'}))
    fireEvent.click(screen.getByRole('button',{name:'下一页'}));await screen.findByText('第 2 页 / 共 3 页')
    fireEvent.click(screen.getByRole('button',{name:'放大'}))
    fireEvent.click(screen.getByRole('button',{name:'退出全屏阅读'}))
    await waitFor(()=>expect(container.querySelector<HTMLCanvasElement>('canvas')?.style.width).toBe('252px'))
    expect(screen.getByText('第 2 页 / 共 3 页')).toBeInTheDocument()
    const stage=container.querySelector<HTMLElement>('.pdf-viewer__stage')!
    expect(stage.scrollTop).toBeCloseTo(384)
  })

  it('左右分页沿用真实页码、全屏双指缩放后返回连续阅读并恢复原缩放和焦点', async () => {
    PDF模拟.取文档.mockReturnValue({promise:Promise.resolve({numPages:3,getPage:vi.fn(async()=>({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),getTextContent:async()=>({items:[]})}))}),destroy:vi.fn()})
    const {container}=render(<PdfViewer 数据={btoa('%PDF-1.7')} />)
    await screen.findByText('第 1 页 / 共 3 页')
    const original=container.querySelector('.pdf-viewer__stage') as HTMLElement
    Object.defineProperty(original,'clientWidth',{configurable:true,value:390});Object.defineProperty(original,'clientHeight',{configurable:true,value:600});fireEvent(window,new Event('resize'))
    fireEvent.click(screen.getByRole('button',{name:'全屏左右翻页阅读'}))
    const reader=screen.getByRole('dialog',{name:'PDF 阅读预览'}),stage=reader.querySelector('.pdf-viewer__stage') as HTMLElement
    Object.defineProperty(stage,'clientWidth',{configurable:true,value:390});Object.defineProperty(stage,'clientHeight',{configurable:true,value:600});fireEvent(window,new Event('resize'))
    expect(stage).toHaveAttribute('data-view-mode','pages');expect(reader.querySelectorAll('[data-pdf-slide]')).toHaveLength(3)
    await waitFor(()=>expect(reader.querySelector<HTMLCanvasElement>('.pdf-viewer__canvas')?.style.width).toBe('366px'))
    stage.scrollLeft=390;fireEvent.scroll(stage);await screen.findByText('第 2 页 / 共 3 页')
    const touch=(type:string,points:number[][])=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:points.map(([clientX,clientY])=>({clientX,clientY}))});fireEvent(stage.querySelector('[data-pdf-slide="2"]')!,event);return event}
    expect(touch('touchstart',[[100,150],[200,150]]).defaultPrevented).toBe(true)
    touch('touchmove',[[50,150],[250,150]]);touch('touchend',[])
    await screen.findByText('300%')
    fireEvent.click(screen.getByRole('button',{name:'退出全屏阅读'}))
    expect(screen.queryByRole('dialog',{name:'PDF 阅读预览'})).toBeNull()
    expect(container.querySelector('.pdf-viewer__stage')).toHaveAttribute('data-view-mode','continuous')
    expect(screen.getByText('150%')).toBeInTheDocument()
    await waitFor(()=>expect(screen.getByRole('button',{name:'全屏左右翻页阅读'})).toHaveFocus())
    expect(screen.queryByText('连续滚动')).toBeNull()
  })

  it('兼容 WPS PDF 缩放键位：实际大小、适应页宽与整页，并允许改绑导航', async () => {
    PDF模拟.取文档.mockReturnValue({
      promise: Promise.resolve({ numPages: 3, getPage: vi.fn(async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }), getTextContent: async () => ({ items: [] }) })) }),
      destroy: vi.fn(),
    })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="缩放快捷键.pdf" />)
    const stage = container.querySelector('.pdf-viewer__stage') as HTMLElement
    Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 400 })
    Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 500 })
    stage.style.padding = '24px'
    fireEvent(window, new Event('resize'))
    const canvas = await waitFor(() => {
      const node = container.querySelector('.pdf-viewer__canvas') as HTMLCanvasElement
      expect(node?.style.width).toBe('352px')
      return node
    })
    fireEvent.keyDown(stage, { key: '1', ctrlKey: true })
    await waitFor(() => expect(Number.parseFloat(canvas.style.width)).toBeCloseTo(600))
    fireEvent.keyDown(stage, { key: '2', ctrlKey: true })
    await waitFor(() => expect(Number.parseFloat(canvas.style.width)).toBeCloseTo(352))
    fireEvent.keyDown(stage, { key: '0', ctrlKey: true })
    await waitFor(() => expect(Number.parseFloat(canvas.style.height)).toBeCloseTo(452))
    const pageInput = screen.getByRole('spinbutton', { name: '跳转页码' })
    fireEvent.keyDown(pageInput, { key: '1', ctrlKey: true })
    expect(Number.parseFloat(canvas.style.height)).toBeCloseTo(452)
    saveShortcutOverrides({ 'pdf:view.nextPage': ['Ctrl+Alt+N'] })
    const old = new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, cancelable: true })
    fireEvent(stage, old)
    expect(old.defaultPrevented).toBe(true)
    const remapped = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, altKey: true, bubbles: true, cancelable: true })
    fireEvent(stage, remapped)
    expect(remapped.defaultPrevented).toBe(true)
    localStorage.removeItem(SHORTCUT_STORAGE_KEY)
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

  it('普通文档连续渲染全部页，滚动更新页码并保留指定页跳转', async () => {
    const 取页面 = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getTextContent: async () => ({ items: [] }),
    }))
    PDF模拟.取文档.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: 取页面 }), destroy: vi.fn() })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="两页文档.pdf" />)
    await screen.findByText('第 1 页 / 共 2 页')
    const 舞台 = container.querySelector('.pdf-viewer__stage') as HTMLDivElement
    const 页 = [...container.querySelectorAll<HTMLElement>('[data-pdf-page]')]
    expect(页).toHaveLength(2)
    expect(舞台).toHaveAttribute('data-view-mode', 'continuous')
    expect(screen.queryByText('连续滚动')).toBeNull()
    expect(screen.getByRole('button',{name:'切换左右翻页'})).toBeInTheDocument()
    await waitFor(() => expect(页.every((节点) => 节点.querySelector('canvas'))).toBe(true))
    Object.defineProperty(舞台, 'clientHeight', { configurable: true, value: 600 })
    舞台.getBoundingClientRect = () => ({ top: 0, bottom: 600 } as DOMRect)
    页.forEach((节点, 索引) => {
      节点.getBoundingClientRect = () => ({ top: 索引 * 1000 - 舞台.scrollTop, bottom: (索引 + 1) * 1000 - 舞台.scrollTop } as DOMRect)
    })
    fireEvent.scroll(舞台)
    await waitFor(() => expect(页[0].querySelector('canvas')).not.toBeNull())
    expect(页[1].querySelector('canvas')).not.toBeNull()

    舞台.scrollTop = 1100
    fireEvent.scroll(舞台)
    await screen.findByText('第 2 页 / 共 2 页')
    await waitFor(() => expect(页[1].querySelector('canvas')).not.toBeNull())
    expect(页[0].querySelector('canvas')).not.toBeNull()

    舞台.scrollTop = 0
    fireEvent.change(screen.getByRole('spinbutton', { name: '跳转页码' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '跳转到指定页' }))
    await screen.findByText('第 2 页 / 共 2 页')
    expect(舞台.scrollTop).toBe(1000)
    await waitFor(() => expect(页[1].querySelector('canvas')).not.toBeNull())
    expect(取页面).toHaveBeenCalledWith(2)
  })

  it('长文档保留全部连续页面占位，但只渲染阅读区附近的画布', async () => {
    const 取页面 = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      getTextContent: async () => ({ items: [] }),
    }))
    PDF模拟.取文档.mockReturnValue({ promise: Promise.resolve({ numPages: 30, getPage: 取页面 }), destroy: vi.fn() })
    const { container } = render(<PdfViewer 数据={btoa('%PDF-1.7')} 文件名="超长文档.pdf" />)
    await screen.findByText('第 1 页 / 共 30 页')
    const 页 = [...container.querySelectorAll<HTMLElement>('[data-pdf-page]')]
    expect(页).toHaveLength(30)
    await waitFor(() => expect(页[0].querySelector('canvas')).not.toBeNull())
    expect(页[29].querySelector('canvas')).toBeNull()
    expect(取页面).not.toHaveBeenCalledWith(30)
  })
})
