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

describe('启动时检查默认程序开关', () => {
  const 开关探针 = () => {
    const { 启动时检查默认程序, 设置启动时检查默认程序 } = useSettings()
    return <>
      <output data-testid="开关">{启动时检查默认程序 ? '开启' : '关闭'}</output>
      <button onClick={() => 设置启动时检查默认程序(false)}>关闭自动检查</button>
    </>
  }
  const 渲染开关 = () => render(
    <SettingsProvider>
      <ConfigProvider><AntdApp><SettingsErrorFeedback /><开关探针 /></AntdApp></ConfigProvider>
    </SettingsProvider>
  )
  beforeEach(() => localStorage.removeItem('seal-default-app-auto'))
  afterEach(() => { vi.restoreAllMocks() })

  it('默认打开，与 WPS 一样启动即自动关联', () => {
    渲染开关()
    expect(screen.getByTestId('开关')).toHaveTextContent('开启')
  })

  it('关闭后写入本机记录，重启仍保持关闭', async () => {
    渲染开关()
    await userEvent.click(screen.getByRole('button', { name: '关闭自动检查' }))
    expect(screen.getByTestId('开关')).toHaveTextContent('关闭')
    expect(localStorage.getItem('seal-default-app-auto')).toBe('关闭')
    document.body.innerHTML = ''
    渲染开关()
    expect(screen.getByTestId('开关')).toHaveTextContent('关闭')
  })

  it('本地记录写入失败时保留原开关并提示', async () => {
    const 原写入 = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, 键: string, 值: string) {
      if (键 === 'seal-default-app-auto') throw new Error('设置不可写')
      return 原写入.call(this, 键, 值)
    })
    渲染开关()
    await userEvent.click(screen.getByRole('button', { name: '关闭自动检查' }))
    expect(screen.getByTestId('开关')).toHaveTextContent('开启')
    expect(await screen.findByRole('dialog', { name: '保存默认程序设置失败' })).toBeInTheDocument()
    expect(screen.getByText('设置不可写')).toBeInTheDocument()
  })
})

describe('界面语言持久化', () => {
  const 语言探针 = () => {
    const { 语言, 设置语言 } = useSettings()
    return <>
      <output data-testid="界面语言">{语言}</output>
      <button onClick={() => 设置语言('en-US')}>切换英语</button>
    </>
  }
  const 渲染语言 = () => render(
    <SettingsProvider>
      <ConfigProvider><AntdApp><SettingsErrorFeedback /><语言探针 /></AntdApp></ConfigProvider>
    </SettingsProvider>
  )

  beforeEach(() => localStorage.removeItem('seal-language'))
  afterEach(() => { vi.restoreAllMocks(); document.documentElement.lang = 'zh-CN' })

  it('默认使用中文，切换英语后写入本机记录并更新文档语言', async () => {
    渲染语言()
    expect(screen.getByTestId('界面语言')).toHaveTextContent('zh-CN')
    await userEvent.click(screen.getByRole('button', { name: '切换英语' }))
    expect(screen.getByTestId('界面语言')).toHaveTextContent('en-US')
    expect(localStorage.getItem('seal-language')).toBe('en-US')
    expect(document.documentElement).toHaveAttribute('lang', 'en-US')
  })

  it('重启后恢复已保存的英语界面', () => {
    localStorage.setItem('seal-language', 'en-US')
    渲染语言()
    expect(screen.getByTestId('界面语言')).toHaveTextContent('en-US')
  })
})
