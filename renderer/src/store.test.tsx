import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppStore } from './store'

/** 探针组件：把状态与操作暴露为可点击按钮，便于断言 */
const 探针 = ({ 提示文本 }: { 提示文本?: (文本: string) => void }) => {
  const 状态 = useAppStore()
  return (
    <div>
      <span data-testid="module">{状态.module}</span>
      <span data-testid="nav">{状态.navKey}</span>
      <span data-testid="view">{状态.viewMode}</span>
      <span data-testid="sort">{状态.sortKey}</span>
      <span data-testid="star-count">{状态.docs.filter((文档) => 文档.starred).length}</span>
      <span data-testid="visible-count">{状态.visibleDocs.length}</span>
      <button onClick={() => 状态.setModule('word')}>切模块</button>
      <button onClick={() => 状态.setNavKey('star')}>切星标</button>
      <button onClick={() => 状态.setViewMode('list')}>切列表</button>
      <button onClick={() => 状态.setSortKey('size')}>切排序</button>
      <button onClick={() => 状态.toggleStar(状态.docs[0].id)}>切首个星标</button>
      <button onClick={() => 状态.handleNav('cloud', 提示文本 ?? (() => {}))}>切云文档</button>
    </div>
  )
}

const 渲染探针 = (提示文本?: (文本: string) => void) =>
  render(
    <AppProvider>
      <探针 提示文本={提示文本} />
    </AppProvider>
  )

describe('应用状态层', () => {
  it('初始处于首页、网格视图、按时间排序', () => {
    渲染探针()
    expect(screen.getByTestId('module')).toHaveTextContent('home')
    expect(screen.getByTestId('nav')).toHaveTextContent('home')
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
    expect(screen.getByTestId('sort')).toHaveTextContent('time')
  })

  it('初始展示全部示例文档', () => {
    渲染探针()
    expect(screen.getByTestId('visible-count')).toHaveTextContent('12')
  })

  it('切换模块后模块标识更新', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切模块'))
    expect(screen.getByTestId('module')).toHaveTextContent('word')
  })

  it('切换到星标筛选后可见文档减少', async () => {
    渲染探针()
    const 切换前 = screen.getByTestId('visible-count').textContent
    await userEvent.click(screen.getByText('切星标'))
    expect(screen.getByTestId('nav')).toHaveTextContent('star')
    expect(screen.getByTestId('visible-count').textContent).not.toBe(切换前)
  })

  it('切换视图模式生效', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切列表'))
    expect(screen.getByTestId('view')).toHaveTextContent('list')
  })

  it('切换排序方式生效', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切排序'))
    expect(screen.getByTestId('sort')).toHaveTextContent('size')
  })

  it('切换星标后星标数量变化', async () => {
    渲染探针()
    const 切换前 = Number(screen.getByTestId('star-count').textContent)
    await userEvent.click(screen.getByText('切首个星标'))
    const 切换后 = Number(screen.getByTestId('star-count').textContent)
    expect(Math.abs(切换后 - 切换前)).toBe(1)
  })

  it('未实现的导航项不切换内容并给出中文提示', async () => {
    const 提示 = vi.fn()
    渲染探针(提示)
    await userEvent.click(screen.getByText('切云文档'))
    expect(提示).toHaveBeenCalledWith('「我的云文档」功能开发中')
    expect(screen.getByTestId('nav')).toHaveTextContent('home')
  })

  it('在 Provider 之外使用时抛出中文异常', () => {
    // 抑制 React 对错误边界的控制台告警，保持测试输出整洁
    const 原始错误 = console.error
    console.error = () => {}
    expect(() => render(<探针 />)).toThrowError(/必须在 AppProvider 内使用/)
    console.error = 原始错误
  })
})
