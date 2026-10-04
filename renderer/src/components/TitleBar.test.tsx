import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TitleBar from './TitleBar'

describe('顶栏', () => {
  it('展示品牌图标与当前页名，隐藏英文名称', () => {
    render(<TitleBar pageName="首页" />)
    expect(screen.getByRole('img', { name: '海豹办公' })).toBeInTheDocument()
    expect(screen.queryByText('Seal Office')).toBeNull()
    expect(screen.getByText('首页')).toBeInTheDocument()
  })

  it('展示搜索框占位文字', () => {
    render(<TitleBar pageName="首页" />)
    expect(screen.getByPlaceholderText('搜索文件、模板')).toBeInTheDocument()
  })

  it('搜索输入触发回调', async () => {
    const 回调 = vi.fn()
    render(<TitleBar pageName="首页" onSearch={回调} />)
    await userEvent.type(screen.getByPlaceholderText('搜索文件、模板'), '预算')
    expect(回调).toHaveBeenLastCalledWith('预算')
  })

  it('编辑器视图下以文档名替代搜索框', () => {
    render(<TitleBar pageName="文档" documentName="季度报告.docx" />)
    expect(screen.getByText('季度报告.docx')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索文件、模板')).toBeNull()
  })

  it('非首页顶栏首次显示时也提供可用的深浅模式切换', async () => {
    const 切换主题 = vi.fn()
    render(<TitleBar pageName="文档" documentName="季度报告.docx" on切换主题={切换主题} />)
    await userEvent.click(screen.getByRole('button', { name: '切换深浅模式' }))
    expect(切换主题).toHaveBeenCalledOnce()
  })
})
