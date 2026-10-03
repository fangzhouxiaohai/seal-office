import { describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { AppProvider } from '../store'
import { 桥接 } from '../ipc/bridge'
import GlobalTabs from './GlobalTabs'
import AssociatedFileOpener from './AssociatedFileOpener'

describe('系统文件关联打开', () => {
  it('启动文件与二次唤醒文件依次进入底部标签', async () => {
    const 可用 = vi.spyOn(桥接, '关联文件可用', 'get').mockReturnValue(true)
    const 领取 = vi.spyOn(桥接, 'takePendingAssociatedFiles')
      .mockResolvedValueOnce({ 成功: true, 路径列表: ['C:\\资料\\甲.docx'] })
      .mockResolvedValueOnce({ 成功: true, 路径列表: ['C:\\资料\\乙.docx'] })
    let 通知: (() => void) | undefined
    const 订阅 = vi.spyOn(桥接, 'onAssociatedFilesAvailable').mockImplementation((回调) => { 通知 = 回调; return () => { 通知 = undefined } })
    const 读取 = vi.spyOn(桥接, 'readFile').mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' })
    const 解析 = vi.spyOn(桥接.office, 'readDocx').mockResolvedValue({ 成功: true, html: '<p>正文</p>' })
    const 最近 = vi.spyOn(桥接, 'recentAdd').mockResolvedValue({ 成功: true, 数据: [] })
    try {
      render(<StrictMode><AntdApp><AppProvider 初始最近文档={[]}><AssociatedFileOpener /><GlobalTabs /></AppProvider></AntdApp></StrictMode>)
      expect(await screen.findByRole('tab', { name: /甲\.docx/ })).toBeInTheDocument()
      expect(订阅).toHaveBeenCalledOnce()
      通知?.()
      expect(await screen.findByRole('tab', { name: /乙\.docx/ })).toHaveAttribute('aria-selected', 'true')
      expect(读取).toHaveBeenCalledWith('C:\\资料\\甲.docx')
      expect(读取).toHaveBeenCalledWith('C:\\资料\\乙.docx')
      expect(领取).toHaveBeenCalledTimes(2)
    } finally {
      可用.mockRestore(); 领取.mockRestore(); 订阅.mockRestore(); 读取.mockRestore(); 解析.mockRestore(); 最近.mockRestore()
    }
  })

  it('文件不存在时显示错误弹窗，不创建空白标签', async () => {
    const 可用 = vi.spyOn(桥接, '关联文件可用', 'get').mockReturnValue(true)
    const 领取 = vi.spyOn(桥接, 'takePendingAssociatedFiles').mockResolvedValue({ 成功: true, 路径列表: ['C:\\资料\\失效.docx'] })
    const 订阅 = vi.spyOn(桥接, 'onAssociatedFilesAvailable').mockReturnValue(() => {})
    const 读取 = vi.spyOn(桥接, 'readFile').mockResolvedValue({ 成功: false, 错误: '文件不存在' })
    try {
      render(<StrictMode><AntdApp><AppProvider 初始最近文档={[]}><AssociatedFileOpener /><GlobalTabs /></AppProvider></AntdApp></StrictMode>)
      expect((await screen.findAllByText('打开文件失败')).length).toBeGreaterThan(0)
      expect((await screen.findAllByText('文件不存在')).length).toBeGreaterThan(0)
      expect(screen.queryByRole('tab', { name: /失效\.docx/ })).not.toBeInTheDocument()
    } finally {
      可用.mockRestore(); 领取.mockRestore(); 订阅.mockRestore(); 读取.mockRestore()
    }
  })

  it('先恢复原工作区再领取启动文件，避免覆盖刚打开的标签', async () => {
    let 完成恢复!: (结果: { 成功: boolean; 内容: string }) => void
    const 恢复请求 = new Promise<{ 成功: boolean; 内容: string }>((完成) => { 完成恢复 = 完成 })
    const 桌面 = vi.spyOn(桥接, '可用', 'get').mockReturnValue(true)
    const 可用 = vi.spyOn(桥接, '关联文件可用', 'get').mockReturnValue(true)
    const 备份 = vi.spyOn(桥接, 'backupLoad').mockReturnValue(恢复请求)
    const 领取 = vi.spyOn(桥接, 'takePendingAssociatedFiles').mockResolvedValue({ 成功: true, 路径列表: ['C:\\资料\\新文件.docx'] })
    const 订阅 = vi.spyOn(桥接, 'onAssociatedFilesAvailable').mockReturnValue(() => {})
    const 读取 = vi.spyOn(桥接, 'readFile').mockResolvedValue({ 成功: true, 内容: 'AA==', 二进制: true, 扩展名: '.docx' })
    const 解析 = vi.spyOn(桥接.office, 'readDocx').mockResolvedValue({ 成功: true, html: '<p>新文件</p>' })
    const 最近 = vi.spyOn(桥接, 'recentAdd').mockResolvedValue({ 成功: true, 数据: [] })
    const 自动保存 = vi.spyOn(桥接, 'backupSave').mockResolvedValue({ 成功: true })
    try {
      render(<StrictMode><AntdApp><AppProvider 初始最近文档={[]}><AssociatedFileOpener /><GlobalTabs /></AppProvider></AntdApp></StrictMode>)
      expect(领取).not.toHaveBeenCalled()
      完成恢复({ 成功: true, 内容: JSON.stringify({
        documents: [{ id: 'restored', name: '原工作.docx', html: '<p>原工作</p>', 已保存Html: '<p>原工作</p>', type: 'word', 来源路径: 'C:\\资料\\原工作.docx' }],
        activeDocumentId: 'restored', 文档路径: { restored: 'C:\\资料\\原工作.docx' }, workspaceOrder: ['restored'], activeModule: 'word',
      }) })
      expect(await screen.findByRole('tab', { name: /原工作\.docx/ })).toBeInTheDocument()
      expect(await screen.findByRole('tab', { name: /新文件\.docx/ })).toHaveAttribute('aria-selected', 'true')
      expect(领取).toHaveBeenCalledOnce()
    } finally {
      桌面.mockRestore(); 可用.mockRestore(); 备份.mockRestore(); 领取.mockRestore(); 订阅.mockRestore(); 读取.mockRestore(); 解析.mockRestore(); 最近.mockRestore(); 自动保存.mockRestore()
    }
  })
})
