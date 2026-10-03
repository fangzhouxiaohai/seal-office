import { afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import NewFileNotifier, { 本机通知事件名 } from './NewFileNotifier'
import { 桥接 } from '../ipc/bridge'

afterEach(() => {
  localStorage.removeItem('seal-new-file-alert-folder')
})

it('首次读取建立基线，后续发现新文件时才弹窗提醒', async () => {
  localStorage.setItem('seal-new-file-alert-folder', 'desktop')
  const 可用 = vi.spyOn(桥接, '可用', 'get').mockReturnValue(true)
  const 文件列表 = vi.spyOn(桥接, 'listKnownFolder')
    .mockResolvedValueOnce({ 成功: true, 路径: 'C:/桌面', 文件: [{ 名称: '原文件.docx', 路径: 'C:/桌面/原文件.docx', 扩展名: '.docx', 大小: 1, 修改时间: 1 }] })
    .mockResolvedValueOnce({ 成功: true, 路径: 'C:/桌面', 文件: [
      { 名称: '新文件.xlsx', 路径: 'C:/桌面/新文件.xlsx', 扩展名: '.xlsx', 大小: 1, 修改时间: 2 },
      { 名称: '原文件.docx', 路径: 'C:/桌面/原文件.docx', 扩展名: '.docx', 大小: 1, 修改时间: 1 },
    ] })
  let 定时回调: (() => void) | null = null
  const 定时 = vi.spyOn(window, 'setInterval').mockImplementation((回调, 毫秒) => { if (毫秒 === 10000) 定时回调 = 回调 as () => void; return 1 as unknown as ReturnType<typeof window.setInterval> })
  const 清理 = vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
  const 收到通知 = vi.fn()
  window.addEventListener(本机通知事件名, 收到通知)
  try {
    render(<AntdApp><NewFileNotifier /></AntdApp>)
    await waitFor(() => expect(文件列表).toHaveBeenCalledTimes(1))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(定时回调).not.toBeNull()
    expect(screen.queryByText('桌面有新文件')).toBeNull()
    await act(async () => { 定时回调?.() })
    await waitFor(() => expect(文件列表).toHaveBeenCalledTimes(2))
    expect((await screen.findAllByText('桌面有新文件')).length).toBeGreaterThan(0)
    expect(screen.getByText(/新文件.xlsx/)).toBeInTheDocument()
    expect(收到通知).toHaveBeenCalledTimes(1)
    expect((收到通知.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ 标题: '桌面有新文件', 内容: expect.stringContaining('新文件.xlsx') })
  } finally {
    window.removeEventListener(本机通知事件名, 收到通知)
    可用.mockRestore()
    文件列表.mockRestore()
    定时.mockRestore()
    清理.mockRestore()
  }
})
