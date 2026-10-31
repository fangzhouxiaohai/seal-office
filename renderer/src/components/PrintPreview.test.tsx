import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import PrintPreview from './PrintPreview'
import { 桥接 } from '../ipc/bridge'

vi.mock('../pdf/PdfViewer', () => ({ default: ({ 数据 }: { 数据: string }) => <div>预览数据：{数据}</div> }))
vi.mock('./printPages', () => ({ 生成打印页面HTML: vi.fn(async (数据: string) => `<html><body data-pdf="${数据}"><img src="data:image/png;base64,AA"></body></html>`) }))
afterEach(() => { vi.restoreAllMocks() })

it('打印预览把同一份 PDF 逐页渲染为图片 HTML 后交给系统打印，避免空白页', async () => {
  const 预览 = vi.spyOn(桥接, 'printPreview').mockResolvedValue({ 成功: true, 数据: 'JVBERi0x' })
  const 打印 = vi.spyOn(桥接, 'printDocument').mockResolvedValue({ 成功: true })
  const 关闭 = vi.fn()
  render(<AntdApp><PrintPreview 内容="<p>报告</p>" 格式="html" 标题="报告" onClose={关闭} /></AntdApp>)
  expect(await screen.findByText('预览数据：JVBERi0x')).toBeInTheDocument()
  expect(预览).toHaveBeenCalledWith('<p>报告</p>', 'html')
  // antd 按钮会在两个中文字之间插入空格，按可访问名做宽松匹配
  fireEvent.click(screen.getByRole('button', { name: /打\s*印/ }))
  await waitFor(() => expect(打印).toHaveBeenCalledWith(expect.stringContaining('data-pdf="JVBERi0x"'), 'html'))
  expect(关闭).toHaveBeenCalledOnce()
})

it('预览生成失败后可重试，生成过程显示当前页进度', async () => {
  const resolveNext: { current?: (value: { 成功: boolean; 数据?: string; 错误?: string }) => void } = {}
  const 预览 = vi.spyOn(桥接, 'printPreview')
    .mockRejectedValueOnce(new Error('转换失败'))
    .mockImplementationOnce(() => new Promise<{ 成功: boolean; 数据?: string; 错误?: string }>((resolve) => { resolveNext.current = resolve }))
  render(<AntdApp><PrintPreview 内容="<p>多页正文</p>" 格式="html" 标题="测试" onClose={vi.fn()} /></AntdApp>)
  expect(await screen.findByRole('alert')).toHaveTextContent('转换失败')
  fireEvent.click(screen.getByRole('button', { name: '重试预览' }))
  window.dispatchEvent(new CustomEvent('seal-print-preview-progress', { detail: { current: 3, total: 8 } }))
  expect(await screen.findByRole('status')).toHaveTextContent('第 3 / 8 页')
  resolveNext.current?.({ 成功: true, 数据: 'JVBERi0x' })
  expect(await screen.findByText('预览数据：JVBERi0x')).toBeInTheDocument()
  expect(预览).toHaveBeenCalledTimes(2)
})
