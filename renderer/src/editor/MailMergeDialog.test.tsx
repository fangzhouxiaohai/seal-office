import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import MailMergeDialog from './MailMergeDialog'

const 渲染 = (onGenerate = vi.fn()) => render(
  <ConfigProvider button={{ autoInsertSpace: false }}>
    <AntdApp>
      <MailMergeDialog open templateHtml="<p>您好，{{姓名}}</p>" onClose={vi.fn()} onGenerate={onGenerate} />
    </AntdApp>
  </ConfigProvider>
)

describe('邮件合并面板', () => {
  it('数据错误时用弹窗解释原因且不生成文档', async () => {
    const 生成 = vi.fn()
    渲染(生成)
    await userEvent.type(screen.getByRole('textbox', { name: '收件人数据' }), '姓名,姓名{enter}张三,李四')
    await userEvent.click(screen.getByRole('button', { name: '预览' }))
    expect((await screen.findAllByText('邮件合并数据有误')).length).toBeGreaterThan(0)
    expect(screen.getByText(/字段名重复/)).toBeInTheDocument()
    expect(生成).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '生成新文档' })).toBeDisabled()
  })

  it('选择本机文件后读取名单并预览', async () => {
    渲染()
    const 文件 = new File(['姓名\n张三'], '名单.csv', { type: 'text/csv' })
    Object.defineProperty(文件, 'arrayBuffer', { value: vi.fn().mockResolvedValue(new TextEncoder().encode('姓名\n张三').buffer) })
    await userEvent.upload(screen.getByLabelText('选择本机逗号分隔文件'), 文件)
    await waitFor(() => expect(screen.getByRole('textbox', { name: '收件人数据' })).toHaveValue('姓名\n张三'))
    expect(screen.getByText('已读取：名单.csv')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '预览' }))
    expect(screen.getByRole('region', { name: '合并预览' }).textContent).toContain('您好，张三')
  })

  it('读取文件失败时弹窗说明且不会继续使用旧名单', async () => {
    渲染()
    await userEvent.type(screen.getByRole('textbox', { name: '收件人数据' }), '姓名{enter}旧记录')
    const 文件 = new File(['无效'], '损坏.csv', { type: 'text/csv' })
    Object.defineProperty(文件, 'arrayBuffer', { value: vi.fn().mockRejectedValue(new Error('文件无法读取')) })
    await userEvent.upload(screen.getByLabelText('选择本机逗号分隔文件'), 文件)
    expect((await screen.findAllByText('读取数据文件失败')).length).toBeGreaterThan(0)
    expect(screen.getByText('文件无法读取')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '收件人数据' })).toHaveValue('')
  })
})
