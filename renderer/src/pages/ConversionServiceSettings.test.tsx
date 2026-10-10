import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from 'antd'
import ConversionServiceSettings from './ConversionServiceSettings'
afterEach(() => { delete window.sealDocumentConversion })
function mount() { return render(<App><ConversionServiceSettings /></App>) }
it('桌面不显示手机转换设置', () => { mount(); expect(screen.queryByText('自建文档转换服务')).toBeNull() })
it('保存和测试使用填写地址，已有令牌不回显，清除后可重新填写', async () => {
  const save = vi.fn(async () => {}), test = vi.fn(async () => ({ inputCount: 48, maximumBytes: 20971520 })), clear = vi.fn(async () => {})
  window.sealDocumentConversion = { get: () => ({ url: 'https://office.example.test', hasToken: true }), save, test, clear }
  mount()
  expect(screen.getByLabelText('文档转换访问令牌')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('文档转换服务地址'), { target: { value: 'https://new.example.test' } })
  fireEvent.change(screen.getByLabelText('文档转换访问令牌'), { target: { value: 'synthetic-not-a-real-secret' } })
  fireEvent.click(screen.getByText('保存转换配置'))
  await waitFor(() => expect(save).toHaveBeenCalledWith({ url: 'https://new.example.test', token: 'synthetic-not-a-real-secret' }))
  await waitFor(() => expect(screen.getByLabelText('文档转换访问令牌')).toHaveValue(''))
  fireEvent.click(screen.getByText('测试连接')); await waitFor(() => expect(test).toHaveBeenCalledWith({ url: 'https://new.example.test', token: '' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '清除配置' })).not.toBeDisabled()); fireEvent.click(screen.getByText('清除配置'))
  await waitFor(() => expect(clear).toHaveBeenCalledOnce()); await waitFor(() => expect(screen.getByLabelText('文档转换服务地址')).toHaveValue(''))
})
it('读取失败时阻止覆盖，清除后恢复操作', async () => {
  const clear = vi.fn(async () => {})
  window.sealDocumentConversion = { get: () => { throw new Error('synthetic') }, save: vi.fn(), test: vi.fn(), clear }
  mount(); expect(screen.getByRole('button', { name: '保存转换配置' })).toBeDisabled()
  fireEvent.click(screen.getByText('清除配置')); await waitFor(() => expect(clear).toHaveBeenCalledOnce()); await waitFor(() => expect(screen.getByRole('button', { name: '保存转换配置' })).not.toBeDisabled())
})
