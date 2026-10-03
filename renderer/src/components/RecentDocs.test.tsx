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

  it('列表视图渲染表头与数据行', () => {
    const { container } = render(<RecentDocs docs={文档集} title="最近文档" viewMode="list" />)
    expect(container.querySelectorAll('.wps-doc-row')).toHaveLength(2)
    expect(container.querySelectorAll('.wps-doc-list__col')).toHaveLength(5)
    expect(screen.getByText('修改时间')).toBeInTheDocument()
    expect(screen.getByText('大小')).toBeInTheDocument()
  })

  it('点击列表视图按钮回传 list', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" viewMode="grid" onViewModeChange={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '列表视图' }))
    expect(回调).toHaveBeenCalledWith('list')
  })

  it('点击网格视图按钮回传 grid', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" viewMode="list" onViewModeChange={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '网格视图' }))
    expect(回调).toHaveBeenCalledWith('grid')
  })

  it('选择排序项后回传对应排序键', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" sortKey="time" onSortChange={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '排序方式' }))
    await userEvent.click(await screen.findByText('按大小'))
    expect(回调).toHaveBeenCalledWith('size')
  })

  it('点击查看全部触发回调', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" onViewAll={回调} />)
    await userEvent.click(screen.getByText('查看全部'))
    expect(回调).toHaveBeenCalledTimes(1)
  })

  it('数据为空时展示空状态且不渲染网格', () => {
    const { container } = render(<RecentDocs docs={[]} title="最近文档" viewMode="grid" />)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(container.querySelector('.wps-doc-grid')).toBeNull()
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(0)
  })

  it('空状态的打开文件按钮触发回调', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={[]} title="最近文档" onEmptyAction={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '打开文件' }))
    expect(回调).toHaveBeenCalledTimes(1)
  })
})
