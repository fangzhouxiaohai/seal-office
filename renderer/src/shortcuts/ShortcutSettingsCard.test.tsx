import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import ShortcutSettingsCard from './ShortcutSettingsCard'
import { readShortcutOverrides, saveShortcutOverrides, SHORTCUT_STORAGE_KEY } from './shortcuts'

afterEach(() => { localStorage.removeItem(SHORTCUT_STORAGE_KEY); vi.restoreAllMocks() })
const show = () => render(<AntdApp><ShortcutSettingsCard /></AntdApp>)

describe('快捷键设置卡片', () => {
  it('录入组合键，修改草稿后明确应用，关闭再打开保留改绑', () => {
    const view = show()
    const bold = screen.getByRole('textbox', { name: '加粗快捷键' })
    expect(bold).toHaveValue('Ctrl+B')
    fireEvent.keyDown(bold, { key: 'b', ctrlKey: true, altKey: true })
    expect(bold).toHaveValue('Ctrl+Alt+B')
    expect(localStorage.getItem(SHORTCUT_STORAGE_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '应用快捷键' }))
    expect(readShortcutOverrides()['word:font.bold']).toEqual(['Ctrl+Alt+B'])
    view.unmount()
    show()
    expect(screen.getByRole('textbox', { name: '加粗快捷键' })).toHaveValue('Ctrl+Alt+B')
  })
  it('与已有默认键位冲突时说明占用命令，禁止应用，清除可解除冲突', () => {
    show()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '加粗快捷键' }), { key: 'i', ctrlKey: true })
    expect(screen.getByRole('button', { name: '应用快捷键' })).toBeDisabled()
    expect(screen.getByText('Ctrl+I 与「斜体」冲突')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除斜体快捷键' }))
    expect(screen.getByRole('button', { name: '应用快捷键' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '应用快捷键' }))
    expect(readShortcutOverrides()).toEqual({ 'word:font.bold': ['Ctrl+I'], 'word:font.italic': [] })
  })
  it('不将 Tab 或输入法组合确认记录为快捷键；可搜索并单项或全部恢复', () => {
    saveShortcutOverrides({ 'word:font.bold': ['Ctrl+Alt+B'] })
    show()
    const bold = screen.getByRole('textbox', { name: '加粗快捷键' })
    fireEvent.keyDown(bold, { key: 'Tab' })
    fireEvent.keyDown(bold, { key: 'b', ctrlKey: true, isComposing: true })
    expect(bold).toHaveValue('Ctrl+Alt+B')
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索快捷键' }), { target: { value: '加粗' } })
    expect(screen.queryByRole('textbox', { name: '斜体快捷键' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢复加粗默认快捷键' }))
    expect(bold).toHaveValue('Ctrl+B')
    fireEvent.click(screen.getByRole('button', { name: '恢复全部默认键位' }))
    expect(localStorage.getItem(SHORTCUT_STORAGE_KEY)).toBeNull()
  })
  it('损坏配置明确报错并禁止覆盖，恢复默认后重新启用', () => {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, '{invalid')
    show()
    expect(screen.getByText('快捷键设置读取失败')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '加粗快捷键' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '恢复全部默认键位' }))
    expect(screen.queryByText('快捷键设置读取失败')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '加粗快捷键' })).toBeEnabled()
  })
  it('存储失败保留未应用草稿且不宣告保存成功', async () => {
    show()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '加粗快捷键' }), { key: 'b', ctrlKey: true, altKey: true })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('存储空间不足') })
    fireEvent.click(screen.getByRole('button', { name: '应用快捷键' }))
    expect(await screen.findByText('存储空间不足')).toBeInTheDocument()
    expect(screen.getByText('有未应用的修改')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '应用快捷键' })).toBeEnabled()
  })
})
