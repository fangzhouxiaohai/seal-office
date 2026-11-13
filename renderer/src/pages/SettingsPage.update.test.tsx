// 设置页「关于与更新」与更新卡片：开关持久化、手动检查四种结果、防连点、稍后不再弹、强制卡片、4 小时自动检查
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider, Modal } from 'antd'
import SettingsPage from './SettingsPage'
import UpdateCard, { 更新卡片宿主 } from '../components/UpdateCard'
import { AppProvider } from '../store'
import { SettingsProvider } from '../store/settingsStore'
import { 桥接 } from '../ipc/bridge'
import { 重置更新状态, 自动检查间隔, 启动检查延迟 } from '../update/updateCenter'

const 新版 = { hasUpdate: true, version: '2.7.1', mandatory: false, notes: '修复表格筛选\n新增版本检查', url: 'https://seal.xingmasoft.com/download/seal-office-setup-2.7.1.exe', sha256: 'a'.repeat(64), bytes: 10, publishedAt: new Date(2026, 10, 8).getTime() }

function 模拟桌面(平台: 'windows' | 'windows-store' | 'unsupported' = 'windows') {
  vi.spyOn(桥接.update, '可用', 'get').mockReturnValue(true)
  vi.spyOn(桥接.update, 'info').mockResolvedValue({ 成功: true, 版本: '2.7.0', 平台 })
  return vi.spyOn(桥接.update, 'check')
}

// 与应用外壳一致：按钮不在两个汉字之间自动插入空格
const 外壳 = ({ children }: { children: React.ReactNode }) => <SettingsProvider><ConfigProvider button={{ autoInsertSpace: false }}><AntdApp>{children}</AntdApp></ConfigProvider></SettingsProvider>
const 渲染设置页 = () => render(<外壳><AppProvider><SettingsPage /><更新卡片宿主 /></AppProvider></外壳>)

