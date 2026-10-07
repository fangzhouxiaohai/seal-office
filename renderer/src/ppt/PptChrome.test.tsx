import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PptStatusBar } from './PptChrome'
import { 创建演示文稿 } from './deck'
describe('精确缩放状态栏', () => {
  it('按档位放大缩小，并在 8.33% 与 6400% 两端停住', () => {
    const 修改 = vi.fn()
    const { rerender } = render(<PptStatusBar 文稿={创建演示文稿()} 缩放={3} on缩放变化={修改} />)
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(修改).toHaveBeenLastCalledWith(4)

    修改.mockClear()
    rerender(<PptStatusBar 文稿={创建演示文稿()} 缩放={0.25} on缩放变化={修改} />)
    fireEvent.click(screen.getByRole('button', { name: '缩小' }))
    expect(修改).toHaveBeenLastCalledWith(0.125)
  })

  it('两端档位不再回传变化，百分比按档位显示', () => {
    const 修改 = vi.fn()
    const { rerender } = render(<PptStatusBar 文稿={创建演示文稿()} 缩放={0.0833} on缩放变化={修改} />)
    expect(screen.getByText('8.33%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '缩小' }))
    expect(修改).not.toHaveBeenCalled()

    rerender(<PptStatusBar 文稿={创建演示文稿()} 缩放={64} on缩放变化={修改} />)
    expect(screen.getByText('6400%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(修改).not.toHaveBeenCalled()
  })
})
