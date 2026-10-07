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

  it('列表视图把星标操作传递给对应文档', async () => {
    const 切换星标 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" viewMode="list" onToggleStar={切换星标} />)
    await userEvent.click(screen.getByRole('button', { name: '添加星标' }))
    expect(切换星标).toHaveBeenCalledWith('d01')
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

  describe('批量删除最近记录', () => {
    it('没有批量回调时不显示批量管理入口', () => {
      render(<RecentDocs docs={文档集} title="最近文档" />)
      expect(screen.queryByRole('button', { name: '批量管理' })).toBeNull()
    })

    it('进入批量管理后可勾选并全选，移除时回传选中标识', async () => {
      const 批量移除 = vi.fn().mockResolvedValue(true)
      const { container } = render(<RecentDocs docs={文档集} title="最近文档" onRemoveMany={批量移除} />)
      await userEvent.click(screen.getByRole('button', { name: '批量管理' }))
      expect(screen.getByText('已选 0 项')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: '选择 报告.docx' }))
      expect(screen.getByText('已选 1 项')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('checkbox', { name: '全选' }))
      expect(screen.getByText('已选 2 项')).toBeInTheDocument()
      // 全选后再次点击取消全选
      await userEvent.click(screen.getByRole('checkbox', { name: '全选' }))
      expect(screen.getByText('已选 0 项')).toBeInTheDocument()
      expect(container.querySelector('.wps-doc-card--selected')).toBeNull()

      await userEvent.click(screen.getByRole('checkbox', { name: '选择 预算.xlsx' }))
      await userEvent.click(screen.getByRole('button', { name: /移除所选/ }))
      expect(批量移除).toHaveBeenCalledWith(['d02'])
    })

    it('批量管理下点击卡片只勾选，不会打开文件', async () => {
      const 打开 = vi.fn()
      const 批量移除 = vi.fn().mockResolvedValue(false)
      render(<RecentDocs docs={文档集} title="最近文档" onOpen={打开} onRemoveMany={批量移除} />)
      await userEvent.click(screen.getByRole('button', { name: '批量管理' }))
      await userEvent.click(screen.getByRole('group', { name: '选择 报告.docx' }))
      expect(打开).not.toHaveBeenCalled()
      expect(screen.getByText('已选 1 项')).toBeInTheDocument()
    })

    it('列表视图同样支持批量勾选', async () => {
      const 批量移除 = vi.fn().mockResolvedValue(true)
      render(<RecentDocs docs={文档集} title="最近文档" viewMode="list" onRemoveMany={批量移除} />)
      await userEvent.click(screen.getByRole('button', { name: '批量管理' }))
      await userEvent.click(screen.getByRole('checkbox', { name: '选择 报告.docx' }))
      expect(screen.getByText('已选 1 项')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /移除所选/ }))
      expect(批量移除).toHaveBeenCalledWith(['d01'])
    })

    it('未选中任何记录时移除按钮不可用', async () => {
      render(<RecentDocs docs={文档集} title="最近文档" onRemoveMany={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: '批量管理' }))
      expect(screen.getByRole('button', { name: /移除所选/ })).toBeDisabled()
    })

    it('列表清空后自动退出批量管理', async () => {
      const 批量移除 = vi.fn().mockResolvedValue(true)
      const { container } = render(<RecentDocs docs={文档集} title="最近文档" onRemoveMany={批量移除} />)
      await userEvent.click(screen.getByRole('button', { name: '批量管理' }))
      await userEvent.click(screen.getByRole('checkbox', { name: '全选' }))
      await userEvent.click(screen.getByRole('button', { name: /移除所选/ }))
      // 移除成功（返回 true）后退出批量管理
      expect(screen.queryByText(/已选/)).toBeNull()
      expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(2)
    })
  })
})
