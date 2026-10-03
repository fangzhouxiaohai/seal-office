import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import AiSettingsCard from './AiSettingsCard'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('智能助手设置同步', () => {
  it('其他设置入口清除配置后重新读取并更新表单', async () => {
    let 当前配置 = { 名称: '本机服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false }
    const 读取配置 = vi.fn().mockImplementation(async () => ({ 成功: true, 数据: 当前配置 }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: { getConfig: 读取配置, chat: vi.fn() } } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AiSettingsCard /></AntdApp></ConfigProvider>)
    await waitFor(() => expect(screen.getByRole('textbox', { name: '模型服务商名称' })).toHaveValue('本机服务'))
    当前配置 = { 名称: '', 地址: '', 模型: '', 已配置密钥: false }
    window.dispatchEvent(new Event('seal-ai-setting-changed'))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '模型服务商名称' })).toHaveValue(''))
    expect(读取配置).toHaveBeenCalledTimes(2)
  })

  it('保存服务商和密钥后清空输入框且不回显密钥', async () => {
    let 当前配置 = { 名称: '', 地址: '', 模型: '', 已配置密钥: false }
    const 读取配置 = vi.fn().mockImplementation(async () => ({ 成功: true, 数据: 当前配置 }))
    const 保存配置 = vi.fn().mockImplementation(async () => {
      当前配置 = { 名称: '测试服务', 地址: 'https://example.com/v1/chat/completions', 模型: '测试模型', 已配置密钥: true }
      return { 成功: true, 数据: 当前配置 }
    })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: { getConfig: 读取配置, saveConfig: 保存配置, chat: vi.fn() } } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AiSettingsCard /></AntdApp></ConfigProvider>)
    await waitFor(() => expect(screen.getByRole('textbox', { name: '模型服务商名称' })).toBeEnabled())
    await userEvent.type(screen.getByRole('textbox', { name: '模型服务商名称' }), '测试服务')
    await userEvent.type(screen.getByRole('textbox', { name: '模型接口地址' }), 'https://example.com/v1/chat/completions')
    await userEvent.type(screen.getByRole('textbox', { name: '模型名称' }), '测试模型')
    await userEvent.type(screen.getByLabelText('模型访问密钥'), '私人密钥')
    await userEvent.click(screen.getByRole('button', { name: '保存模型设置' }))
    await waitFor(() => expect(保存配置).toHaveBeenCalledWith(expect.objectContaining({ 密钥: '私人密钥' })))
    await waitFor(() => expect(screen.getByLabelText('模型访问密钥')).toHaveValue(''))
    await waitFor(() => expect(screen.getByText('已保存访问密钥')).toBeInTheDocument())
    expect(screen.queryByText('私人密钥')).not.toBeInTheDocument()
  })

  it('保存失败时显示错误并保留表单输入', async () => {
    const 读取配置 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '', 地址: '', 模型: '', 已配置密钥: false } })
    const 保存配置 = vi.fn().mockResolvedValue({ 成功: false, 错误: '系统安全存储不可用' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: { getConfig: 读取配置, saveConfig: 保存配置, chat: vi.fn() } } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AiSettingsCard /></AntdApp></ConfigProvider>)
    await waitFor(() => expect(screen.getByRole('textbox', { name: '模型服务商名称' })).toBeEnabled())
    await userEvent.type(screen.getByRole('textbox', { name: '模型服务商名称' }), '临时服务')
    await userEvent.click(screen.getByRole('button', { name: '保存模型设置' }))
    expect(await screen.findByText('系统安全存储不可用')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '模型服务商名称' })).toHaveValue('临时服务')
  })
})
