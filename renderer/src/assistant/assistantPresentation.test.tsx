import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider } from '../store'
import AiAssistant from './AiAssistant'
import type { 助手配置, 助手对话输入 } from '../ipc/bridge'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

it('设置面板的思考强度用于下一次请求，历史和最终回复按类型展示且新对话清理结果', async () => {
  let 配置: 助手配置 = { 名称: '测试服务', 服务商: 'custom', 地址: 'http://localhost/chat', 模型: '测试模型', 思考强度: 'medium', 参数模式: 'six', 已配置密钥: false, 上下文令牌: 131072 }
  let 完成!: (值: unknown) => void
  const 对话 = vi.fn((_输入: 助手对话输入) => new Promise((resolve) => { 完成 = resolve }))
  const 清理 = vi.fn().mockResolvedValue({ 成功: true })
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }), ai: {
      getConfig: async () => ({ 成功: true, 数据: 配置 }),
      saveConfig: async (值: 助手配置) => { 配置 = { ...值, 已配置密钥: false }; return { 成功: true, 数据: 配置 } },
      getSession: async () => ({ 成功: true, 数据: { 摘要: '', 计划: [], 压缩次数: 0, 显示消息: [{ 角色: 'assistant', 内容: '```python\nprint("历史")\n```' }] } }),
      chat: 对话, onStream: () => () => {}, onToolCall: () => () => {}, clearSession: 清理,
    },
  } })
  render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
  await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
  expect(await screen.findByRole('region', { name: 'Python内容' })).toBeInTheDocument()
  expect(document.querySelector('.assistant-drawer__composer .ant-select')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '模型设置' }))
  expect(screen.getByRole('checkbox', { name: '仅生成计划' })).toBeInTheDocument()
  expect(screen.getByText(/当前上下文 128K/)).toBeInTheDocument()
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '默认思考强度' }).closest('.ant-select')!.querySelector('.ant-select-selector')!)
  fireEvent.click(await screen.findByText('低', { selector: '.ant-select-item-option-content' }))
  await userEvent.click(screen.getByRole('button', { name: '保存模型设置' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '模型设置' })).toHaveAttribute('aria-expanded', 'false'))
  fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '输出 JSON 示例' } })
  await userEvent.click(screen.getByRole('button', { name: '发送' }))
  await waitFor(() => expect(对话).toHaveBeenCalledTimes(1))
  expect(对话.mock.calls[0][0].思考强度).toBe('low')
  expect(screen.queryByRole('region', { name: '助手任务队列' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '模型设置' }))
  expect(screen.getByRole('checkbox', { name: '仅生成计划' })).toBeDisabled()
  await act(async () => 完成({ 成功: true, 数据: { 内容: '```json\n{"name":"海豹"}\n```' } }))
  await userEvent.click(screen.getByRole('button', { name: '收起模型设置' }))
  expect(within(screen.getByRole('region', { name: 'JSON内容' })).getByRole('button', { name: '复制JSON代码' }).closest('footer')).not.toBeNull()
  expect(screen.getByRole('region', { name: 'JSON内容' }).querySelector('code')?.textContent).toBe('{"name":"海豹"}')
  await userEvent.click(screen.getByRole('button', { name: '新对话' }))
  await waitFor(() => expect(清理).toHaveBeenCalledOnce())
  expect(screen.queryByRole('region', { name: 'JSON内容' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Python内容' })).not.toBeInTheDocument()
})
