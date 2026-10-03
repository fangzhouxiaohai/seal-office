import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, Modal } from 'antd'
import SettingsPage from './SettingsPage'
import { AppProvider } from '../store'
import { SettingsProvider } from '../store/settingsStore'
import { 保存翻译配置 } from '../editor/translateSettings'
import { 桥接 } from '../ipc/bridge'

describe('设置页状态与真实能力一致', () => {
  beforeEach(() => {
    Modal.destroyAll()
    vi.spyOn(桥接, 'backupLoad').mockResolvedValue({ 成功: true, 内容: null })
    localStorage.removeItem('seal-theme')
    localStorage.removeItem('seal-session-restore')
    localStorage.removeItem('seal-tab-double-click-close')
    localStorage.removeItem('seal-new-file-alert-folder')
  })

  afterEach(() => {
    Modal.destroyAll()
    vi.restoreAllMocks()
  })

  it('新文件提醒可选择本机目录并关闭', async () => {
    const 桌面桥接 = vi.spyOn(桥接, '可用', 'get').mockReturnValue(true)
    try {
      render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
      const 提醒开关 = screen.getByRole('switch', { name: '新文件接收提醒' })
      expect(提醒开关).toHaveAttribute('aria-checked', 'false')
      await userEvent.click(提醒开关)
      expect(localStorage.getItem('seal-new-file-alert-folder')).toBe('desktop')
      await userEvent.click(screen.getByRole('combobox', { name: '提醒目录' }))
      fireEvent.click(await screen.findByTitle('下载'))
      expect(localStorage.getItem('seal-new-file-alert-folder')).toBe('download')
      await userEvent.click(提醒开关)
      expect(localStorage.getItem('seal-new-file-alert-folder')).toBeNull()
    } finally {
      桌面桥接.mockRestore()
    }
  })

  it('浏览器预览中不能启用依赖本机文件通道的新文件提醒', () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    expect(screen.getByRole('switch', { name: '新文件接收提醒' })).toBeDisabled()
    expect(screen.getByText(/请在 Windows 桌面版启用/)).toBeInTheDocument()
  })

  it('云同步不可切换，本地会话恢复和双击关闭标签可保存偏好', async () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    const 云同步 = screen.getByText('文档云同步').closest('.settings-wps-row')?.querySelector('[role="switch"]')
    const 退出恢复 = screen.getByRole('switch', { name: '退出时保存工作状态' })
    const 双击关闭 = screen.getByRole('switch', { name: '使用鼠标双击关闭标签' })
    expect(云同步).toBeDisabled()
    expect(退出恢复).toBeEnabled()
    expect(退出恢复).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(退出恢复)
    await userEvent.click(双击关闭)
    expect(localStorage.getItem('seal-session-restore')).toBe('false')
    expect(localStorage.getItem('seal-tab-double-click-close')).toBe('true')
    expect(screen.queryByRole('button', { name: '查看' })).not.toBeInTheDocument()
  })

  it('系统预览组件未安装时不提供虚假的启用入口，窗口固定为底部标签模式', () => {
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    expect(screen.getByText('系统预览窗格设置').closest('.settings-wps-row')).toHaveTextContent('需要 Windows 预览处理程序')
    expect(screen.queryByRole('button', { name: /系统预览窗格设置/ })).not.toBeInTheDocument()
    expect(screen.getByText('窗口管理模式').closest('.settings-wps-row')).toHaveTextContent('整合式底部标签')
    expect(screen.queryByRole('button', { name: /窗口管理模式/ })).not.toBeInTheDocument()
    expect(screen.getByText('在线文档浏览设置').closest('.settings-wps-row')).toHaveTextContent('需要云端服务')
  })

  it('文件关联打开 Windows 默认应用设置', async () => {
    const 打开 = vi.spyOn(桥接, 'setDefaultApp').mockResolvedValue({ 成功: true, 提示: '已打开系统默认应用设置' })
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    try {
      await userEvent.click(screen.getByRole('button', { name: '打开系统设置' }))
      expect(打开).toHaveBeenCalledOnce()
      expect(await screen.findByText('已打开系统默认应用设置')).toBeInTheDocument()
    } finally {
      打开.mockRestore()
    }
  })

  it('完整性检查逐项展示文件异常', async () => {
    const 检查 = vi.spyOn(桥接, 'checkIntegrity').mockResolvedValue({ 成功: true, 完整: false, 检查文件数: 12, 异常: [{ 路径: 'main/main.js', 原因: '校验值不一致' }] })
    try {
      render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
      await userEvent.click(screen.getByRole('button', { name: '立即检测' }))
      expect((await screen.findAllByText(/main\/main\.js（校验值不一致）/)).length).toBeGreaterThan(0)
      expect(检查).toHaveBeenCalledOnce()
    } finally {
      检查.mockRestore()
    }
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
    expect(await screen.findByRole('dialog', { name: '确认恢复初始设置' })).toBeInTheDocument()
    expect(localStorage.getItem('seal.office.translate')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /取\s*消/ }))
    expect(localStorage.getItem('seal.office.translate')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '恢复默认' }))
    await userEvent.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(localStorage.getItem('seal.office.translate')).toBeNull()
    expect(screen.getByRole('textbox', { name: '翻译服务地址' })).toHaveValue('')
  })

  it('恢复默认清除深色主题后不重复写入主题设置', async () => {
    localStorage.setItem('seal-theme', '深色')
    render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
    expect(screen.getByRole('switch', { name: '外观设置' })).toHaveAttribute('aria-checked', 'true')
    const 原写入 = Storage.prototype.setItem
    const 写入 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, 键: string, 值: string) {
      if (键 === 'seal-theme') throw new Error('主题记录不可写')
      return 原写入.call(this, 键, 值)
    })
    try {
      await userEvent.click(screen.getByRole('button', { name: '恢复默认' }))
      await userEvent.click(screen.getByRole('button', { name: '确认恢复' }))
      expect(await screen.findByText('已恢复初始默认设置')).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: '外观设置' })).toHaveAttribute('aria-checked', 'false')
      expect(localStorage.getItem('seal-theme')).toBeNull()
      expect(写入).not.toHaveBeenCalledWith('seal-theme', '浅色')
    } finally {
      写入.mockRestore()
      localStorage.removeItem('seal-theme')
    }
  })

  it('桌面版恢复默认会清除加密模型配置并通知已打开的助手', async () => {
    const 可用 = vi.spyOn(桥接.ai, '可用', 'get').mockReturnValue(true)
    const 读取 = vi.spyOn(桥接.ai, 'getConfig').mockResolvedValue({ 成功: true, 数据: { 名称: '原服务商', 地址: 'https://example.com/v1/chat/completions', 模型: '原模型', 已配置密钥: true } })
    const 清除 = vi.spyOn(桥接.ai, 'clearConfig').mockResolvedValue({ 成功: true, 数据: { 名称: '自定义模型服务', 地址: '', 模型: '', 已配置密钥: false } })
    const 配置事件 = vi.fn()
    window.addEventListener('seal-ai-setting-changed', 配置事件)
    try {
      localStorage.setItem('seal-new-file-alert-folder', 'desktop')
      render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
      await userEvent.click(screen.getByRole('button', { name: '恢复默认' }))
      await userEvent.click(screen.getByRole('button', { name: '确认恢复' }))
      expect(清除).toHaveBeenCalledOnce()
      expect(localStorage.getItem('seal-new-file-alert-folder')).toBeNull()
      expect(配置事件).toHaveBeenCalledOnce()
      expect(await screen.findByText('已恢复初始默认设置')).toBeInTheDocument()
    } finally {
      window.removeEventListener('seal-ai-setting-changed', 配置事件)
      可用.mockRestore()
      读取.mockRestore()
      清除.mockRestore()
    }
  })

  it('清除模型配置失败时保留原有本地偏好并弹窗说明', async () => {
    const 可用 = vi.spyOn(桥接.ai, '可用', 'get').mockReturnValue(true)
    const 读取 = vi.spyOn(桥接.ai, 'getConfig').mockResolvedValue({ 成功: true, 数据: { 名称: '原服务商', 地址: 'https://example.com/v1/chat/completions', 模型: '原模型', 已配置密钥: true } })
    const 清除 = vi.spyOn(桥接.ai, 'clearConfig').mockResolvedValue({ 成功: false, 错误: '密钥文件拒绝删除' })
    try {
      localStorage.setItem('seal-session-restore', 'false')
      localStorage.setItem('seal-new-file-alert-folder', 'desktop')
      render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
      await userEvent.click(screen.getByRole('button', { name: '恢复默认' }))
      await userEvent.click(screen.getByRole('button', { name: '确认恢复' }))
      expect(清除).toHaveBeenCalledOnce()
      expect(localStorage.getItem('seal-session-restore')).toBe('false')
      expect(localStorage.getItem('seal-new-file-alert-folder')).toBe('desktop')
      expect((await screen.findAllByText('恢复设置失败')).length).toBeGreaterThan(0)
      expect((await screen.findAllByText(/密钥文件拒绝删除/)).length).toBeGreaterThan(0)
      expect(screen.queryByText('已恢复初始默认设置')).not.toBeInTheDocument()
    } finally {
      可用.mockRestore()
      读取.mockRestore()
      清除.mockRestore()
    }
  })

  it('提醒配置读取失败时禁用开关，防止误覆盖', async () => {
    const 原读取 = Storage.prototype.getItem
    const 读取 = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, 键: string) {
      if (键 === 'seal-new-file-alert-folder') throw new Error('提醒配置读取被拒绝')
      return 原读取.call(this, 键)
    })
    try {
      render(<SettingsProvider><AntdApp><AppProvider><SettingsPage /></AppProvider></AntdApp></SettingsProvider>)
      expect(screen.getByRole('switch', { name: '新文件接收提醒' })).toBeDisabled()
      expect(screen.getByText(/原提醒设置读取失败/)).toBeInTheDocument()
      expect((await screen.findAllByText('读取新文件提醒设置失败')).length).toBeGreaterThan(0)
    } finally {
      读取.mockRestore()
    }
  })
})
