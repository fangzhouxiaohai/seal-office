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

  it('点击星标导航后仅展示星标文档', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('星标'))
    expect(screen.getByText('星标文档')).toBeInTheDocument()
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

  it('渲染底部状态栏统计', () => {
    render(<App />)
    expect(screen.getByText('共 12 个文档')).toBeInTheDocument()
  })
})
