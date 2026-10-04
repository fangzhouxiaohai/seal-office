import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { vi, it, expect, afterEach } from 'vitest'
import { StrictMode } from 'react'
import DefaultAppPrompt from './DefaultAppPrompt'
import { 桥接 } from '../ipc/bridge'
afterEach(() => { vi.restoreAllMocks() })
it('首次非默认显示统一确认弹窗，取消不执行设置', async () => {
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  const 设置 = vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: true })
  render(<AntdApp><DefaultAppPrompt /></AntdApp>)
  await userEvent.click(await screen.findByRole('button', { name: '暂不设置' }))
  await waitFor(() => expect(screen.queryByText('将海豹办公设为默认程序')).not.toBeInTheDocument())
  expect(设置).not.toHaveBeenCalled()
})
it('确认才调用默认程序设置动作', async () => {
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  const 设置 = vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: true })
  render(<AntdApp><DefaultAppPrompt /></AntdApp>)
  await userEvent.click(await screen.findByRole('button', { name: '设为默认程序' }))
  await waitFor(() => expect(设置).toHaveBeenCalledOnce())
})
it('后续启动与已默认不显示询问', async () => {
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  const 检查 = vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: false })
  render(<AntdApp><DefaultAppPrompt /></AntdApp>)
  await waitFor(() => expect(检查).toHaveBeenCalledOnce())
  expect(screen.queryByText('将海豹办公设为默认程序')).not.toBeInTheDocument()
})
it('严格模式重挂载仍只领取一次并显示询问', async () => {
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  const 检查 = vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  render(<StrictMode><AntdApp><DefaultAppPrompt /></AntdApp></StrictMode>)
  await screen.findByText('将海豹办公设为默认程序')
  expect(检查).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button', { name: '暂不设置' }))
})
