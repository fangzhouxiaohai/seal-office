import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import AiSettingsCard from './AiSettingsCard'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('智能助手设置同步', () => {
  it('高级设置可调整上下文令牌并保存，旧配置使用默认值', async () => {
    const 保存配置 = vi.fn().mockImplementation(async (输入) => ({ 成功: true, 数据: { ...输入, 已配置密钥: false } }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '本机', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }),
      saveConfig: 保存配置, chat: vi.fn(),
    } } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AiSettingsCard /></AntdApp></ConfigProvider>)
    const 输入框 = await screen.findByRole('spinbutton', { name: '上下文令牌' })
    await waitFor(() => expect(输入框).toBeEnabled())
    expect(输入框).toHaveValue('131072')
    fireEvent.change(输入框, { target: { value: '262144' } })
    await userEvent.click(screen.getByRole('button', { name: '保存模型设置' }))
    await waitFor(() => expect(保存配置).toHaveBeenCalledWith(expect.objectContaining({ 上下文令牌: 262144 })))
  })
  it('DeepSeek 初始预设仅填写密钥即可保存高强度配置，切换智谱清空旧密钥', async () => {
    const 保存配置 = vi.fn().mockImplementation(async (输入) => ({ 成功: true, 数据: { ...输入, 密钥: undefined, 已配置密钥: true } }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: 'DeepSeek', 服务商: 'deepseek', 地址: 'https://api.deepseek.com/chat/completions', 模型: 'deepseek-flash', 思考强度: 'high', 参数模式: 'three', 已配置密钥: false } }),
      saveConfig: 保存配置, chat: vi.fn(),
    } } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AiSettingsCard /></AntdApp></ConfigProvider>)
    await waitFor(() => expect(screen.getByLabelText('模型访问密钥')).toBeEnabled())
    await userEvent.type(screen.getByLabelText('模型访问密钥'), '测试专用密钥')
    await userEvent.click(screen.getByRole('button', { name: '保存模型设置' }))
    await waitFor(() => expect(保存配置).toHaveBeenCalledWith(expect.objectContaining({ 服务商: 'deepseek', 模型: 'deepseek-flash', 思考强度: 'high', 密钥: '测试专用密钥' })))
    await userEvent.type(screen.getByLabelText('模型访问密钥'), '不能沿用的密钥')
    await userEvent.click(screen.getByRole('combobox', { name: '选择模型服务商' }))
    await userEvent.click(await screen.findByText('智谱', { selector: '.ant-select-item-option-content' }))
    expect(screen.getByLabelText('模型访问密钥')).toHaveValue('')
    expect(screen.getAllByText(/glm-5.3/).length).toBeGreaterThan(0)
  })
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
