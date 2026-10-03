import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import SettingsPage from './SettingsPage'
import { AppProvider } from '../store'
import { SettingsProvider } from '../store/settingsStore'
import { 保存翻译配置 } from '../editor/translateSettings'

describe('设置页状态与真实能力一致', () => {
  it('未实现的云同步与退出恢复开关不可切换', () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    const 云同步 = screen.getByText('文档云同步').closest('.settings-wps-row')?.querySelector('[role="switch"]')
    const 退出恢复 = screen.getByText('退出时保存工作状态').closest('.settings-wps-row')?.querySelector('[role="switch"]')
    expect(云同步).toBeDisabled()
    expect(退出恢复).toBeDisabled()
    expect(screen.queryByRole('button', { name: '查看' })).not.toBeInTheDocument()
  })

  it('未开放的设置入口可由键盘读取提示且状态明确', async () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    const 入口 = screen.getByRole('button', { name: /系统预览窗格设置/ })
    入口.focus()
    expect(入口).toHaveFocus()
    expect(入口).toHaveTextContent('暂未开放')
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByText('系统预览窗格设置即将开放')).toBeInTheDocument()
  })

  it('文件关联未实现时不提供无效设置按钮', () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    expect(screen.queryByRole('button', { name: '设置关联' })).not.toBeInTheDocument()
    expect(screen.getByText('文件格式关联').closest('.settings-wps-row')).toHaveTextContent('暂未开放')
  })

  it('本机存储失败时用弹窗说明翻译设置未保存', async () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    const 写入 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('存储拒绝写入') })
    try {
      await userEvent.click(screen.getByRole('button', { name: '保存翻译设置' }))
      expect((await screen.findAllByText('保存翻译设置失败')).length).toBeGreaterThan(0)
      expect((await screen.findAllByText(/存储拒绝写入/)).length).toBeGreaterThan(0)
      expect(screen.queryByText('翻译设置已保存')).not.toBeInTheDocument()
    } finally {
      写入.mockRestore()
    }
  })

  it('翻译配置读取失败时弹窗并阻止空配置覆盖原设置', async () => {
    const 原读取 = Storage.prototype.getItem
    const 读取 = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, 键: string) {
      if (键 === 'seal.office.translate') throw new Error('存储拒绝读取')
      return 原读取.call(this, 键)
    })
    try {
      render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
      expect((await screen.findAllByText('读取翻译设置失败')).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '保存翻译设置' })).toBeDisabled()
      expect(screen.getByText(/原翻译设置读取失败/)).toBeInTheDocument()
    } finally {
      读取.mockRestore()
    }
  })

  it('翻译配置输入框具有可读取的字段名称', () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    expect(screen.getByRole('textbox', { name: '翻译服务地址' })).toBeInTheDocument()
    expect(screen.getByLabelText('翻译服务密钥')).toHaveAttribute('type', 'password')
  })

  it('恢复默认时清除已保存的翻译配置并更新页面内容', async () => {
    保存翻译配置({ 地址: 'https://a.example.com', 密钥: '旧密钥' })
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }))
    expect(localStorage.getItem('seal.office.translate')).toBeNull()
    expect(screen.getByRole('textbox', { name: '翻译服务地址' })).toHaveValue('')
  })
})
