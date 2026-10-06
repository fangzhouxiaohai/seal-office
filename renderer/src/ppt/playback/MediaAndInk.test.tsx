import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import SlideshowView from '../SlideshowView'
import { 创建演示文稿, 创建幻灯片, type 演示对象 } from '../deck'
import { 创建媒体对象, 创建墨迹对象 } from '../model/mediaObjects'
import { SlideObjects } from '../render/SlideObjects'
import { 临时批迹层, 橡皮移除, 屏幕转画布, type 批迹 } from './PresenterTools'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

function 安装接口(额外: Record<string, unknown> = {}) {
  const 退出 = vi.fn().mockResolvedValue({ 成功: true })
  const 打开 = vi.fn().mockResolvedValue({ 成功: true })
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    enterSlideshowFullscreen: vi.fn().mockResolvedValue({ 成功: true, 会话标识: '会话' }),
    exitSlideshowFullscreen: 退出,
    onSlideshowEnded: () => () => {},
    openExternal: 打开,
    ...额外,
  } })
  return { 退出, 打开 }
}

const 媒体对象 = (额外: Partial<演示对象> = {}): 演示对象 => ({ ...创建媒体对象('a'.repeat(64), '视频'), ...额外 })
const 含媒体文稿 = (对象: 演示对象, 额外: Record<string, unknown> = {}) => {
  const 页 = 创建幻灯片('空白')
  页.对象列表 = [对象]
  Object.assign(页, 额外)
  return { ...创建演示文稿(), 幻灯片列表: [页] }
}

