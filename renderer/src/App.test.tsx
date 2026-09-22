import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('应用外壳', () => {
  it('渲染顶栏、侧栏与首页内容', () => {
    render(<App />)
    expect(screen.getByText('WPS Office')).toBeInTheDocument()
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('我的云文档')).toBeInTheDocument()
  })

  it('点击未实现导航项给出中文提示且不切换内容', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('脑图'))
    expect(await screen.findByText('「脑图」功能开发中')).toBeInTheDocument()
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('点击星标导航后仅渲染星标文档', async () => {
    const { container } = render(<App />)
    await userEvent.click(screen.getByText('星标'))
    expect(screen.getByText('星标文档')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(5)
    expect(container.querySelectorAll('.wps-doc-card__star--on')).toHaveLength(5)
  })

  it('点击共享导航后仅渲染共享文档', async () => {
    const { container } = render(<App />)
    await userEvent.click(screen.getByText('共享'))
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(6)
  })

  it('单击文档卡片后进入选中态', async () => {
    const { container } = render(<App />)
    await userEvent.click(screen.getByText('部门预算执行明细表.xlsx'))
    const 选中卡片 = container.querySelectorAll('.wps-doc-card--active')
    expect(选中卡片).toHaveLength(1)
    expect(选中卡片[0].textContent).toContain('部门预算执行明细表.xlsx')
  })

  it('取消全部星标后星标筛选展示空状态', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('星标'))
    for (let 序号 = 0; 序号 < 5; 序号 += 1) {
      await userEvent.click(screen.getAllByRole('button', { name: '取消星标' })[0])
    }
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
  })

  it('进入文档模块后可返回首页', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('新建文字'))
    expect(screen.getByText('编辑功能开发中')).toBeInTheDocument()
    // 侧栏与占位页均提供返回入口，此处限定在主内容区内点击占位页按钮
    const 主区 = document.querySelector('.wps-main') as HTMLElement
    await userEvent.click(within(主区).getByRole('button', { name: '返回首页' }))
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('新建文档时顶栏显示未命名文档，不显示无关文件名', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('新建表格'))
    expect(document.querySelector('.wps-titlebar__doc')?.textContent).toBe('未命名表格.xlsx')
  })

  it('双击打开文档后顶栏显示该文档名', async () => {
    render(<App />)
    await userEvent.dblClick(screen.getByText('部门预算执行明细表.xlsx'))
    expect(document.querySelector('.wps-titlebar__doc')?.textContent).toBe('部门预算执行明细表.xlsx')
  })

  it('渲染底部状态栏统计', () => {
    render(<App />)
    expect(screen.getByText('共 12 个文档')).toBeInTheDocument()
  })
})
