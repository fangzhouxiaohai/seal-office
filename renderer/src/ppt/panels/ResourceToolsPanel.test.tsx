import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿 } from '../deck'
import ResourceToolsPanel from './ResourceToolsPanel'

const 图片页 = () => {
  const 文稿 = 创建演示文稿('资源.pptx')
  文稿.资源索引 = { ['a'.repeat(64)]: { 指纹: 'a'.repeat(64), 类型: 'image/png', 字节数: 2000 } }
  文稿.幻灯片列表[0].对象列表 = [{ id: '图片甲', 类型: '图片', x: 0, y: 0, width: 100, height: 100, 资源标识: 'a'.repeat(64) }]
  return 文稿
}

const 设置后端 = (覆盖: Record<string, unknown> = {}) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      presentationExport: { pickDirectory: vi.fn().mockResolvedValue({ 成功: true, 目录: 'E:\\Temp\\导出' }) },
      presentationResources: {
        export: vi.fn().mockResolvedValue({ 成功: true, 条目: [{ 标识: 'a'.repeat(64), 类型: 'image/png', 数据: 'AA==' }] }),
        read: vi.fn().mockResolvedValue({ 成功: true, 数据: 'AAAA' }),
        add: vi.fn().mockResolvedValue({ 成功: true, 标识: 'b'.repeat(64), 字节数: 500 }),
      },
      presentationTools: {
        writeResources: vi.fn().mockResolvedValue({ 成功: true, 结果: [{ 标识: 'a'.repeat(64), 路径: 'E:\\Temp\\导出\\图.png', 字节数: 2, 成功: true }], 汇总: { 总数: 1, 成功: 1, 失败: 0 } }),
        compressImage: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UE5H', 类型: 'image/png', 原字节数: 2000, 新字节数: 500, 宽: 800, 高: 600 }),
      },
      ...覆盖,
    },
  })
}

it('提取全部资源并逐项显示结果', async () => {
  设置后端()
  const 文稿 = 图片页()
  render(<App><ResourceToolsPanel 文稿={文稿} 只读={false} on修改={vi.fn()} 打开 /></App>)
  await userEvent.click(screen.getByRole('button', { name: '提取全部资源到目录' }))
  expect(await screen.findByText(/共 1 个资源：成功 1，失败 0/)).toBeInTheDocument()
  expect(screen.getByText(/E:\\Temp\\导出\\图.png/)).toBeInTheDocument()
  const 桥 = (window as unknown as { electronAPI: { presentationTools: { writeResources: { mock: { calls: unknown[][] } } } } }).electronAPI.presentationTools.writeResources
  expect(桥.mock.calls[0][1]).toBe('E:\\Temp\\导出')
})

it('没有资源时给出提示且不调用提取', async () => {
  设置后端()
  const 文稿 = 创建演示文稿('空.pptx')
  render(<App><ResourceToolsPanel 文稿={文稿} 只读={false} on修改={vi.fn()} 打开 /></App>)
  await userEvent.click(screen.getByRole('button', { name: '提取全部资源到目录' }))
  expect(await screen.findByText(/当前文稿没有图片或媒体资源/)).toBeInTheDocument()
})

it('压缩预览显示字节变化，替换后写入新资源标识并可撤销', async () => {
  设置后端()
  const 文稿 = 图片页(), 修改 = vi.fn()
  render(<App><ResourceToolsPanel 文稿={文稿} 只读={false} on修改={修改} 打开 /></App>)
  await userEvent.selectOptions(screen.getByLabelText('目标图片'), `${文稿.幻灯片列表[0].id}:图片甲`)
  await userEvent.click(screen.getByRole('button', { name: '压缩预览' }))
  expect(await screen.findByText(/2000 → 500 字节/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '替换为压缩图片' }))
  const 新稿 = 修改.mock.calls[0][0]
  expect(新稿.幻灯片列表[0].对象列表[0].资源标识).toBe('b'.repeat(64))
  expect(新稿.资源索引['b'.repeat(64)]).toMatchObject({ 类型: 'image/png', 字节数: 500 })
  expect(新稿.资源索引['a'.repeat(64)]).toBeTruthy()
  expect(文稿.幻灯片列表[0].对象列表?.[0].资源标识).toBe('a'.repeat(64))
})

it('压缩失败时给出真实原因且不替换图片', async () => {
  设置后端({ presentationTools: { writeResources: vi.fn(), compressImage: vi.fn().mockResolvedValue({ 成功: false, 错误: '压缩后 2000 字节，不小于原图 2000 字节，已保持原图不变' }) } })
  const 文稿 = 图片页(), 修改 = vi.fn()
  render(<App><ResourceToolsPanel 文稿={文稿} 只读={false} on修改={修改} 打开 /></App>)
  await userEvent.selectOptions(screen.getByLabelText('目标图片'), `${文稿.幻灯片列表[0].id}:图片甲`)
  await userEvent.click(screen.getByRole('button', { name: '压缩预览' }))
  expect(await screen.findByText(/不小于原图/)).toBeInTheDocument()
  expect(修改).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '替换为压缩图片' })).toBeDisabled()
})

it('只读状态禁止替换图片', async () => {
  设置后端()
  const 文稿 = 图片页()
  render(<App><ResourceToolsPanel 文稿={文稿} 只读 on修改={vi.fn()} 打开 /></App>)
  expect(screen.getByText(/当前文稿为只读状态/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '替换为压缩图片' })).toBeDisabled()
})
