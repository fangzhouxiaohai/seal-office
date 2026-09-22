import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TitleBar from './TitleBar'

describe('顶栏', () => {
  it('展示品牌名与当前页名', () => {
    render(<TitleBar pageName="首页" />)
    expect(screen.getByText('Seal Office')).toBeInTheDocument()
    expect(screen.getByText('首页')).toBeInTheDocument()
  })

  it('展示搜索框占位文字', () => {
    render(<TitleBar pageName="首页" />)
    expect(screen.getByPlaceholderText('搜索文件、模板')).toBeInTheDocument()
  })

  it('头像展示用户名首字', () => {
    render(<TitleBar pageName="首页" userName="演示用户" />)
    expect(screen.getByText('演')).toBeInTheDocument()
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
})
