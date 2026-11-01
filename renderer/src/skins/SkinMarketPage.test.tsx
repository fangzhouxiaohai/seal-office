import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { SettingsProvider, SettingsErrorFeedback } from '../store/settingsStore'
import { 内置皮肤列表 } from '../styles/themes'

const 云状态 = vi.hoisted(() => ({ account: null as any, unlocked: false }))
const 云调用 = vi.hoisted(() => vi.fn())
vi.mock('../cloud/CloudProvider', () => ({
  cloudCall: 云调用,
  useCloud: () => ({ state: { account: 云状态.account, unlocked: 云状态.unlocked, statuses: {}, pending: 0 }, configure: vi.fn(), refresh: vi.fn(async () => {}) }),
}))
const 下载 = vi.hoisted(() => vi.fn())
vi.mock('../localTools/download', () => ({ 下载本地内容: 下载 }))

import SkinMarketPage from './SkinMarketPage'

const 渲染 = () => render(<SettingsProvider><AntdApp><SettingsErrorFeedback /><SkinMarketPage /></AntdApp></SettingsProvider>)
const 品牌色 = () => document.documentElement.style.getPropertyValue('--brand')
const 选择文件 = (输入: HTMLElement, 名称: string, 内容: string) => {
  const 文件 = new File([内容], 名称, { type: 'application/json' })
  Object.defineProperty(文件, 'text', { value: async () => 内容 })
  fireEvent.change(输入, { target: { files: [文件] } })
}

describe('皮肤市场', () => {
  beforeEach(() => { localStorage.clear(); 云调用.mockReset(); 下载.mockReset(); 云状态.account = null; 云状态.unlocked = false })

  it('展示 10 套内置皮肤并标记当前使用中的皮肤', () => {
    渲染()
    expect(screen.getAllByRole('article')).toHaveLength(10)
    expect(within(screen.getByRole('article', { name: '海豹紫' })).getByText('使用中')).toBeTruthy()
  })

  it('应用内置皮肤后界面主色立即变化', () => {
    渲染()
    fireEvent.click(within(screen.getByRole('article', { name: '森林绿' })).getByRole('button', { name: '应用 森林绿' }))
    expect(品牌色()).toBe(内置皮肤列表.find(项 => 项.id === 'seal.forest')!.light.brand)
    expect(within(screen.getByRole('article', { name: '森林绿' })).getByText('使用中')).toBeTruthy()
  })

  it('导入合法皮肤文件后出现在我的皮肤并立即应用', async () => {
    渲染()
    const 皮肤 = { ...内置皮肤列表[4], id: 'me.amber', name: '我的琥珀' }
    选择文件(screen.getByLabelText('导入皮肤文件'), '我的琥珀.sealskin', JSON.stringify(皮肤))
    await waitFor(() => expect(localStorage.getItem('seal-skin')).toBe('me.amber'))
    fireEvent.click(screen.getByRole('radio', { name: '我的皮肤' }))
    expect(screen.getByRole('article', { name: '我的琥珀' })).toBeTruthy()
  })

  it('导入不合法的皮肤时显示中文原因且不改变当前皮肤', async () => {
    渲染()
    选择文件(screen.getByLabelText('导入皮肤文件'), '坏.sealskin', JSON.stringify({ ...内置皮肤列表[1], id: 'me.bad', light: { ...内置皮肤列表[1].light, text: '#EEEEEE' } }))
    await waitFor(() => expect(document.body.textContent).toContain('对比度'))
    expect(localStorage.getItem('seal-skin')).toBeNull()
  })

  it('开发规则页可下载模板皮肤', () => {
    渲染()
    fireEvent.click(screen.getByRole('radio', { name: '开发规则' }))
    expect(screen.getByText(/对比度不低于 4.5:1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下载模板皮肤' }))
    expect(下载).toHaveBeenCalledWith('my-skin.sealskin', expect.stringContaining('"format": "seal-skin"'), 'application/json')
  })

  it('未开通云空间时上传公开会提示先登录开通', async () => {
    localStorage.setItem('seal-skins-installed', JSON.stringify([{ ...内置皮肤列表[2], id: 'me.green', name: '我的绿' }]))
    渲染()
    fireEvent.click(screen.getByRole('radio', { name: '我的皮肤' }))
    fireEvent.click(screen.getByRole('button', { name: '上传并申请公开 我的绿' }))
    await waitFor(() => expect(document.body.textContent).toContain('请先登录并开通云空间'))
    expect(云调用).not.toHaveBeenCalledWith('publish', expect.anything())
  })

  it('已开通云空间时保存皮肤并申请公开审核', async () => {
    云状态.account = { id: 'u1', enabled: true }; 云状态.unlocked = true
    localStorage.setItem('seal-skins-installed', JSON.stringify([{ ...内置皮肤列表[2], id: 'me.green', name: '我的绿' }]))
    云调用.mockImplementation(async (动作: string) => 动作 === 'save' ? { id: 'node-1', statuses: { 'node-1': '云端已保存' } } : 动作 === 'publish' ? { id: 'pub-1', status: 'pending' } : 动作 === 'myPublic' ? { items: [] } : 动作 === 'list' ? [] : { items: [] })
    渲染()
    fireEvent.click(screen.getByRole('radio', { name: '我的皮肤' }))
    fireEvent.click(screen.getByRole('button', { name: '上传并申请公开 我的绿' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /我是这套皮肤的作者/ }))
    fireEvent.click(screen.getByRole('button', { name: '提交审核' }))
    await waitFor(() => expect(云调用).toHaveBeenCalledWith('publish', { id: 'node-1', kind: 'skin', consent: true, category: '皮肤' }))
    const 保存参数 = 云调用.mock.calls.find(调用 => 调用[0] === 'save')![1]
    expect(保存参数.filename).toBe('我的绿.sealskin')
    expect(保存参数.cover).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(JSON.parse(decodeURIComponent(escape(atob(保存参数.data)))).id).toBe('me.green')
  })

  it('公开皮肤可安装并应用', async () => {
    const 公开皮肤 = { ...内置皮肤列表[6], id: 'pub.mint', name: '公开薄荷' }
    云调用.mockImplementation(async (动作: string) => 动作 === 'public' ? { items: [{ id: 'p1', kind: 'skin', title: '公开薄荷', cover: '', created: 1 }, { id: 'p2', kind: 'template', title: '模板' }] }
      : 动作 === 'publicDownloadData' ? { name: '公开薄荷.sealskin', data: btoa(unescape(encodeURIComponent(JSON.stringify(公开皮肤)))) } : null)
    渲染()
    fireEvent.click(screen.getByRole('radio', { name: '公开皮肤' }))
    const 卡片 = await screen.findByRole('article', { name: '公开薄荷' })
    expect(screen.queryByRole('article', { name: '模板' })).toBeNull()
    fireEvent.click(within(卡片).getByRole('button', { name: '安装并应用 公开薄荷' }))
    await waitFor(() => expect(localStorage.getItem('seal-skin')).toBe('pub.mint'))
  })
})
