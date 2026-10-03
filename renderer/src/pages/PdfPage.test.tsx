import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { expect, it, vi } from 'vitest'
import { AppProvider, useAppStore } from '../store'
import PdfPage from './PdfPage'
import GlobalTabs from '../components/GlobalTabs'
import { 桥接 } from '../ipc/bridge'

vi.mock('../pdf/PdfViewer', () => ({
  default: ({ 数据, 文件名 }: { 数据?: string; 文件名?: string }) =>
    <div>{数据 ? `正在预览 ${文件名}` : '等待选择文件'}</div>,
}))

function 打开入口() {
  const { createDoc } = useAppStore()
  return <><button onClick={() => createDoc('pdf', 'JVBERi0x', { 路径: 'C:\\文档\\测试.pdf' })}>打开测试文件</button><button onClick={() => createDoc('pdf')}>新建 PDF 工具标签</button></>
}

it('状态层打开的 PDF 文件直接进入阅读页面', async () => {
  render(<AntdApp><AppProvider 初始最近文档={[]}><打开入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '打开测试文件' }))
  expect(await screen.findByText('正在预览 测试.pdf')).toBeInTheDocument()
})

it('切到空白 PDF 工具标签时清除上一文件预览', async () => {
  render(<AntdApp><AppProvider 初始最近文档={[]}><打开入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '打开测试文件' }))
  expect(await screen.findByText('正在预览 测试.pdf')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '新建 PDF 工具标签' }))
  expect(await screen.findByText('等待选择文件')).toBeInTheDocument()
  expect(screen.queryByText('正在预览 测试.pdf')).not.toBeInTheDocument()
})

it('工作台移除 PDF 后同步关闭全局标签，切换后不再出现', async () => {
  let 状态: ReturnType<typeof useAppStore> | null = null
  const 操作入口 = () => {
    状态 = useAppStore()
    return <>
      <button onClick={() => 状态!.createDoc('pdf', '甲数据', { 路径: 'C:\\文档\\甲.pdf' })}>打开甲</button>
      <button onClick={() => 状态!.createDoc('pdf', '乙数据', { 路径: 'C:\\文档\\乙.pdf' })}>打开乙</button>
      <button onClick={() => 状态!.createDoc('pdf')}>切换空白工具</button>
      <button onClick={() => 状态!.selectWorkspaceTab(状态!.workspaceTabs.find((标签) => 标签.name === '甲.pdf')!.id)}>切回甲</button>
    </>
  }
  render(<AntdApp><AppProvider 初始最近文档={[]}><操作入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '打开甲' }))
  fireEvent.click(screen.getByRole('button', { name: '打开乙' }))
  fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
  expect(screen.getByRole('button', { name: '移除 乙.pdf' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '移除 乙.pdf' }))
  expect(状态!.workspaceTabs.map((标签) => 标签.name)).toEqual(['甲.pdf'])
  fireEvent.click(screen.getByRole('button', { name: '切换空白工具' }))
  fireEvent.click(screen.getByRole('button', { name: '切回甲' }))
  fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
  expect(screen.queryByRole('button', { name: '移除 乙.pdf' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '移除 甲.pdf' })).toBeInTheDocument()
})

it('工作台选择预览文件时同步切换底部 PDF 标签', async () => {
  let 状态: ReturnType<typeof useAppStore> | null = null
  const 操作入口 = () => {
    状态 = useAppStore()
    return <>
      <button onClick={() => 状态!.createDoc('pdf', '甲数据', { 路径: 'C:\\文档\\甲.pdf' })}>打开甲</button>
      <button onClick={() => 状态!.createDoc('pdf', '乙数据', { 路径: 'C:\\文档\\乙.pdf' })}>打开乙</button>
    </>
  }
  render(<AntdApp><AppProvider 初始最近文档={[]}><操作入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '打开甲' }))
  fireEvent.click(screen.getByRole('button', { name: '打开乙' }))
  fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
  fireEvent.click(screen.getByRole('button', { name: '预览 甲.pdf' }))
  expect(screen.getByText('正在预览 甲.pdf')).toBeInTheDocument()
  expect(状态!.workspaceTabs.find((标签) => 标签.id === 状态!.activeWorkspaceTabId)?.name).toBe('甲.pdf')
})

it('无路径 PDF 处理并保存后用真实文件标签取代原标签', async () => {
  const 提取 = vi.spyOn(桥接.pdf, 'extract').mockResolvedValue({ 成功: true, 数据: 'JVBERi0x' })
  const 保存路径 = vi.spyOn(桥接, 'showSaveDialog').mockResolvedValue('C:\\文档\\提取结果.pdf')
  const 保存文件 = vi.spyOn(桥接, 'saveToFile').mockResolvedValue({ 成功: true })
  let 状态: ReturnType<typeof useAppStore> | null = null
  const 操作入口 = () => {
    状态 = useAppStore()
    return <button onClick={() => 状态!.createDoc('pdf', 'JVBERi0x', { 名称: '未保存.pdf' })}>打开未保存文件</button>
  }
  try {
    render(<AntdApp><AppProvider 初始最近文档={[]}><操作入口 /><PdfPage /><GlobalTabs /></AppProvider></AntdApp>)
    fireEvent.click(screen.getByRole('button', { name: '打开未保存文件' }))
    expect(screen.getByRole('tab', { name: /未保存\.pdf/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
    fireEvent.click(screen.getByRole('button', { name: '执行并保存' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /提取结果\.pdf/ })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryByRole('tab', { name: /未保存\.pdf/ })).not.toBeInTheDocument()
    expect(状态!.workspaceTabs).toHaveLength(1)
    expect(状态!.workspaceTabs[0].path).toBe('C:\\文档\\提取结果.pdf')
  } finally {
    提取.mockRestore()
    保存路径.mockRestore()
    保存文件.mockRestore()
  }
})
