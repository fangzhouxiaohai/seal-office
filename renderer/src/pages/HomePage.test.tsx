import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import HomePage from './HomePage'
import { AppProvider } from '../store'
import { RECENT_DOCS } from '../mock/recentDocs'

const 渲染首页 = () =>
  render(
    <AntdApp>
      <AppProvider 初始最近文档={RECENT_DOCS}>
        <HomePage />
      </AppProvider>
    </AntdApp>
  )

describe('首页（WPS 版式）', () => {
  it('无真实最近文件时显示准确的打开入口', () => {
    render(<AntdApp><AppProvider><HomePage /></AppProvider></AntdApp>)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeInTheDocument()
  })

  it('展示最近头部、刷新与云同步占位', () => {
    渲染首页()
    expect(screen.getByText('最近')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新最近列表' })).toBeInTheDocument()
    expect(screen.getByText('未开启文档云同步')).toBeInTheDocument()
  })

  it('展示全部类型筛选下拉并按类型过滤文档', async () => {
    const { container } = 渲染首页()
    expect(container.querySelectorAll('.wps-doc-card').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByText('全部类型'))
    const 菜单项 = await screen.findAllByRole('menuitem', { name: '表格' })
    await userEvent.click(菜单项[菜单项.length - 1])
    // 演示数据中有 3 张表格文档，全部含「表格」徽标
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(3)
    expect(container.textContent).toContain('部门预算执行明细表.xlsx')
  })

  it('渲染文档卡片', () => {
    const { container } = 渲染首页()
    expect(container.querySelectorAll('.wps-doc-card').length).toBeGreaterThan(0)
  })
})
