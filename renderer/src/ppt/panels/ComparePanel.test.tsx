import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import ComparePanel from './ComparePanel'

const 设置后端 = (覆盖: Record<string, unknown> = {}) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\右侧.pptx'),
      presentationCompare: {
        compareFiles: vi.fn().mockResolvedValue({
          成功: true,
          汇总: { 新增页: 1, 删除页: 0, 移动页: 0, 修改页: 1, 差异项: 2 },
          页面: [
            { 标识: '页一', 类型: '修改', 标题: '第一页', 差异: [{ 类型: '文本', 标识: '标题', 字段: 'text', 左: '原文', 右: '改后' }] },
            { 标识: '页三', 类型: '新增', 标题: '第三页' },
          ],
          警告: { 左: [], 右: ['动画未导入'] },
        }),
      },
      ...覆盖,
    },
  })
}

const 取比对模拟 = () => {
  const 后端 = window.electronAPI as unknown as { presentationCompare: { compareFiles: ReturnType<typeof vi.fn> } }
  return 后端.presentationCompare.compareFiles
}

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

it('选择两份文件后展示汇总、分页差异与导入风险', async () => {
  设置后端()
  render(<App><ComparePanel 当前路径={'C:\\资料\\左侧.pptx'} /></App>)
  expect(screen.getByLabelText('左侧文件')).toHaveValue('C:\\资料\\左侧.pptx')
  await userEvent.click(screen.getByRole('button', { name: '选择右侧文件' }))
  await waitFor(() => expect(screen.getByLabelText('右侧文件')).toHaveValue('C:\\资料\\右侧.pptx'))
  await userEvent.click(screen.getByRole('button', { name: '开始比对' }))
  await waitFor(() => expect(screen.getByText(/新增 1 页、删除 0 页/)).toBeInTheDocument())
  expect(screen.getByText(/共 2 项差异/)).toBeInTheDocument()
  expect(screen.getByText(/右侧：动画未导入/)).toBeInTheDocument()
  expect(screen.getByText('原文')).toBeInTheDocument()
  expect(screen.getByText('改后')).toBeInTheDocument()
  expect(screen.getByText(/仅页面顺序不同，内容一致/)).toBeInTheDocument()
  expect(取比对模拟()).toHaveBeenCalledWith('C:\\资料\\左侧.pptx', 'C:\\资料\\右侧.pptx')
})

it('缺少文件时拒绝比对，取消选择不修改输入', async () => {
  设置后端({ showOpenDialog: vi.fn().mockResolvedValue(null) })
  render(<App><ComparePanel /></App>)
  await userEvent.click(screen.getByRole('button', { name: '开始比对' }))
  await waitFor(() => expect(screen.getByText(/请先选择两份演示文稿文件/)).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: '选择右侧文件' }))
  await waitFor(() => expect(screen.getByText(/未选择右侧文件，文件没有被修改/)).toBeInTheDocument())
  expect(screen.getByLabelText('右侧文件')).toHaveValue('')
  expect(取比对模拟()).not.toHaveBeenCalled()
})

it('比对失败时展示真实原因而不是空结果', async () => {
  设置后端({
    presentationCompare: { compareFiles: vi.fn().mockResolvedValue({ 成功: false, 错误: '无法读取右侧文件：ENOENT' }) },
  })
  render(<App><ComparePanel 当前路径={'C:\\资料\\左侧.pptx'} /></App>)
  await userEvent.click(screen.getByRole('button', { name: '选择右侧文件' }))
  await userEvent.click(screen.getByRole('button', { name: '开始比对' }))
  await waitFor(() => expect(screen.getByText('无法读取右侧文件：ENOENT')).toBeInTheDocument())
  expect(screen.queryByText('比对结果')).not.toBeInTheDocument()
})
