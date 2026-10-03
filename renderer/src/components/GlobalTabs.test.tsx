import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { AppProvider, useAppStore } from '../store'
import GlobalTabs from './GlobalTabs'

const 创建入口 = () => {
  const { createDoc } = useAppStore()
  return <button onClick={() => createDoc('word', '<p>正文</p>', { 路径: 'C:\\资料\\报告.docx' })}>打开报告</button>
}

afterEach(() => {
  localStorage.removeItem('seal-tab-double-click-close')
})

it('双击关闭标签开关开启后可关闭已保存文件，首页始终保留', async () => {
  localStorage.setItem('seal-tab-double-click-close', 'true')
  render(<AntdApp><AppProvider><创建入口 /><GlobalTabs /></AppProvider></AntdApp>)
  await userEvent.click(screen.getByRole('button', { name: '打开报告' }))
  expect(screen.getByRole('tab', { name: '报告.docx' })).toBeInTheDocument()
  await userEvent.dblClick(screen.getByRole('tab', { name: '报告.docx' }))
  expect(screen.queryByRole('tab', { name: '报告.docx' })).toBeNull()
  expect(screen.getByRole('tab', { name: '首页' })).toHaveAttribute('aria-selected', 'true')
})

it('双击关闭标签开关关闭时双击仅选择标签', async () => {
  localStorage.setItem('seal-tab-double-click-close', 'false')
  render(<AntdApp><AppProvider><创建入口 /><GlobalTabs /></AppProvider></AntdApp>)
  await userEvent.click(screen.getByRole('button', { name: '打开报告' }))
  await userEvent.dblClick(screen.getByRole('tab', { name: '报告.docx' }))
  expect(screen.getByRole('tab', { name: '报告.docx' })).toHaveAttribute('aria-selected', 'true')
})

it('双击关闭偏好读取失败时弹窗说明并保留标签', async () => {
  render(<AntdApp><AppProvider><创建入口 /><GlobalTabs /></AppProvider></AntdApp>)
  await userEvent.click(screen.getByRole('button', { name: '打开报告' }))
  const 原读取 = Storage.prototype.getItem
  const 读取 = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, 键: string) {
    if (键 === 'seal-tab-double-click-close') throw new Error('偏好读取失败')
    return 原读取.call(this, 键)
  })
  try {
    await userEvent.dblClick(screen.getByRole('tab', { name: '报告.docx' }))
    expect((await screen.findAllByText('读取标签设置失败')).length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: '报告.docx' })).toBeInTheDocument()
  } finally {
    读取.mockRestore()
  }
})

it('键盘方向键与首尾键可在首页和文件标签间切换', async () => {
  render(<AntdApp><AppProvider><创建入口 /><GlobalTabs /></AppProvider></AntdApp>)
  await userEvent.click(screen.getByRole('button', { name: '打开报告' }))
  const 文件 = screen.getByRole('tab', { name: '报告.docx' })
  文件.focus()
  await userEvent.keyboard('{ArrowLeft}')
  const 首页 = screen.getByRole('tab', { name: '首页' })
  expect(首页).toHaveFocus()
  expect(首页).toHaveAttribute('aria-selected', 'true')
  await userEvent.keyboard('{End}')
  expect(文件).toHaveFocus()
  expect(文件).toHaveAttribute('aria-selected', 'true')
})
