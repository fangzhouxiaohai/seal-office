import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditorPlaceholder from './EditorPlaceholder'
import WordPage from './WordPage'
import TablePage from './TablePage'
import PptPage from './PptPage'
import { AppProvider } from '../store'

/** 模块页依赖应用状态，需包在 Provider 内渲染 */
const 包裹渲染 = (节点: React.ReactElement) =>
  render(<AppProvider>{节点}</AppProvider>)

describe('编辑器占位页', () => {
  it('展示模块名与开发中说明', () => {
    render(<EditorPlaceholder moduleLabel="文档" />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    expect(screen.getByText('编辑功能开发中')).toBeInTheDocument()
  })

  it('提供返回首页按钮并响应点击', async () => {
    const 返回 = vi.fn()
    render(<EditorPlaceholder moduleLabel="文档" onBack={返回} />)
    await userEvent.click(screen.getByRole('button', { name: '返回首页' }))
    expect(返回).toHaveBeenCalledTimes(1)
  })

  it('三个模块页各自展示对应名称', () => {
    const { unmount: 卸载一 } = 包裹渲染(<WordPage />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    卸载一()

    const { unmount: 卸载二 } = 包裹渲染(<TablePage />)
    expect(screen.getByText('表格')).toBeInTheDocument()
    卸载二()

    包裹渲染(<PptPage />)
    expect(screen.getByText('演示')).toBeInTheDocument()
  })
})
