import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import HomePage from './HomePage'
import { AppProvider, useAppStore } from '../store'
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
  it('使用演示模板时创建可编辑的演示文稿', async () => {
    const 状态 = () => {
      const { module, activeDocumentId, 演示文档模型, documents } = useAppStore()
      const 文稿 = activeDocumentId ? 演示文档模型[activeDocumentId] : null
      const 文档 = documents.find((项) => 项.id === activeDocumentId)
      return <output data-testid="模板文稿">{JSON.stringify({ module, 名称: 文档?.name, 标题: 文稿?.幻灯片列表[0]?.文本框列表[0]?.text })}</output>
    }
    render(<AntdApp><AppProvider><HomePage 模板库打开 /><状态 /></AppProvider></AntdApp>)
    const 用户 = userEvent.setup()
    await 用户.click(screen.getByRole('button', { name: /^演\s*示$/ }))
    await 用户.click(screen.getByRole('button', { name: '预览商务演示' }))
    await 用户.click(screen.getByRole('button', { name: '使用此模板' }))
    expect(screen.getByTestId('模板文稿')).toHaveTextContent('"module":"ppt"')
    expect(screen.getByTestId('模板文稿')).toHaveTextContent('"名称":"商务演示.pptx"')
    expect(screen.getByTestId('模板文稿')).toHaveTextContent('"标题":"商务演示"')
  })

  it('使用表格模板时保留可编辑单元格', async () => {
    const 状态 = () => {
      const { module, activeDocumentId, 表格文档模型, documents } = useAppStore()
      const 工作表 = activeDocumentId ? 表格文档模型[activeDocumentId]?.[0] : null
      const 文档 = documents.find((项) => 项.id === activeDocumentId)
      return <output data-testid="模板表格">{JSON.stringify({ module, 名称: 文档?.name, 首格: 工作表?.单元格.A1?.原始值 })}</output>
    }
    render(<AntdApp><AppProvider><HomePage 模板库打开 /><状态 /></AppProvider></AntdApp>)
    const 用户 = userEvent.setup()
    await 用户.click(screen.getByRole('button', { name: /^表\s*格$/ }))
    await 用户.click(screen.getByRole('button', { name: '预览财务报表' }))
    await 用户.click(screen.getByRole('button', { name: '使用此模板' }))
    expect(screen.getByTestId('模板表格')).toHaveTextContent('"module":"table"')
    expect(screen.getByTestId('模板表格')).toHaveTextContent('"名称":"财务报表.xlsx"')
    expect(screen.getByTestId('模板表格')).toHaveTextContent('"首格":"项目"')
  })

  it('无真实最近文件时显示准确的打开入口', () => {
    render(<AntdApp><AppProvider><HomePage /></AppProvider></AntdApp>)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开文件' })).toBeInTheDocument()
  })

  it('展示最近头部、刷新与云同步占位', () => {
    渲染首页()
    expect(screen.getByText('最近')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新最近列表' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '云端同步暂未开放' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '云端同步暂未开放' })).not.toBeInTheDocument()
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