describe('设置页关于与更新', () => {
  beforeEach(() => {
    Modal.destroyAll()
    重置更新状态()
    vi.spyOn(桥接, 'backupLoad').mockResolvedValue({ 成功: true, 内容: null })
    localStorage.removeItem('seal-update-auto')
  })
  afterEach(() => {
    cleanup()
    Modal.destroyAll()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('显示自动检查更新开关与当前版本两行，开关默认开启并持久化', async () => {
    模拟桌面()
    渲染设置页()
    expect(screen.getByText('关于与更新')).toBeInTheDocument()
    expect(screen.getByText('当前版本')).toBeInTheDocument()
    expect(await screen.findByText('2.7.0')).toHaveClass('settings-wps-row__status')
    const 开关 = screen.getByRole('switch', { name: '自动检查更新' })
    expect(开关).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(开关)
    expect(localStorage.getItem('seal-update-auto')).toBe('关闭')
    cleanup()
    渲染设置页()
    expect(screen.getByRole('switch', { name: '自动检查更新' })).toHaveAttribute('aria-checked', 'false')
  })

  it('关闭自动检查后手动检查仍可点，有新版时弹出更新卡片', async () => {
    localStorage.setItem('seal-update-auto', '关闭')
    const 检查 = 模拟桌面().mockResolvedValue({ 成功: true, 数据: 新版 })
    渲染设置页()
    const 按钮 = screen.getByRole('button', { name: '检查更新' })
    expect(按钮).toBeEnabled()
    await userEvent.click(按钮)
    expect(检查).toHaveBeenCalledOnce()
    expect(await screen.findByRole('dialog', { name: '发现新版本 2.7.1' })).toBeInTheDocument()
    expect(screen.getByText('发布时间：2026-11-08')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即更新' })).toBeInTheDocument()
  })

  it('已是最新版本时行内如实显示版本号', async () => {
    模拟桌面().mockResolvedValue({ 成功: true, 数据: { hasUpdate: false } })
    渲染设置页()
    await userEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('已是最新版本（2.7.0）')).toHaveClass('settings-wps-row__status')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('网络失败时提示检查网络并提供重试', async () => {
    const 检查 = 模拟桌面().mockResolvedValueOnce({ 成功: false, 错误: '无法连接更新服务', 状态码: 0 }).mockResolvedValueOnce({ 成功: true, 数据: { hasUpdate: false } })
    渲染设置页()
    await userEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('检查更新失败，请检查网络后重试')).toHaveClass('settings-wps-row__status')
    expect(screen.queryByText(/已是最新/)).toBeNull()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await act(async () => { vi.advanceTimersByTime(5000) })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('已是最新版本（2.7.0）')).toBeInTheDocument()
    expect(检查).toHaveBeenCalledTimes(2)
  })

  it('商店版提示到微软商店更新', async () => {
    模拟桌面('windows-store').mockResolvedValue({ 成功: true, 数据: { hasUpdate: false } })
    渲染设置页()
    await userEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('当前为商店版本，请到微软商店更新')).toHaveClass('settings-wps-row__status')
  })

  it('旧后台未部署更新接口时说明部署故障，不误导用户检查网络或重新登录', async () => {
    模拟桌面().mockResolvedValue({ 成功: false, 错误: '登录已过期，请重新登录', 状态码: 401 })
    渲染设置页()
    await userEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('更新服务尚未部署或配置不正确，请联系管理员完成后台部署后重试')).toBeInTheDocument()
    expect(screen.queryByText('检查更新失败，请检查网络后重试')).toBeNull()
  })

  it('便携版等不支持在线更新的运行方式如实说明且不发请求', async () => {
    const 检查 = 模拟桌面('unsupported')
    渲染设置页()
    await userEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('当前运行方式不支持在线更新')).toBeInTheDocument()
    expect(检查).not.toHaveBeenCalled()
  })

  it('检查期间按钮进入加载并禁用，5 秒内连续点击不重复请求', async () => {
    let 完成: (值: { 成功: boolean; 数据: { hasUpdate: boolean } }) => void = () => {}
    const 检查 = 模拟桌面().mockImplementation(() => new Promise<{ 成功: boolean; 数据: { hasUpdate: boolean } }>(resolve => { 完成 = resolve }))
    渲染设置页()
    const 按钮 = screen.getByRole('button', { name: '检查更新' })
    fireEvent.click(按钮)
    await waitFor(() => expect(检查).toHaveBeenCalledOnce())
    expect(按钮).toBeDisabled()
    fireEvent.click(按钮)
    await act(async () => { 完成({ 成功: true, 数据: { hasUpdate: false } }) })
    expect(await screen.findByText('已是最新版本（2.7.0）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(检查).toHaveBeenCalledOnce()
  })
})

describe('更新卡片', () => {
  beforeEach(() => {
    Modal.destroyAll()
    重置更新状态()
    localStorage.removeItem('seal-update-auto')
  })
  afterEach(() => {
    cleanup()
    Modal.destroyAll()
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete document.documentElement.dataset.sealPlatform
  })

  const 渲染卡片 = () => render(<外壳><UpdateCard /></外壳>)

  it('开启时启动检查一次并每 4 小时检查一次；点稍后本次运行内不再弹', async () => {
    vi.useFakeTimers()
    const 检查 = 模拟桌面().mockResolvedValue({ 成功: true, 数据: 新版 })
    渲染卡片()
    expect(检查).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
    expect(检查).toHaveBeenCalledTimes(1)
    const 卡片 = screen.getByRole('dialog', { name: '发现新版本 2.7.1' })
    expect(卡片).toHaveClass('seal-update-card--bottom')
    fireEvent.click(screen.getByRole('button', { name: '稍后' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // 4 小时周期计时自挂载起算，与启动检查互不叠加
    await act(async () => { await vi.advanceTimersByTimeAsync(自动检查间隔 - 启动检查延迟 - 1) })
    expect(检查).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(检查).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('关闭自动检查后完全不请求', async () => {
    vi.useFakeTimers()
    localStorage.setItem('seal-update-auto', '关闭')
    const 检查 = 模拟桌面().mockResolvedValue({ 成功: true, 数据: 新版 })
    渲染卡片()
    await act(async () => { await vi.advanceTimersByTimeAsync(自动检查间隔 * 2) })
    expect(检查).not.toHaveBeenCalled()
  })

  it('自动检查失败静默，不弹错误', async () => {
    vi.useFakeTimers()
    模拟桌面().mockResolvedValue({ 成功: false, 错误: '无法连接更新服务', 状态码: 0 })
    渲染卡片()
    await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.textContent).not.toMatch(/失败/)
  })

  it('强制更新卡片没有稍后与关闭按钮，点遮罩不关闭，并说明原因', async () => {
    vi.useFakeTimers()
    模拟桌面().mockResolvedValue({ 成功: true, 数据: { ...新版, mandatory: true } })
    渲染卡片()
    await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
    const 卡片 = screen.getByRole('alertdialog', { name: '发现新版本 2.7.1' })
    expect(screen.queryByRole('button', { name: '稍后' })).toBeNull()
    expect(screen.queryByRole('button', { name: /关闭/ })).toBeNull()
    expect(screen.getAllByRole('button').map(按钮 => 按钮.textContent)).toEqual(['收起', '立即更新'])
    expect(screen.getByText(/此版本为强制更新/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('update-mask'))
    expect(卡片).toBeInTheDocument()
  })

  it('移动端卡片位于中上部从顶部落下，说明可折叠', async () => {
    vi.useFakeTimers()
    document.documentElement.dataset.sealPlatform = 'app'
    模拟桌面().mockResolvedValue({ 成功: true, 数据: 新版 })
    渲染卡片()
    await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
    expect(screen.getByRole('dialog', { name: '发现新版本 2.7.1' })).toHaveClass('seal-update-card--top')
    expect(screen.getByText(/修复表格筛选/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.queryByText(/修复表格筛选/)).toBeNull()
  })

  it('更新说明解析 Markdown 标题和列表，保留文字与标点且不执行嵌入内容', async () => {
    vi.useFakeTimers()
    document.documentElement.dataset.sealPlatform = 'app'
    const 说明 = '# 海豹办公 2.7.2\n\n## 编辑与查看\n\n- 支持 C#、3.14 与中文标点。\n- **重要**：修复问题！\n\n<script>危险脚本</script>'
    模拟桌面().mockResolvedValue({ 成功: true, 数据: { ...新版, notes: 说明 } })
    渲染卡片()
    await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
    const 内容 = screen.getByRole('dialog', { name: '发现新版本 2.7.1' }).querySelector('.seal-update-card__notes')!
    expect(内容.querySelector('h1')?.textContent).toBe('海豹办公 2.7.2')
    expect(内容.querySelector('h2')?.textContent).toBe('编辑与查看')
    expect(内容.querySelectorAll('li')).toHaveLength(2)
    expect(内容.textContent).toContain('支持 C#、3.14 与中文标点。')
    expect(内容.textContent).toContain('重要：修复问题！')
    expect(内容.textContent).not.toContain('## 编辑与查看')
    expect(内容.querySelector('script')).toBeNull()
  })

  it('英文界面下中文更新说明提示原文为中文并保留原文', async () => {
    vi.useFakeTimers()
    localStorage.setItem('seal-language', 'en-US')
    try {
      模拟桌面().mockResolvedValue({ 成功: true, 数据: 新版 })
      渲染卡片()
      await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
      expect(screen.getByText('更新说明原文为中文')).toBeInTheDocument()
      expect(screen.getByText(/修复表格筛选/)).toBeInTheDocument()
    } finally { localStorage.removeItem('seal-language') }
  })

  it('立即更新失败时如实弹出中文错误，不静默', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    模拟桌面().mockResolvedValue({ 成功: true, 数据: 新版 })
    vi.spyOn(桥接.update, 'install').mockResolvedValue({ 成功: false, 错误: '安装包校验失败：sha256 与发布记录不一致，已拒绝安装' })
    渲染卡片()
    await act(async () => { await vi.advanceTimersByTimeAsync(启动检查延迟) })
    fireEvent.click(screen.getByRole('button', { name: '立即更新' }))
    expect(await screen.findByText('安装包校验失败：sha256 与发布记录不一致，已拒绝安装')).toBeInTheDocument()
    expect(screen.getAllByText('更新失败').length).toBeGreaterThan(0)
  })
})
