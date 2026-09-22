import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecentDocs from './RecentDocs'
import type { DocItem } from '../mock/recentDocs'

const 文档集: DocItem[] = [
  { id: 'd01', name: '报告.docx', type: 'word', size: 2048, updatedAt: '2026-09-22 18:30', starred: false, shared: false },
  { id: 'd02', name: '预算.xlsx', type: 'table', size: 4096, updatedAt: '2026-09-22 15:12', starred: true, shared: false },
]

describe('最近文档区块', () => {
  it('展示区块标题', () => {
    render(<RecentDocs docs={文档集} title="最近文档" />)
    expect(screen.getByText('最近文档')).toBeInTheDocument()
  })

  it('网格视图渲染卡片', () => {
    const { container } = render(<RecentDocs docs={文档集} title="最近文档" viewMode="grid" />)
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(2)
  })

  it('列表视图渲染行与表头', () => {
    const { container } = render(<RecentDocs docs={文档集} title="最近文档" viewMode="list" />)
    expect(container.querySelectorAll('.wps-doc-row')).toHaveLength(2)
    expect(screen.getByText('修改时间')).toBeInTheDocument()
    expect(screen.getByText('大小')).toBeInTheDocument()
  })

  it('切换视图回传新模式', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" viewMode="grid" onViewModeChange={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '列表视图' }))
    expect(回调).toHaveBeenCalledWith('list')
  })

  it('数据为空时展示空状态并隐藏网格', () => {
    const { container } = render(<RecentDocs docs={[]} title="最近文档" viewMode="grid" />)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(container.querySelector('.wps-doc-grid')).toBeNull()
  })

  it('空状态的新建按钮触发回调', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={[]} title="最近文档" onEmptyAction={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(回调).toHaveBeenCalledTimes(1)
  })
})
