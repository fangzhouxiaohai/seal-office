import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { 添加幻灯片, 创建演示文稿 } from '../deck'
import ExportPanel from './ExportPanel'

const 原接口 = window.electronAPI
afterEach(() => { window.electronAPI = 原接口; vi.restoreAllMocks() })

function 造文稿() {
  let 文稿 = 创建演示文稿('季度汇报.pptx')
  文稿 = 添加幻灯片(文稿)
  return 文稿
}

function 挂载(覆盖: { run?: ReturnType<typeof vi.fn>; pickDirectory?: ReturnType<typeof vi.fn> } = {}) {
  const run = 覆盖.run ?? vi.fn(async () => ({ 成功: true, 文件列表: [{ 路径: 'E:\\导出\\季度汇报.pdf', 字节数: 2048 }] }))
  const pickDirectory = 覆盖.pickDirectory ?? vi.fn(async () => ({ 成功: true, 目录: 'E:\\导出' }))
  window.electronAPI = { presentationExport: { run, pickDirectory } } as never
  render(<App><ExportPanel 文稿={造文稿()} 图片地址={{}} 打开 on关闭={vi.fn()} /></App>)
  return { run, pickDirectory }
}

it('默认导出全部可见页面并显示页数预览', () => {
  挂载()
  expect(screen.getByText('将导出 2 页')).toBeInTheDocument()
  expect(screen.getByLabelText('输出尺寸').textContent).toContain('960 × 540')
  expect(screen.queryByLabelText('讲义每页张数')).toBeNull()
})

it('PDF 才显示讲义与备注选项', () => {
  挂载()
  fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: 'PDF' } })
  expect(screen.getByLabelText('讲义每页张数')).toBeInTheDocument()
  expect(screen.getByText('在每页下方输出演讲备注')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: '图片型PPTX' } })
  expect(screen.queryByLabelText('讲义每页张数')).toBeNull()
  expect(screen.getByText(/文字不再可编辑/)).toBeInTheDocument()
})

it('隐藏页默认排除，勾选后计入', () => {
  const 文稿 = 造文稿()
  文稿.幻灯片列表[1].隐藏 = true
  window.electronAPI = { presentationExport: { run: vi.fn(), pickDirectory: vi.fn() } } as never
  render(<App><ExportPanel 文稿={文稿} 图片地址={{}} 打开 on关闭={vi.fn()} /></App>)
  expect(screen.getByText('将导出 1 页')).toBeInTheDocument()
  fireEvent.click(screen.getByText('包含隐藏页面'))
  expect(screen.getByText('将导出 2 页')).toBeInTheDocument()
})

it('选定页范围未勾选任何页面时禁用导出并说明原因', () => {
  挂载()
  fireEvent.change(screen.getByLabelText('页面范围'), { target: { value: '选定页' } })
  expect(screen.getByText('请选择要导出的页面')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始导出' })).toBeDisabled()
})

it('开始导出时把格式、页面尺寸、范围与目录交给主进程并展示真实文件', async () => {
  const { run, pickDirectory } = 挂载()
  fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: 'PDF' } })
  fireEvent.click(screen.getByRole('button', { name: '选择输出位置' }))
  await waitFor(() => expect(pickDirectory).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: '开始导出' }))
  await waitFor(() => expect(run).toHaveBeenCalled())
  const 请求 = run.mock.calls[0][0]
  expect(请求.格式).toBe('PDF')
  expect(请求.页面尺寸).toEqual({ 宽: 960, 高: 540 })
  expect(请求.条目).toEqual([{ 序号: 0 }, { 序号: 1 }])
  expect(请求.基础名).toBe('季度汇报.pptx')
  expect(请求.目录).toBe('E:\\导出')
  expect(请求.html).toContain('seal-export-page')
  expect(await screen.findByText('E:\\导出\\季度汇报.pdf')).toBeInTheDocument()
  expect(screen.getByText('2.0 KB')).toBeInTheDocument()
})

it('主进程取消时不报告成功', async () => {
  const run = vi.fn(async () => ({ 成功: false, 已取消: true }))
  挂载({ run })
  fireEvent.click(screen.getByRole('button', { name: '开始导出' }))
  await waitFor(() => expect(run).toHaveBeenCalled())
  expect(await screen.findByText('已取消导出')).toBeInTheDocument()
})

it('主进程失败时展示真实原因', async () => {
  const run = vi.fn(async () => ({ 成功: false, 错误: '磁盘空间不足，未写入文件' }))
  挂载({ run })
  fireEvent.click(screen.getByRole('button', { name: '开始导出' }))
  expect(await screen.findByText('磁盘空间不足，未写入文件')).toBeInTheDocument()
})

it('桌面端不可用时禁用导出并说明原因', () => {
  window.electronAPI = undefined
  render(<App><ExportPanel 文稿={造文稿()} 图片地址={{}} 打开 on关闭={vi.fn()} /></App>)
  expect(screen.getByRole('alert').textContent).toContain('请使用 Windows 桌面版')
  expect(screen.getByRole('button', { name: '开始导出' })).toBeDisabled()
})

it('缺少图片资源时给出真实原因而不提交主进程', async () => {
  const { run } = 挂载()
  const 文稿 = 造文稿()
  文稿.幻灯片列表[0].对象列表 = [{ id: '图', 类型: '图片', x: 0, y: 0, width: 100, height: 100, 资源标识: '缺失' }]
  window.electronAPI = { presentationExport: { run, pickDirectory: vi.fn() } } as never
  render(<App><ExportPanel 文稿={文稿} 图片地址={{}} 打开 on关闭={vi.fn()} /></App>)
  fireEvent.click(screen.getAllByRole('button', { name: '开始导出' })[1])
  expect(await screen.findByText(/缺少图片资源/)).toBeInTheDocument()
  expect(run).not.toHaveBeenCalled()
})
