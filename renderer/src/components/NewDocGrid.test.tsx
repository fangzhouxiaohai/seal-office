import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewDocGrid from './NewDocGrid'

describe('新建四宫格', () => {
  it('渲染四张入口卡片', () => {
    const { container } = render(<NewDocGrid onSelect={() => {}} />)
    expect(container.querySelectorAll('.wps-new-card')).toHaveLength(4)
  })

  it('展示四项中文名称', () => {
    render(<NewDocGrid onSelect={() => {}} />)
    ;['新建文字', '新建表格', '新建演示', 'PDF 工具'].forEach((名称) => {
      expect(screen.getByText(名称)).toBeInTheDocument()
    })
  })

  it('点击卡片回传对应类型', async () => {
    const 回调 = vi.fn()
    render(<NewDocGrid onSelect={回调} />)
    await userEvent.click(screen.getByText('新建表格'))
    expect(回调).toHaveBeenCalledWith('table')
  })

  it('四个入口均已实现，无禁用卡片', () => {
    const { container } = render(<NewDocGrid onSelect={() => {}} />)
    const 禁用项 = container.querySelectorAll('.wps-new-card--disabled')
    expect(禁用项).toHaveLength(0)
  })
})
