import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import HomePage from './HomePage'
import { AppProvider } from '../store'

const 渲染首页 = () =>
  render(
    <AntdApp>
      <AppProvider>
        <HomePage />
      </AppProvider>
    </AntdApp>
  )

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

  it('PDF 入口点击后不跳转并给出中文提示', async () => {
    渲染首页()
    // 点击工具区块中的 PDF 工具按钮（使用类名区分）
    const pdfButtons = screen.getAllByRole('button').filter(
      (按钮) => 按钮.classList.contains('wps-tool-btn') && 按钮.textContent === 'PDF 工具'
    )
    expect(pdfButtons).toHaveLength(1)
    await userEvent.click(pdfButtons[0])
    expect(await screen.findByText('PDF 工具功能开发中')).toBeInTheDocument()
  })
})
