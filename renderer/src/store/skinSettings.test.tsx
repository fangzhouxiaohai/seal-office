import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { SettingsProvider, SettingsErrorFeedback, useSettings } from './settingsStore'
import { 内置皮肤列表 } from '../styles/themes'

const 自定义皮肤 = { ...内置皮肤列表[1], id: 'user.custom', name: '自定义蓝' }

const 皮肤探针 = () => {
  const { 皮肤, 已安装皮肤, 设置皮肤, 安装皮肤, 卸载皮肤, 预览皮肤 } = useSettings()
  return <>
    <output data-testid="当前皮肤">{皮肤.id}</output>
    <output data-testid="已安装">{已安装皮肤.map(项 => 项.id).join(',')}</output>
    <button onClick={() => 设置皮肤('seal.forest')}>应用森林</button>
    <button onClick={() => 安装皮肤(自定义皮肤)}>安装自定义</button>
    <button onClick={() => 卸载皮肤('user.custom')}>卸载自定义</button>
    <button onClick={() => 预览皮肤(内置皮肤列表[3])}>预览</button>
    <button onClick={() => 预览皮肤(null)}>结束预览</button>
  </>
}
const 渲染 = () => render(<SettingsProvider><AntdApp><SettingsErrorFeedback /><皮肤探针 /></AntdApp></SettingsProvider>)
const 品牌色 = () => document.documentElement.style.getPropertyValue('--brand')

describe('皮肤设置', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

  it('默认使用海豹紫皮肤', () => {
    渲染()
    expect(screen.getByTestId('当前皮肤').textContent).toBe('seal.violet')
    expect(品牌色()).toBe('#6A5CF5')
  })

  it('应用内置皮肤后立即生效并持久化', () => {
    渲染()
    fireEvent.click(screen.getByText('应用森林'))
    expect(screen.getByTestId('当前皮肤').textContent).toBe('seal.forest')
    expect(localStorage.getItem('seal-skin')).toBe('seal.forest')
    expect(品牌色()).toBe(内置皮肤列表.find(项 => 项.id === 'seal.forest')!.light.brand)
  })

  it('安装的自定义皮肤保存到本机并可卸载，卸载当前皮肤时回到默认', () => {
    渲染()
    fireEvent.click(screen.getByText('安装自定义'))
    expect(screen.getByTestId('已安装').textContent).toBe('user.custom')
    expect(screen.getByTestId('当前皮肤').textContent).toBe('user.custom')
    expect(JSON.parse(localStorage.getItem('seal-skins-installed')!)[0].id).toBe('user.custom')
    fireEvent.click(screen.getByText('卸载自定义'))
    expect(screen.getByTestId('已安装').textContent).toBe('')
    expect(screen.getByTestId('当前皮肤').textContent).toBe('seal.violet')
  })

  it('预览只临时套用，结束后恢复当前皮肤且不写入设置', () => {
    渲染()
    fireEvent.click(screen.getByText('预览'))
    expect(品牌色()).toBe(内置皮肤列表[3].light.brand)
    expect(localStorage.getItem('seal-skin')).toBeNull()
    fireEvent.click(screen.getByText('结束预览'))
    expect(品牌色()).toBe('#6A5CF5')
  })

  it('本机皮肤记录损坏时弹出中文错误并回退默认皮肤', async () => {
    localStorage.setItem('seal-skins-installed', '[{"id":"bad"}]')
    localStorage.setItem('seal-skin', 'bad')
    渲染()
    expect(screen.getByTestId('当前皮肤').textContent).toBe('seal.violet')
    await waitFor(() => expect(document.body.textContent).toContain('已安装皮肤读取失败'))
  })
})
