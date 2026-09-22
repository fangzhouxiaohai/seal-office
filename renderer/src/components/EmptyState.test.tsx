import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmptyState from './EmptyState'

describe('空状态', () => {
  it('展示标题与描述', () => {
    render(<EmptyState title="暂无最近文档" description="新建一个文档开始使用" />)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(screen.getByText('新建一个文档开始使用')).toBeInTheDocument()
  })

  it('提供操作按钮并响应点击', async () => {
    const 点击 = vi.fn()
    render(<EmptyState title="暂无最近文档" actionText="新建文档" onAction={点击} />)
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(点击).toHaveBeenCalledTimes(1)
  })

  it('未传入操作时不渲染按钮', () => {
    render(<EmptyState title="暂无最近文档" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
