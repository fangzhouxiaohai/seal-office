import { fireEvent, render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { expect, it, vi } from 'vitest'
import { AppProvider, useAppStore } from '../store'
import PdfPage from './PdfPage'

vi.mock('../pdf/PdfViewer', () => ({
  default: ({ 数据, 文件名 }: { 数据?: string; 文件名?: string }) =>
    <div>{数据 ? `正在预览 ${文件名}` : '等待选择文件'}</div>,
}))

function 打开入口() {
  const { createDoc } = useAppStore()
  return <button onClick={() => createDoc('pdf', 'JVBERi0x', { 路径: 'C:\\文档\\测试.pdf' })}>打开测试文件</button>
}

it('状态层打开的 PDF 文件直接进入阅读页面', async () => {
  render(<AntdApp><AppProvider 初始最近文档={[]}><打开入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '打开测试文件' }))
  expect(await screen.findByText('正在预览 测试.pdf')).toBeInTheDocument()
})
