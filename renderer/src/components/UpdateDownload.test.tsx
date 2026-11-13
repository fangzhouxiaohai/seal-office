import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App, ConfigProvider } from 'antd'
import { SettingsProvider } from '../store/settingsStore'
import UpdateCard from './UpdateCard'
import { 桥接, type 更新操作结果 } from '../ipc/bridge'
import { 展示更新, 恢复下载状态, 重置更新状态, 自动检查间隔, 启动检查延迟 } from '../update/updateCenter'
import type { 下载进度 } from '../update/downloadState'

const 发布 = { hasUpdate: true as const, version: '2.7.3', mandatory: false, notes: '修复', url: 'https://example.test/a.exe', sha256: 'a'.repeat(64), bytes: 100 }
const 状态 = (阶段: 下载进度['阶段'], 已下载 = 0): 下载进度 => ({ 阶段, 已下载, 总大小: 100, 版本: '2.7.3', 任务标识: 'test' })
const 外壳 = ({children}: {children: React.ReactNode}) => <SettingsProvider><ConfigProvider button={{autoInsertSpace:false}}><App>{children}</App></ConfigProvider></SettingsProvider>
describe('更新下载界面', () => {
  let 推送: (状态: 下载进度) => void
  beforeEach(() => {
    重置更新状态(); localStorage.removeItem('seal-update-auto')
    推送 = () => {}
    vi.spyOn(桥接.update, '可用', 'get').mockReturnValue(true)
    vi.spyOn(桥接.update, '下载可用', 'get').mockReturnValue(true)
    vi.spyOn(桥接.update, 'info').mockResolvedValue({成功:true,版本:'2.7.2',平台:'windows'})
    vi.spyOn(桥接.update, 'check').mockResolvedValue({成功:true,数据:{hasUpdate:false}})
    vi.spyOn(桥接.update, 'status').mockResolvedValue({成功:true,数据:状态('空闲')})
    vi.spyOn(桥接.update, 'onProgress').mockImplementation(callback => { 推送 = callback; return () => {} })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); 重置更新状态() })
  it('真实下载进度可转后台，完成后需手动安装', async () => {
    let 完成!: (值: 更新操作结果<下载进度>) => void
    vi.spyOn(桥接.update, 'download').mockImplementation(() => new Promise<更新操作结果<下载进度>>(resolve => {完成=resolve}))
    vi.spyOn(桥接.update, 'installReady').mockResolvedValue({成功:true,数据:状态('安装中',100)})
    render(<外壳><UpdateCard /></外壳>); act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'立即更新'}))
    await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)))
    expect(screen.getByRole('progressbar')).toHaveValue(25)
    fireEvent.click(screen.getByRole('button',{name:'后台下载'}))
    expect(screen.getByText(/正在后台下载/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar',{name:'后台下载进度'})).toHaveAttribute('aria-valuenow','25')
    await act(async()=>{推送(状态('已就绪',100));完成({成功:true,数据:状态('已就绪',100)})})
    expect(screen.getByRole('button',{name:'更新'})).toBeInTheDocument()
    expect(桥接.update.installReady).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'更新'}))
    await waitFor(()=>expect(桥接.update.installReady).toHaveBeenCalledOnce())
  })
  it('点击取消直接调用宿主、立即收起进度且不启动安装', async () => {
    let 确认!: (值: 更新操作结果<下载进度>)=>void
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    vi.spyOn(桥接.update,'cancel').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{确认=resolve}))
    const 安装 = vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'立即更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)))
    fireEvent.click(screen.getByRole('button',{name:'取消下载'}))
    expect(桥接.update.cancel).toHaveBeenCalledOnce()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(安装).not.toHaveBeenCalled()
    await act(async()=>{确认({成功:true,数据:状态('已取消',25)})})
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(安装).not.toHaveBeenCalled()
  })
  it('取消等待中先收到下载取消错误也不会弹回更新卡片或安装', async () => {
    let 下载结束!: (值: 更新操作结果<下载进度>) => void, 取消结束!: (值: 更新操作结果<下载进度>) => void
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{下载结束=resolve}))
    vi.spyOn(桥接.update,'cancel').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{取消结束=resolve}))
    const 安装=vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'立即更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)));fireEvent.click(screen.getByRole('button',{name:'取消下载'}))
    await act(async()=>{下载结束({成功:false,错误:'下载已取消'})})
    expect(screen.queryByText('下载已取消')).toBeNull();expect(screen.queryByText('发现新版本 2.7.3')).toBeNull();expect(安装).not.toHaveBeenCalled()
    await act(async()=>{取消结束({成功:true,数据:状态('已取消',25)})})
  })
  it('取消失败时恢复进度并显示真实错误', async () => {
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    vi.spyOn(桥接.update,'cancel').mockResolvedValue({成功:false,错误:'取消操作失败'})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'立即更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)));fireEvent.click(screen.getByRole('button',{name:'取消下载'}))
    expect(await screen.findByText('取消操作失败')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveValue(25)
  })
  it('启动恢复待安装时自动安装一次并跳过启动和四小时检查', async () => {
    vi.useFakeTimers(); vi.mocked(桥接.update.status).mockResolvedValueOnce({成功:true,数据:状态('已就绪',100)}).mockResolvedValue({成功:true,数据:状态('安装中',100)})
    const 安装 = vi.spyOn(桥接.update, 'installReady').mockResolvedValue({成功:true,数据:状态('安装中',100)})
    render(<外壳><UpdateCard /></外壳>)
    await act(async()=>{await vi.advanceTimersByTimeAsync(启动检查延迟 + 自动检查间隔)})
    expect(桥接.update.check).not.toHaveBeenCalled()
    expect(安装).toHaveBeenCalledOnce()
    expect(screen.getByText('安装程序已启动')).toBeInTheDocument()
  })
  it('自动检查关闭时仍自动安装一次，系统不允许时保留手动重试并提示', async () => {
    localStorage.setItem('seal-update-auto','关闭')
    vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:状态('已就绪',100)})
    const 安装 = vi.spyOn(桥接.update,'installReady').mockResolvedValue({成功:false,错误:'请先允许安装应用'})
    render(<外壳><UpdateCard /></外壳>)
    expect(await screen.findByText('请先允许安装应用')).toBeInTheDocument()
    expect(安装).toHaveBeenCalledOnce()
    expect(screen.getByRole('button',{name:'更新'})).toBeInTheDocument()
  })
  it('未知总大小时呈现不确定进度，不能伪造百分比', async () => {
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'立即更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送({...状态('下载中',25),总大小:0}))
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
    expect(screen.queryByText(/25%/)).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'后台下载'}))
    expect(screen.getByRole('progressbar',{name:'后台下载进度'})).not.toHaveAttribute('aria-valuenow')
  })
  it('本次运行完成的下载在定时检查、恢复查询和重挂载时不自动安装', async () => {
    vi.useFakeTimers()
    let 完成!: (值: 更新操作结果<下载进度>)=>void
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{完成=resolve}))
    const 安装=vi.spyOn(桥接.update,'installReady')
    const view=render(<外壳><UpdateCard /></外壳>);await act(async()=>{});act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'立即更新'}));await act(async()=>{})
    act(()=>推送(状态('下载中',25)))
    fireEvent.click(screen.getByRole('button',{name:'后台下载'}))
    await act(async()=>{推送(状态('已就绪',100));完成({成功:true,数据:状态('已就绪',100)})})
    vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:状态('已就绪',100)})
    await act(async()=>{await 恢复下载状态();await vi.advanceTimersByTimeAsync(自动检查间隔)})
    view.unmount();render(<外壳><UpdateCard /></外壳>);await act(async()=>{})
    expect(安装).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'更新'})).toBeInTheDocument()
  })
  it('恢复状态失败时停止自动检查，提示错误而非假定未下载', async () => {
    vi.useFakeTimers();vi.mocked(桥接.update.status).mockResolvedValue({成功:false,错误:'下载状态校验失败'})
    render(<外壳><UpdateCard /></外壳>)
    await act(async()=>{await vi.advanceTimersByTimeAsync(启动检查延迟 + 10)})
    expect(桥接.update.check).not.toHaveBeenCalled()
    expect(screen.getByText('下载状态校验失败')).toBeInTheDocument()
  })
  it('上次安装启动失败时展示宿主返回的具体原因', async () => {
    vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:{...状态('失败',100),错误:'安装程序启动失败'}})
    render(<外壳><UpdateCard /></外壳>)
    expect(await screen.findByText('安装程序启动失败')).toBeInTheDocument()
  })
  it('已失败的旧任务不阻止后续自动检查', async () => {
    vi.useFakeTimers();vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:{...状态('失败',100),错误:'安装失败'}})
    render(<外壳><UpdateCard /></外壳>);await act(async()=>{await vi.advanceTimersByTimeAsync(启动检查延迟)})
    expect(桥接.update.check).toHaveBeenCalledOnce()
  })
  it('安装被系统阻止后显示具体原因并允许重新安装', async () => {
    vi.useFakeTimers();vi.mocked(桥接.update.status).mockResolvedValueOnce({成功:true,数据:状态('已就绪',100)}).mockResolvedValue({成功:true,数据:{...状态('失败',100),错误:'安装程序等待退出超时'}})
    vi.spyOn(桥接.update,'installReady').mockResolvedValue({成功:true,数据:状态('安装中',100)})
    render(<外壳><UpdateCard /></外壳>);await act(async()=>{await vi.advanceTimersByTimeAsync(10)})
    await act(async()=>{});await act(async()=>{await vi.advanceTimersByTimeAsync(10000)})
    expect(screen.getByText('安装程序等待退出超时')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'更新'})).toBeInTheDocument()
  })
})
