import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HelpManual from './HelpManual'

describe('帮助手册', () => {
  it('按实际操作路径展示说明，并可切换主题', () => {
    render(<HelpManual />)
    expect(screen.getByRole('heading', { name: '从首页开始' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存与另存为' }))
    expect(screen.getByText(/首次保存时，在系统对话框中选择文件夹与文件名/)).toBeInTheDocument()
    expect(screen.getByText(/导入时若出现格式兼容警告/)).toBeInTheDocument()
  })

  it('搜索可匹配操作步骤，未匹配时给出清晰状态', () => {
    render(<HelpManual />)
    const 搜索 = screen.getByRole('searchbox', { name: '搜索帮助内容' })
    fireEvent.change(搜索, { target: { value: '旋转' } })
    expect(screen.getByRole('heading', { name: '阅读和处理 PDF' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '电子表格' })).not.toBeInTheDocument()
    fireEvent.change(搜索, { target: { value: '不存在的帮助主题' } })
    expect(screen.getByRole('status')).toHaveTextContent('没有找到相关内容')
  })

  it('覆盖本机日历、图形工具、文件夹和新文件提醒的操作路径', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '本机日历' }))
    expect(screen.getByText(/导出日历文件/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '脑图与流程图' }))
    expect(screen.getByText(/导出可编辑数据/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '浏览本机文件夹' }))
    expect(screen.getByText(/桌面、文档或下载/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新文件提醒' }))
    expect(screen.getByText(/首次检测只记录已有文件/)).toBeInTheDocument()
  })

  it('说明标题导航、邮件合并和 Windows 文件关联的完整路径', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '标题导航' }))
    expect(screen.getByText(/为段落应用标题样式/)).toBeInTheDocument()
    expect(screen.getByText(/点击导航窗格中的标题/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '邮件合并' }))
    expect(screen.getByText(/\{\{字段名\}\}/)).toBeInTheDocument()
    expect(screen.getByText(/第一行为字段名/)).toBeInTheDocument()
    expect(screen.getByText(/生成新文档/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Windows 文件关联' }))
    expect(screen.getByText(/海豹办公专属页面/)).toBeInTheDocument()
    expect(screen.getByText(/确认或取消后都不再主动提示/)).toBeInTheDocument()
    expect(screen.getByText(/文件进入底部标签/)).toBeInTheDocument()
  })

  it('说明表格验证保护与演示浏览备注的保存步骤', () => {
    render(<HelpManual />)
    fireEvent.click(screen.getByRole('button', { name: '电子表格' }))
    expect(screen.getByText(/数据验证/)).toBeInTheDocument()
    expect(screen.getByText(/保护工作表/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '演示文稿' }))
    expect(screen.getByText(/幻灯片浏览/)).toBeInTheDocument()
    expect(screen.getByText(/备注页/)).toBeInTheDocument()
  })
})
