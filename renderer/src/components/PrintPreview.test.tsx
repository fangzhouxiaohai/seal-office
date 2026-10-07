import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import PrintPreview from './PrintPreview'
import { 桥接 } from '../ipc/bridge'

vi.mock('../pdf/PdfViewer', () => ({ default: ({ 数据 }: { 数据: string }) => <div>预览数据：{数据}</div> }))
afterEach(() => { vi.restoreAllMocks() })

it('打印预览使用同一份 PDF 数据交给系统打印', async () => {
  const 预览 = vi.spyOn(桥接, 'printPreview').mockResolvedValue({ 成功: true, 数据: 'JVBERi0x' })
  const 打印 = vi.spyOn(桥接, 'printDocument').mockResolvedValue({ 成功: true })
  const 关闭 = vi.fn()
  render(<AntdApp><PrintPreview 内容="<p>报告</p>" 格式="html" 标题="报告" onClose={关闭} /></AntdApp>)
  expect(await screen.findByText('预览数据：JVBERi0x')).toBeInTheDocument()
  expect(预览).toHaveBeenCalledWith('<p>报告</p>', 'html')
  // antd 按钮会在两个中文字之间插入空格，按可访问名做宽松匹配
  fireEvent.click(screen.getByRole('button', { name: /打\s*印/ }))
  await waitFor(() => expect(打印).toHaveBeenCalledWith('JVBERi0x', 'pdf'))
  expect(关闭).toHaveBeenCalledOnce()
})
