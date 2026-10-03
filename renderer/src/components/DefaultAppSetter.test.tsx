import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import DefaultAppSetter from './DefaultAppSetter'
import { 桥接 } from '../ipc/bridge'

afterEach(() => { vi.restoreAllMocks() })

it('系统拒绝默认应用设置时在当前主题上下文显示原因', async () => {
  vi.spyOn(桥接, '可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: false, 错误: '系统设置不可用' })
  render(<ConfigProvider><AntdApp><DefaultAppSetter /></AntdApp></ConfigProvider>)
  await userEvent.click(screen.getByRole('button', { name: '打开系统默认应用设置' }))
  expect(await screen.findByRole('dialog', { name: '设置默认应用失败' })).toBeInTheDocument()
  expect(screen.getByText('系统设置不可用')).toBeInTheDocument()
})
