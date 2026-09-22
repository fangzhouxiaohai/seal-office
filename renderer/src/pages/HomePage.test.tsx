import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomePage from './HomePage'
import { AppProvider } from '../store'

const 渲染首页 = () =>
  render(
    <AppProvider>
      <HomePage />
    </AppProvider>
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
    await userEvent.click(screen.getByText('PDF 工具'))
    expect(await screen.findByText('PDF 编辑功能开发中')).toBeInTheDocument()
  })
})
