import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { SettingsErrorFeedback, SettingsProvider, useSettings } from './settingsStore'

const 主题探针 = () => {
  const { 主题, 切换主题 } = useSettings()
  return <><output data-testid="当前主题">{主题}</output><button onClick={切换主题}>切换主题</button></>
}

const 渲染主题 = () => render(
  <SettingsProvider>
    <ConfigProvider>
      <AntdApp><SettingsErrorFeedback /><主题探针 /></AntdApp>
    </ConfigProvider>
  </SettingsProvider>
)

describe('主题设置持久化', () => {
  beforeEach(() => localStorage.removeItem('seal-theme'))
  afterEach(() => { vi.restoreAllMocks() })

  it('主题读取失败时显示当前组件上下文的错误弹窗', async () => {
    const 原读取 = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, 键: string) {
      if (键 === 'seal-theme') throw new Error('主题记录不可读')
      return 原读取.call(this, 键)
    })
    渲染主题()
    expect(await screen.findByRole('dialog', { name: '读取主题设置失败' })).toBeInTheDocument()
    expect(screen.getByText('主题记录不可读')).toBeInTheDocument()
  })

  it('主题保存失败时保留原主题并显示错误弹窗', async () => {
    const 原写入 = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, 键: string, 值: string) {
      if (键 === 'seal-theme') throw new Error('主题记录不可写')
      return 原写入.call(this, 键, 值)
    })
    渲染主题()
    await userEvent.click(screen.getByRole('button', { name: '切换主题' }))
    expect(screen.getByTestId('当前主题')).toHaveTextContent('浅色')
    expect(await screen.findByRole('dialog', { name: '保存主题设置失败' })).toBeInTheDocument()
    expect(screen.getByText('主题记录不可写')).toBeInTheDocument()
  })
})
