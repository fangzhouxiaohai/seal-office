import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SlideshowView from './SlideshowView'
import { 创建演示文稿, 添加幻灯片, type 演示文稿 } from './deck'

/** 构造一份两页的演示文稿 */
const 构造文稿 = (): 演示文稿 => {
  const 文稿 = 创建演示文稿('测试.pptx')
  return 添加幻灯片(文稿)
}

describe('全屏放映视图', () => {
  it('渲染页码指示器并默认从第一页开始', () => {
    render(<SlideshowView 文稿={构造文稿()} 当前索引={0} on翻页={() => {}} on退出={() => {}} />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('方向键翻页并同步页码指示', () => {
    const 翻页 = vi.fn()
    render(<SlideshowView 文稿={构造文稿()} 当前索引={0} on翻页={翻页} on退出={() => {}} />)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(翻页).toHaveBeenCalledWith(1)
  })

  it('最后一页再前进即结束放映', () => {
    const 退出 = vi.fn()
    render(<SlideshowView 文稿={构造文稿()} 当前索引={1} on翻页={() => {}} on退出={退出} />)
    fireEvent.click(screen.getByRole('dialog'))
    waitFor(() => expect(退出).toHaveBeenCalled())
    expect(退出).toHaveBeenCalled()
  })

  it('Escape 退出放映', () => {
    const 退出 = vi.fn()
    render(<SlideshowView 文稿={构造文稿()} 当前索引={0} on翻页={() => {}} on退出={退出} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(退出).toHaveBeenCalled()
  })
})
