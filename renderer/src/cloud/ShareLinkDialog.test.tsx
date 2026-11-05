import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { beforeEach, expect, it, vi } from 'vitest'
import ShareLinkDialog from './ShareLinkDialog'

const fixture = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('./CloudProvider', () => ({ cloudCall: fixture.call }))
vi.mock('../store/settingsStore', () => ({ useSettings: () => ({ 语言: 'zh-CN' }) }))

const 写入剪贴板 = vi.fn()
beforeEach(() => {
  fixture.call.mockReset()
  写入剪贴板.mockReset().mockResolvedValue(undefined)
  window.sealClipboard = undefined
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: 写入剪贴板 } })
})

it('生成后展示完整链接，不把空地址当作成功', async () => {
  const url = 'https://cloud.example.test/share/#/s/11111111-1111-4111-8111-111111111111?a=secret&k=payload'
  fixture.call.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', url, expiresAt: null, hasCode: false })
  const view = render(<AntdApp><ShareLinkDialog 文件={{ id: 'file', name: '合同.docx' }} onClose={() => {}} /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '生成链接' }))
  expect(await screen.findByRole('textbox', { name: '分享链接' })).toHaveValue(url)
  await waitFor(() => expect(写入剪贴板).toHaveBeenCalledWith(url))
  view.unmount()
  fixture.call.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', expiresAt: null, hasCode: false })
  render(<AntdApp><ShareLinkDialog 文件={{ id: 'file', name: '合同.docx' }} onClose={() => {}} /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '生成链接' }))
  expect(await screen.findByText(/返回的链接地址无效/)).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '分享链接' })).not.toBeInTheDocument()
})

it('自动复制失败时保留完整地址和手动复制入口', async () => {
  const url = 'https://cloud.example.test/share/#/s/11111111-1111-4111-8111-111111111111?a=secret&k=payload'
  写入剪贴板.mockRejectedValueOnce(new Error('剪贴板受限'))
  fixture.call.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', url, expiresAt: null, hasCode: false })
  render(<AntdApp><ShareLinkDialog 文件={{ id: 'file', name: '合同.docx' }} onClose={() => {}} /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '生成链接' }))
  expect(await screen.findByRole('textbox', { name: '分享链接' })).toHaveValue(url)
  expect(screen.getByRole('button', { name: '复制链接' })).toBeInTheDocument()
  expect(await screen.findByText(/自动复制失败/)).toBeInTheDocument()
})

it('原生安卓宿主优先通过桥接复制分享链接', async () => {
  const url = 'https://cloud.example.test/share/#/s/11111111-1111-4111-8111-111111111111?a=secret&k=payload'
  const 原生写入 = vi.fn().mockResolvedValue(undefined)
  window.sealClipboard = { writeText: 原生写入 }
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  fixture.call.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', url, expiresAt: null, hasCode: false })
  render(<AntdApp><ShareLinkDialog 文件={{ id: 'file', name: '合同.docx' }} onClose={() => {}} /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '生成链接' }))
  await waitFor(() => expect(原生写入).toHaveBeenCalledWith(url))
  expect(写入剪贴板).not.toHaveBeenCalled()
})
