import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import HomePage from './HomePage'
import { AppProvider, useAppStore } from '../store'

const 渲染首页 = () =>
  render(
    <AntdApp>
      <AppProvider>
        <HomePage />
      </AppProvider>
    </AntdApp>
  )

const ModuleIndicator = () => {
  const { module } = useAppStore()
  return <span data-testid="current-module">{module}</span>
}

describe('首页', () => {
  it('同时展示新建区与最近文档区', () => {
    渲染首页()
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('最近文档')).toBeInTheDocument()
  })

  it('渲染四张新建卡片', () => {
    const { container } = 渲染首页()
    expect(container.querySelectorAll('.wps-new-card')).toHaveLength(4)
  })

  it('渲染文档卡片', () => {
    const { container } = 渲染首页()
    expect(container.querySelectorAll('.wps-doc-card').length).toBeGreaterThan(0)
  })

  it('PDF 入口点击后跳转至 PDF 工具模块且不再显示开发中提示', async () => {
    render(
      <AntdApp>
        <AppProvider>
          <div>
            <HomePage />
            <ModuleIndicator />
          </div>
        </AppProvider>
      </AntdApp>
    )

    // 点击工具区块中的 PDF 工具按钮（排除新建网格卡片）
    const pdfToolBtn = screen
      .getAllByRole('button')
      .find((按钮) => 按钮.textContent === 'PDF 工具' && !按钮.closest('.wps-new-card'))
    expect(pdfToolBtn, '未找到工具区块的 PDF 工具按钮').not.toBeNull()
    if (pdfToolBtn === undefined) {
      throw new Error('PDF 工具按钮未找到')
    }
    await userEvent.click(pdfToolBtn)

    // 点击后模块应切换到 pdf
    await vi.waitFor(() => {
      expect(screen.getByTestId('current-module')).toHaveTextContent('pdf')
    })
    // 不再显示旧的开发中提示
    expect(screen.queryByText('PDF 工具功能开发中')).not.toBeInTheDocument()
  })
})
