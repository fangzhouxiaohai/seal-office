import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FindReplacePanel from './FindReplacePanel'

const 渲染面板 = (部分: Partial<React.ComponentProps<typeof FindReplacePanel>> = {}) => {
  const 回调 = {
    onClose: vi.fn(),
    onFind: vi.fn(() => 2),
    onReplace: vi.fn(() => 1),
    onReplaceAll: vi.fn(() => 3),
  }
  const 结果 = render(<FindReplacePanel open {...回调} {...部分} />)
  return { ...结果, 回调 }
}

describe('查找替换面板', () => {
  it('未打开时不渲染内容', () => {
    const { container } = render(
      <FindReplacePanel
        open={false}
        onClose={() => {}}
        onFind={() => 0}
        onReplace={() => 0}
        onReplaceAll={() => 0}
      />
    )
    expect(container.querySelector('.wps-find')).toBeNull()
  })

  it('查找内容为空时给出中文提示且不执行查找', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '查找下一个' }))
    expect(screen.getByText('请输入查找内容')).toBeInTheDocument()
    expect(回调.onFind).not.toHaveBeenCalled()
  })

  it('输入查找内容后执行查找并展示命中数量', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('查找内容'), '文档')
    await userEvent.click(screen.getByRole('button', { name: '查找下一个' }))
    expect(回调.onFind).toHaveBeenCalledWith('文档', false)
    expect(screen.getByText('找到 2 处')).toBeInTheDocument()
  })

  it('查找无结果时给出中文提示', async () => {
    渲染面板({ onFind: vi.fn(() => 0) })
    await userEvent.type(screen.getByPlaceholderText('查找内容'), '不存在')
    await userEvent.click(screen.getByRole('button', { name: '查找下一个' }))
    expect(screen.getByText('未找到匹配内容')).toBeInTheDocument()
  })

  it('替换当前命中项', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('查找内容'), '文档')
    await userEvent.type(screen.getByPlaceholderText('替换为'), '表格')
    await userEvent.click(screen.getByRole('button', { name: '替换' }))
    expect(回调.onReplace).toHaveBeenCalledWith('文档', '表格', false)
    expect(screen.getByText('已替换 1 处')).toBeInTheDocument()
  })

  it('全部替换并提示替换处数', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('查找内容'), '文档')
    await userEvent.type(screen.getByPlaceholderText('替换为'), '表格')
    await userEvent.click(screen.getByRole('button', { name: '全部替换' }))
    expect(回调.onReplaceAll).toHaveBeenCalledWith('文档', '表格', false)
    expect(screen.getByText('已替换 3 处')).toBeInTheDocument()
  })

  it('替换内容为空时提示补充替换内容', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('查找内容'), '文档')
    await userEvent.click(screen.getByRole('button', { name: '替换' }))
    expect(screen.getByText('请输入替换内容')).toBeInTheDocument()
    expect(回调.onReplace).not.toHaveBeenCalled()
  })

  it('勾选区分大小写后按区分大小写查找', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('查找内容'), 'Word')
    await userEvent.click(screen.getByRole('checkbox', { name: '区分大小写' }))
    await userEvent.click(screen.getByRole('button', { name: '查找下一个' }))
    expect(回调.onFind).toHaveBeenCalledWith('Word', true)
  })

  it('点击关闭回传关闭事件', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '关闭查找替换' }))
    expect(回调.onClose).toHaveBeenCalledTimes(1)
  })
})
