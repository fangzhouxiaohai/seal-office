import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar'

describe('左侧导航', () => {
  it('渲染四个分组中的全部导航项', () => {
    render(<Sidebar activeKey="home" onSelect={() => {}} />)
    ;['首页', '最近', '星标', '共享', '我的云文档', '团队文档', 'PDF 工具', '脑图', '流程图', '设置', '帮助手册'].forEach(
      (文字) => {
        expect(screen.getByText(文字)).toBeInTheDocument()
      }
    )
  })

  it('当前项带选中样式', () => {
    const { container } = render(<Sidebar activeKey="star" onSelect={() => {}} />)
    const 选中项 = container.querySelector('.wps-nav-item--active')
    expect(选中项).not.toBeNull()
    expect(选中项?.textContent).toContain('星标')
  })

  it('点击导航项回传其 key', async () => {
    const 回调 = vi.fn()
    render(<Sidebar activeKey="home" onSelect={回调} />)
    await userEvent.click(screen.getByText('共享'))
    expect(回调).toHaveBeenCalledWith('shared')
  })

  it('编辑器模式展示返回首页按钮', async () => {
    const 返回 = vi.fn()
    render(<Sidebar mode="editor" moduleLabel="文档" onBack={返回} />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    await userEvent.click(screen.getByText('返回首页'))
    expect(返回).toHaveBeenCalledTimes(1)
  })
})
