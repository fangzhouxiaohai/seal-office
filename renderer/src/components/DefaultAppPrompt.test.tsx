import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { vi, it, expect, afterEach, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import DefaultAppPrompt from './DefaultAppPrompt'
import { 桥接 } from '../ipc/bridge'
import { SettingsProvider } from '../store/settingsStore'

beforeEach(() => { localStorage.removeItem('seal-default-app-auto') })
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('seal-default-app-auto') })

/** 组件读取设置开关，因此统一放在 SettingsProvider 内渲染 */
const 渲染 = (节点: React.ReactElement) => render(<SettingsProvider><AntdApp>{节点}</AntdApp></SettingsProvider>)

it('开关打开时启动即静默检查并自动设为默认，不弹确认框', async () => {
  vi.spyOn(桥接, '默认程序全自动可用', 'get').mockReturnValue(true)
  const 提示检查 = vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  const 全自动 = vi.spyOn(桥接, 'checkDefaultAppOnStartup').mockResolvedValue({ 成功: true, 已全部默认: true, 已处理: true })
  渲染(<DefaultAppPrompt />)
  await waitFor(() => expect(全自动).toHaveBeenCalledOnce())
  expect(提示检查).not.toHaveBeenCalled()
  expect(screen.queryByText('将海豹办公设为默认程序')).not.toBeInTheDocument()
})

it('开关打开但系统未全部放行时先确认再自动设置', async () => {
  vi.spyOn(桥接, '默认程序全自动可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppOnStartup').mockResolvedValue({ 成功: true, 已全部默认: false, 已处理: true, 未生效: ['pdf'] })
  const 应用 = vi.spyOn(桥接, 'applyDefaultApp').mockResolvedValue({ 成功: true, 已全部默认: false, 未生效: ['pdf'] })
  渲染(<DefaultAppPrompt />)
  expect(await screen.findByText('是否把海豹办公设为默认程序？')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '立即设为默认' }))
  await waitFor(() => expect(应用).toHaveBeenCalledOnce())
  expect((await screen.findAllByText('Windows 仍要求手动确认')).length).toBeGreaterThan(0)
  expect(screen.getByText(/需要确认：\.pdf/)).toBeInTheDocument()
})

it('验收开关生效时不做自动关联，改为首次询问', async () => {
  vi.spyOn(桥接, '默认程序全自动可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'defaultAppCheckState').mockResolvedValue({ 成功: true, 已禁用: true })
  vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  const 全自动 = vi.spyOn(桥接, 'checkDefaultAppOnStartup').mockResolvedValue({ 成功: true, 已全部默认: true, 已处理: true })
  渲染(<DefaultAppPrompt />)
  expect(await screen.findByText('将海豹办公设为默认程序')).toBeInTheDocument()
  expect(全自动).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '暂不设置' }))
})

it('开关打开但不是默认程序时先确认，点“立即设为默认”执行自动设置', async () => {
  vi.spyOn(桥接, '默认程序全自动可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppOnStartup').mockResolvedValue({ 成功: true, 已全部默认: false, 已处理: false, 未生效: ['docx', 'xlsx'] })
  const 应用 = vi.spyOn(桥接, 'applyDefaultApp').mockResolvedValue({ 成功: true, 已全部默认: true, 未生效: [] })
  渲染(<DefaultAppPrompt />)
  expect(await screen.findByText('是否把海豹办公设为默认程序？')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '立即设为默认' }))
  await waitFor(() => expect(应用).toHaveBeenCalledOnce())
  expect(await screen.findByText('已将 DOCX、XLSX、PPTX、PDF 设为海豹办公打开')).toBeInTheDocument()
})

it('自动设置后系统仍拦下时说明剩余格式并可打开系统页面', async () => {
  vi.spyOn(桥接, '默认程序全自动可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppOnStartup').mockResolvedValue({ 成功: true, 已全部默认: false, 已处理: false, 未生效: ['docx'] })
  vi.spyOn(桥接, 'applyDefaultApp').mockResolvedValue({ 成功: true, 已全部默认: false, 未生效: ['pdf'] })
  const 兜底 = vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: true, 已全部默认: false, 未生效: ['pdf'] })
  渲染(<DefaultAppPrompt />)
  await userEvent.click(await screen.findByRole('button', { name: '立即设为默认' }))
  expect((await screen.findAllByText('Windows 仍要求手动确认')).length).toBeGreaterThan(0)
  expect(screen.getByText(/需要确认：\.pdf/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '打开系统页面' }))
  await waitFor(() => expect(兜底).toHaveBeenCalledOnce())
})

it('开关打开且已经是默认程序时不打扰', async () => {
  vi.spyOn(桥接, '默认程序全自动可用', 'get').mockReturnValue(true)
  const 检查 = vi.spyOn(桥接, 'checkDefaultAppOnStartup').mockResolvedValue({ 成功: true, 已全部默认: true, 已处理: false })
  const 应用 = vi.spyOn(桥接, 'applyDefaultApp').mockResolvedValue({ 成功: true, 已全部默认: true })
  渲染(<DefaultAppPrompt />)
  await waitFor(() => expect(检查).toHaveBeenCalledOnce())
  expect(应用).not.toHaveBeenCalled()
  expect(screen.queryByText('是否把海豹办公设为默认程序？')).not.toBeInTheDocument()
})

it('开关关闭时沿用首次询问，取消不执行设置', async () => {
  localStorage.setItem('seal-default-app-auto', '关闭')
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  const 设置 = vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: true })
  渲染(<DefaultAppPrompt />)
  await userEvent.click(await screen.findByRole('button', { name: '暂不设置' }))
  await waitFor(() => expect(screen.queryByText('将海豹办公设为默认程序')).not.toBeInTheDocument())
  expect(设置).not.toHaveBeenCalled()
})
it('确认才调用默认程序设置动作', async () => {
  localStorage.setItem('seal-default-app-auto', '关闭')
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  const 设置 = vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: true })
  渲染(<DefaultAppPrompt />)
  await userEvent.click(await screen.findByRole('button', { name: '设为默认程序' }))
  await waitFor(() => expect(设置).toHaveBeenCalledOnce())
})
it('后续启动与已默认不显示询问', async () => {
  localStorage.setItem('seal-default-app-auto', '关闭')
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  const 检查 = vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: false })
  渲染(<DefaultAppPrompt />)
  await waitFor(() => expect(检查).toHaveBeenCalledOnce())
  expect(screen.queryByText('将海豹办公设为默认程序')).not.toBeInTheDocument()
})
it('严格模式重挂载仍只领取一次并显示询问', async () => {
  localStorage.setItem('seal-default-app-auto', '关闭')
  vi.spyOn(桥接, '默认程序提示可用', 'get').mockReturnValue(true)
  const 检查 = vi.spyOn(桥接, 'checkDefaultAppPrompt').mockResolvedValue({ 成功: true, 需要询问: true })
  render(<StrictMode><SettingsProvider><AntdApp><DefaultAppPrompt /></AntdApp></SettingsProvider></StrictMode>)
  await screen.findByText('将海豹办公设为默认程序')
  expect(检查).toHaveBeenCalledOnce()
  await userEvent.click(screen.getByRole('button', { name: '暂不设置' }))
})
