import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import PageToolsPanel from './PageToolsPanel'

const 设置后端 = (来源文稿: unknown) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\来源.pptx'),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true }),
      office: { readPptx: vi.fn().mockResolvedValue({ 成功: true, 演示文稿: 来源文稿, 警告: [] }) },
      presentationResources: { add: vi.fn().mockResolvedValue({ 成功: true, 标识: '新资源', 字节数: 3 }) },
    },
  })
}

const 准备文稿 = (名称 = '当前.pptx') => {
  const 文稿 = 创建演示文稿(名称)
  文稿.幻灯片列表.push(创建幻灯片('标题和内容', '第二页'))
  return 文稿
}

it('选择来源后显示预览，追加到当前文稿且不修改来源与当前文稿', async () => {
  const 来源 = 创建演示文稿('来源.pptx')
  来源.幻灯片列表.push(创建幻灯片('标题和内容', '来源第二页'))
  设置后端(来源)
  const 文稿 = 准备文稿(), 修改 = vi.fn()
  render(<App><PageToolsPanel 文稿={文稿} 只读={false} on修改={修改} on拆分={vi.fn()} 打开 /></App>)

  expect(screen.getByText(/尚未选择来源文件/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '选择来源演示文稿' }))
  expect(await screen.findByText(/来源：来源.pptx，共 2 页/)).toBeInTheDocument()
  expect(screen.getByText(/合并后 4 页/)).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '追加到当前文稿' }))
  const 新稿 = 修改.mock.calls[0][0]
  expect(新稿.幻灯片列表).toHaveLength(4)
  expect(新稿.幻灯片列表.slice(2).map((页: { title: string }) => 页.title)).toEqual(来源.幻灯片列表.map(页 => 页.title))
  expect(新稿.幻灯片列表.slice(2).map((页: { id: string }) => 页.id)).not.toEqual(来源.幻灯片列表.map(页 => 页.id))
  expect(文稿.幻灯片列表).toHaveLength(2)
  expect(来源.幻灯片列表[0].id).toBeTruthy()
  expect(await screen.findByText(/已追加 2 页，可用撤销还原/)).toBeInTheDocument()
})

it('拆分按选定页面输出新文稿，全选被拒且只读禁用', async () => {
  设置后端(创建演示文稿())
  const 文稿 = 准备文稿(), 拆分 = vi.fn()
  const { rerender } = render(<App><PageToolsPanel 文稿={文稿} 只读={false} on修改={vi.fn()} on拆分={拆分} 打开 初始视图="拆分" /></App>)

  expect(screen.getByRole('button', { name: '拆分为新文稿' })).toBeDisabled()
  expect(screen.getByText(/已选 0 页/)).toBeInTheDocument()

  await userEvent.click(screen.getByLabelText('选择第 1 页'))
  await userEvent.click(screen.getByRole('button', { name: '拆分为新文稿' }))
  const 新稿 = 拆分.mock.calls[0][0]
  expect(新稿.幻灯片列表).toHaveLength(1)
  expect(新稿.name).toContain('拆分')
  expect(文稿.幻灯片列表).toHaveLength(2)

  await userEvent.click(screen.getByRole('button', { name: '全选' }))
  await userEvent.click(screen.getByRole('button', { name: '拆分为新文稿' }))
  expect(await screen.findByText(/不能把全部页面拆分出去/)).toBeInTheDocument()
  expect(拆分).toHaveBeenCalledTimes(1)

  rerender(<App><PageToolsPanel 文稿={文稿} 只读 on修改={vi.fn()} on拆分={拆分} 打开 初始视图="拆分" /></App>)
  expect(screen.getByRole('button', { name: '拆分为新文稿' })).toBeDisabled()
  expect(screen.getByText(/当前文稿为只读状态/)).toBeInTheDocument()
})

it('取消选择来源文件时不改动文稿', async () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { showOpenDialog: vi.fn().mockResolvedValue(null), presentationResources: { add: vi.fn() } },
  })
  const 文稿 = 准备文稿(), 修改 = vi.fn()
  render(<App><PageToolsPanel 文稿={文稿} 只读={false} on修改={修改} on拆分={vi.fn()} 打开 /></App>)
  await userEvent.click(screen.getByRole('button', { name: '选择来源演示文稿' }))
  expect(await screen.findByText(/未选择文件，当前文稿没有变化/)).toBeInTheDocument()
  expect(修改).not.toHaveBeenCalled()
})

it('来源文件无法解析时给出真实原因且不合并', async () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\坏文件.pptx'),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'AA==' }),
      office: { readPptx: vi.fn().mockResolvedValue({ 成功: false, 错误: '演示文件无效：缺少演示清单' }) },
      presentationResources: { add: vi.fn() },
    },
  })
  const 修改 = vi.fn()
  render(<App><PageToolsPanel 文稿={准备文稿()} 只读={false} on修改={修改} on拆分={vi.fn()} 打开 /></App>)
  await userEvent.click(screen.getByRole('button', { name: '选择来源演示文稿' }))
  expect(await screen.findByText('演示文件无效：缺少演示清单')).toBeInTheDocument()
  expect(修改).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '追加到当前文稿' })).toBeDisabled()
})