describe('媒体呈现', () => {
  it('编辑态显示封面占位，不加载媒体元素', () => {
    const 对象 = 媒体对象()
    render(<AntdApp><div style={{ position: 'relative' }}><SlideObjects 幻灯片={{ ...创建幻灯片('空白'), 对象列表: [对象] }} 图片地址={{}} /></div></AntdApp>)
    expect(screen.getByLabelText('视频封面')).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  it('放映态按资源地址渲染真实媒体元素', () => {
    const 对象 = 媒体对象()
    render(<AntdApp><div style={{ position: 'relative' }}><SlideObjects 幻灯片={{ ...创建幻灯片('空白'), 对象列表: [对象] }} 图片地址={{ [对象.资源标识!]: 'data:video/mp4;base64,AAAA' }} 放映 /></div></AntdApp>)
    const 元素 = document.querySelector('video')
    expect(元素).toBeTruthy()
    expect(元素?.getAttribute('src')).toContain('data:video/mp4')
    expect(元素?.getAttribute('data-媒体标识')).toBe(对象.id)
  })

  it('音频对象使用音频元素并保留封面', () => {
    const 对象: 演示对象 = { ...创建媒体对象('b'.repeat(64), '音频') }
    render(<AntdApp><div style={{ position: 'relative' }}><SlideObjects 幻灯片={{ ...创建幻灯片('空白'), 对象列表: [对象] }} 图片地址={{ [对象.资源标识!]: 'data:audio/wav;base64,AAAA' }} 放映 /></div></AntdApp>)
    expect(document.querySelector('audio')).toBeTruthy()
    expect(screen.getByLabelText('音频封面')).toBeInTheDocument()
  })

  it('永久笔迹按页面坐标绘制折线', () => {
    const 对象 = 创建墨迹对象([[{ x: 100, y: 110 }, { x: 200, y: 160 }]], '#2B6CF6', 5)
    render(<AntdApp><div style={{ position: 'relative' }}><SlideObjects 幻灯片={{ ...创建幻灯片('空白'), 对象列表: [对象] }} 图片地址={{}} /></div></AntdApp>)
    const 折线 = document.querySelector('polyline')
    expect(折线?.getAttribute('points')).toBe('100,110 200,160')
    expect(折线?.getAttribute('stroke')).toBe('#2B6CF6')
  })
})

describe('放映动作与音效', () => {
  it('点击带网页链接的对象时打开外部链接而不是翻页', async () => {
    const { 打开 } = 安装接口()
    const 对象 = 媒体对象({ 链接: { 类型: '网页', 目标: 'https://example.com/doc' } })
    const 翻页 = vi.fn()
    render(<AntdApp><SlideshowView 文稿={含媒体文稿(对象)} 当前索引={0} on翻页={翻页} on退出={vi.fn()} 图片地址={{ [对象.资源标识!]: 'data:video/mp4;base64,AAAA' }} /></AntdApp>)
    const 目标 = document.querySelector(`[data-对象标识="${对象.id}"]`)
    expect(目标).toBeTruthy()
    fireEvent.click(目标!)
    await vi.waitFor(() => expect(打开).toHaveBeenCalledWith('https://example.com/doc'))
    expect(翻页).not.toHaveBeenCalledWith(1)
  })

  it('点击结束放映动作的对象时退出放映', async () => {
    安装接口()
    const 对象 = 媒体对象({ 链接: { 类型: '结束', 目标: '' } })
    const 退出 = vi.fn()
    render(<AntdApp><SlideshowView 文稿={含媒体文稿(对象)} 当前索引={0} on翻页={vi.fn()} on退出={退出} /></AntdApp>)
    fireEvent.click(document.querySelector(`[data-对象标识="${对象.id}"]`)!)
    await vi.waitFor(() => expect(退出).toHaveBeenCalled())
  })

  it('页面切换音效按资源地址渲染音频元素', () => {
    安装接口()
    const 页 = 创建幻灯片('空白')
    页.音效 = { 资源标识: 'c'.repeat(64), 音量: 70, 循环: false }
    const 文稿 = { ...创建演示文稿(), 幻灯片列表: [页] }
    render(<AntdApp><SlideshowView 文稿={文稿} 当前索引={0} on翻页={vi.fn()} on退出={vi.fn()} 图片地址={{ [页.音效.资源标识]: 'data:audio/wav;base64,AAAA' }} /></AntdApp>)
    const 音效元素 = document.querySelector('audio[aria-label="切换音效"]')
    expect(音效元素?.getAttribute('src')).toContain('data:audio/wav')
  })

  it('放映工具提供画笔、激光笔、黑屏与白屏入口', () => {
    安装接口()
    render(<AntdApp><SlideshowView 文稿={含媒体文稿(媒体对象())} 当前索引={0} on翻页={vi.fn()} on退出={vi.fn()} /></AntdApp>)
    for (const 名称 of ['画笔', '橡皮', '清除', '激光笔', '黑屏', '白屏']) expect(screen.getByRole('button', { name: 名称 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '黑屏' }))
    expect(document.querySelector('.wps-slideshow__screen')?.getAttribute('data-屏幕')).toBe('黑')
    fireEvent.click(screen.getByRole('button', { name: '白屏' }))
    expect(document.querySelector('.wps-slideshow__screen')?.getAttribute('data-屏幕')).toBe('白')
    fireEvent.click(screen.getByRole('button', { name: '白屏' }))
    expect(document.querySelector('.wps-slideshow__screen')).toBeNull()
  })
})

describe('临时批迹工具', () => {
  it('按画布缩放把屏幕坐标换算为页面坐标', () => {
    const 区域 = { left: 0, top: 0, width: 1920, height: 1080 } as DOMRect
    expect(屏幕转画布({ clientX: 0, clientY: 0 }, 区域)).toEqual({ x: 0, y: 0 })
    expect(屏幕转画布({ clientX: 960, clientY: 540 }, 区域)).toEqual({ x: 480, y: 270 })
    expect(屏幕转画布({ clientX: 5000, clientY: 5000 }, 区域)).toEqual({ x: 960, y: 540 })
  })

  it('橡皮移除命中的整条笔画，未命中时保持不变', () => {
    const 批迹: 批迹 = { 颜色: '#E34D59', 笔宽: 3, 笔画: [[{ x: 100, y: 100 }, { x: 120, y: 100 }], [{ x: 400, y: 400 }, { x: 420, y: 400 }]] }
    expect(橡皮移除(批迹, { x: 110, y: 100 }).笔画).toHaveLength(1)
    expect(橡皮移除(批迹, { x: 800, y: 500 }).笔画).toHaveLength(2)
  })

  it('画笔按下并拖动后形成一条连续笔画', () => {
    const 批迹: 批迹 = { 颜色: '#E34D59', 笔宽: 3, 笔画: [] }
    const on批迹 = vi.fn()
    render(<临时批迹层 工具="画笔" 颜色="#E34D59" 笔宽={3} 批迹={批迹} 激光位置={null} on批迹={on批迹} on激光={vi.fn()} on橡皮={vi.fn()} />)
    const 画布 = document.querySelector('svg.wps-present-ink') as SVGSVGElement
    画布.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    // jsdom 的 PointerEvent 不携带坐标，用带坐标的鼠标事件触发同一处理函数。
    画布.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }))
    expect(on批迹).toHaveBeenCalled()
    expect((on批迹.mock.calls[0][0] as 批迹).笔画[0][0]).toEqual({ x: 100, y: 100 })
  })
})
