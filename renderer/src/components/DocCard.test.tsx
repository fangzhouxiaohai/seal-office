import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocCard from './DocCard'
import DocRow from './DocRow'
import type { DocItem } from '../mock/recentDocs'

const 文档: DocItem = {
  id: 'd01',
  name: '经营分析报告.docx',
  type: 'word',
  size: 2438144,
  updatedAt: '2026-09-22 18:30',
  starred: true,
  shared: true,
}

describe('文档卡片', () => {
  it('展示文件名、类型标签与大小', () => {
    render(<DocCard doc={文档} />)
    expect(screen.getByText('经营分析报告.docx')).toBeInTheDocument()
    expect(screen.getByText('文字')).toBeInTheDocument()
    expect(screen.getByText(/2\.3 MB/)).toBeInTheDocument()
  })

  it('单击回传选中事件', async () => {
    const 选中 = vi.fn()
    render(<DocCard doc={文档} onSelect={选中} />)
    await userEvent.click(screen.getByText('经营分析报告.docx'))
    expect(选中).toHaveBeenCalledWith(文档.id)
  })

  it('双击回传打开事件', async () => {
    const 打开 = vi.fn()
    render(<DocCard doc={文档} onOpen={打开} />)
    await userEvent.dblClick(screen.getByText('经营分析报告.docx'))
    expect(打开).toHaveBeenCalledWith(文档.id)
  })

  it('点击星标只触发星标切换，不触发选中', async () => {
    const 星标 = vi.fn()
    const 选中 = vi.fn()
    render(<DocCard doc={文档} onToggleStar={星标} onSelect={选中} />)
    await userEvent.click(screen.getByRole('button', { name: '取消星标' }))
    expect(星标).toHaveBeenCalledWith(文档.id)
    expect(选中).not.toHaveBeenCalled()
  })

  it('选中态带选中样式', () => {
    const { container } = render(<DocCard doc={文档} active />)
    expect(container.querySelector('.wps-doc-card--active')).not.toBeNull()
  })
})

describe('文档行', () => {
  it('展示文件名、类型、时间与大小', () => {
    render(<DocRow doc={文档} />)
    expect(screen.getByText('经营分析报告.docx')).toBeInTheDocument()
    expect(screen.getByText('文字')).toBeInTheDocument()
    expect(screen.getByText('2.3 MB')).toBeInTheDocument()
  })

  it('单击回传打开事件', async () => {
    const 打开 = vi.fn()
    render(<DocRow doc={文档} onOpen={打开} />)
    await userEvent.click(screen.getByText('经营分析报告.docx'))
    expect(打开).toHaveBeenCalledWith(文档.id)
  })
})
