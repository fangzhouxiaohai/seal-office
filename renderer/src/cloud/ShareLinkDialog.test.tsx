import { fireEvent, render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { beforeEach, expect, it, vi } from 'vitest'
import ShareLinkDialog from './ShareLinkDialog'

const fixture = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('./CloudProvider', () => ({ cloudCall: fixture.call }))
vi.mock('../store/settingsStore', () => ({ useSettings: () => ({ 语言: 'zh-CN' }) }))

beforeEach(() => fixture.call.mockReset())

it('生成后展示完整链接，不把空地址当作成功', async () => {
  const url = 'https://cloud.example.test/share/#/s/11111111-1111-4111-8111-111111111111?a=secret&k=payload'
  fixture.call.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', url, expiresAt: null, hasCode: false })
  const view = render(<AntdApp><ShareLinkDialog 文件={{ id: 'file', name: '合同.docx' }} onClose={() => {}} /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '生成链接' }))
  expect(await screen.findByRole('textbox', { name: '分享链接' })).toHaveValue(url)
  view.unmount()
  fixture.call.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', expiresAt: null, hasCode: false })
  render(<AntdApp><ShareLinkDialog 文件={{ id: 'file', name: '合同.docx' }} onClose={() => {}} /></AntdApp>)
  fireEvent.click(screen.getByRole('button', { name: '生成链接' }))
  expect(await screen.findByText(/返回的链接地址无效/)).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '分享链接' })).not.toBeInTheDocument()
})
