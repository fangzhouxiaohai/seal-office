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
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); 重置更新状态(); delete document.documentElement.dataset.sealPlatform })
  it('发现普通更新仅显示右下角更新入口，不显示大卡片', async () => {
    vi.spyOn(桥接.update, 'download')
    render(<外壳><UpdateCard /></外壳>); act(()=>{展示更新(发布,'自动')})
    expect(screen.getByRole('button',{name:'更新'})).toBeInTheDocument()
    expect(screen.queryByText('发现新版本 2.7.3')).toBeNull()
    expect(桥接.update.download).not.toHaveBeenCalled()
  })
  it('桌面强制更新自动下载并在完成后自动安装', async () => {
    let 完成!: (值: 更新操作结果<下载进度>) => void
    const 下载 = vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{完成=resolve}))
    const 安装 = vi.spyOn(桥接.update,'installReady').mockResolvedValue({成功:true,数据:状态('安装中',100)})
    render(<外壳><UpdateCard /></外壳>); act(()=>{展示更新({...发布,mandatory:true},'自动')})
    await waitFor(()=>expect(下载).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)))
    expect(screen.getByRole('progressbar',{name:'后台下载进度'})).toHaveAttribute('aria-valuenow','25')
    await act(async()=>{推送(状态('已就绪',100));完成({成功:true,数据:状态('已就绪',100)})})
    await waitFor(()=>expect(安装).toHaveBeenCalledOnce())
  })
  it('安卓强制更新自动打开不可关闭的下载弹窗，安装由原生宿主处理', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    let 完成!: (值: 更新操作结果<下载进度>)=>void
    const 下载=vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{完成=resolve}))
    const 安装=vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,mandatory:true},'自动')})
    await waitFor(()=>expect(下载).toHaveBeenCalledOnce())
    expect(screen.getByRole('progressbar',{name:'更新下载进度'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'取消下载'})).toBeNull()
    expect(screen.queryByRole('button',{name:'后台下载'})).toBeNull()
    await act(async()=>{推送(状态('已就绪',100));完成({成功:true,数据:状态('已就绪',100)})})
    expect(安装).not.toHaveBeenCalled()
  })
  it('鸿蒙强制更新自动打开市场，不虚构下载进度并允许重试', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'harmony'})
    const 下载 = vi.spyOn(桥接.update,'download')
    const 市场 = vi.spyOn(桥接.update,'openStore').mockResolvedValue({成功:true,数据:{已显示:true}})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,mandatory:true},'自动')})
    await waitFor(()=>expect(市场).toHaveBeenCalledOnce())
    expect(下载).not.toHaveBeenCalled()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText(/请在应用市场完成更新/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'取消下载'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'重试更新'}))
    await waitFor(()=>expect(市场).toHaveBeenCalledTimes(2))
  })
  it('强制更新下载失败后保留阻断和明确重试，不自动重复下载', async () => {
    const 下载 = vi.spyOn(桥接.update,'download').mockResolvedValue({成功:false,错误:'网络断开'})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,mandatory:true},'自动')})
    expect(await screen.findByText('网络断开')).toBeInTheDocument()
    expect(下载).toHaveBeenCalledOnce()
    expect(screen.getByRole('button',{name:'重试更新'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'取消下载'})).toBeNull()
  })
  it('安卓后台异步下载失败后显示错误，强制任务只能重试', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    const 下载=vi.spyOn(桥接.update,'download').mockResolvedValue({成功:true,数据:状态('下载中')})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,mandatory:true},'自动')})
    await waitFor(()=>expect(下载).toHaveBeenCalledOnce())
    act(()=>推送({...状态('失败',25),错误:'连接中断'}))
    expect(screen.getByText('连接中断')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'关闭'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'重试下载'}))
    await waitFor(()=>expect(下载).toHaveBeenCalledTimes(2))
  })
  it('安卓启动回执迟于失败事件时不能覆盖真实失败状态', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    let 接受!: (值: 更新操作结果<下载进度>)=>void
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{接受=resolve}))
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,mandatory:true},'自动')})
    await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送({...状态('失败',25),错误:'连接中断'}))
    await act(async()=>{接受({成功:true,数据:状态('下载中')})})
    expect(screen.getByText('连接中断')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'重试下载'})).toBeInTheDocument()
  })
  it('忽略旧任务的失败事件，不打开当前后台下载窗口', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    vi.spyOn(桥接.update,'download').mockResolvedValue({成功:true,数据:状态('下载中',25)})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button',{name:'后台下载'}))
    act(()=>推送({...状态('失败',25),任务标识:'旧任务',错误:'旧下载失败'}))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('旧下载失败')).toBeNull()
  })
  it('安卓恢复已下载任务由原生宿主启动安装，界面不重复调用', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:状态('已就绪',100)})
    const 安装=vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>)
    await waitFor(()=>expect(桥接.update.status).toHaveBeenCalled())
    await act(async()=>{})
    expect(安装).not.toHaveBeenCalled()
  })
  it('原生先推送强制已就绪再回复状态时仍显示不可关闭的安装窗口', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    let 回复!: (值: 更新操作结果<下载进度>)=>void
    vi.mocked(桥接.update.status).mockImplementation(()=>new Promise<更新操作结果<下载进度>>(resolve=>{回复=resolve}))
    const 安装=vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>)
    await waitFor(()=>expect(桥接.update.status).toHaveBeenCalledOnce())
    const 待安装={...状态('已就绪',100),强制:true,错误:'请允许安装未知应用'}
    act(()=>推送(待安装))
    await act(async()=>{回复({成功:true,数据:待安装})})
    expect(screen.getByText('请允许安装未知应用')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'重试安装'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'稍后安装'})).toBeNull()
    expect(安装).not.toHaveBeenCalled()
  })
  it('重启后恢复强制安装任务仍不可关闭且等待原生安装', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:{...状态('已就绪',100),强制:true,错误:'请允许安装未知应用'}})
    const 安装=vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>)
    expect(await screen.findByText('请允许安装未知应用')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'重试安装'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'稍后安装'})).toBeNull()
    expect(安装).not.toHaveBeenCalled()
  })
  it.each([false,true])('安卓恢复失败任务时保留错误及重试，强制=%s', async 强制 => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    vi.mocked(桥接.update.status).mockResolvedValue({成功:true,数据:{...状态('失败',25),强制,错误:'下载连接中断'}})
    vi.stubGlobal('electronAPI',{cloud:{invoke:vi.fn().mockResolvedValue({成功:true,数据:{...发布,mandatory:强制}})}})
    const 下载=vi.spyOn(桥接.update,'download').mockResolvedValue({成功:true,数据:状态('下载中')})
    render(<外壳><UpdateCard /></外壳>)
    expect(await screen.findByText('下载连接中断')).toBeInTheDocument()
    expect(Boolean(screen.queryByRole('button',{name:'关闭'}))).toBe(!强制)
    fireEvent.click(screen.getByRole('button',{name:'重试下载'}))
    await waitFor(()=>expect(下载).toHaveBeenCalledOnce())
  })
  it('安卓安装权限被拒绝时显示实际错误并提供重试，强制更新不能关闭', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    const 安装=vi.spyOn(桥接.update,'installReady').mockResolvedValue({成功:true,数据:状态('安装中',100)})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,mandatory:true},'自动')})
    await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送({...状态('已就绪',100),错误:'请允许安装未知应用'}))
    expect(screen.getByText('请允许安装未知应用')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'稍后安装'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'重试安装'}))
    await waitFor(()=>expect(安装).toHaveBeenCalledOnce())
  })
  it('下载窗口中的更新说明正确渲染 Markdown 且不执行脚本', async () => {
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    const notes = '# 海豹办公 2.7.3\n\n- 支持 C#、3.14 与中文标点。\n- **重要**：修复问题！\n\n<script>危险脚本</script>'
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新({...发布,notes},'手动')})
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByText('查看更新说明'))
    const 内容 = document.querySelector('.seal-update-card__notes')!
    expect(内容.querySelector('h1')?.textContent).toBe('海豹办公 2.7.3')
    expect(内容.querySelectorAll('li')).toHaveLength(2)
    expect(内容.textContent).toContain('支持 C#、3.14 与中文标点。')
    expect(内容.textContent).toContain('重要：修复问题！')
    expect(内容.querySelector('script')).toBeNull()
  })
  it('安卓普通更新转后台时隐藏窗口，不触发前端重复安装', async () => {
    document.documentElement.dataset.sealPlatform = 'app'
    vi.mocked(桥接.update.info).mockResolvedValue({成功:true,版本:'2.7.2',平台:'android'})
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    const 安装=vi.spyOn(桥接.update,'installReady')
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)))
    fireEvent.click(screen.getByRole('button',{name:'后台下载'}))
    expect(screen.queryByRole('progressbar')).toBeNull(); expect(安装).not.toHaveBeenCalled()
  })
  it('真实下载进度可转后台，完成后需手动安装', async () => {
    let 完成!: (值: 更新操作结果<下载进度>) => void
    vi.spyOn(桥接.update, 'download').mockImplementation(() => new Promise<更新操作结果<下载进度>>(resolve => {完成=resolve}))
    vi.spyOn(桥接.update, 'installReady').mockResolvedValue({成功:true,数据:状态('安装中',100)})
    render(<外壳><UpdateCard /></外壳>); act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'更新'}))
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
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
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
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
    act(()=>推送(状态('下载中',25)));fireEvent.click(screen.getByRole('button',{name:'取消下载'}))
    await act(async()=>{下载结束({成功:false,错误:'下载已取消'})})
    expect(screen.queryByText('下载已取消')).toBeNull();expect(screen.queryByText('发现新版本 2.7.3')).toBeNull();expect(安装).not.toHaveBeenCalled()
    await act(async()=>{取消结束({成功:true,数据:状态('已取消',25)})})
  })
  it('取消失败时恢复进度并显示真实错误', async () => {
    vi.spyOn(桥接.update,'download').mockImplementation(()=>new Promise<更新操作结果<下载进度>>(()=>{}))
    vi.spyOn(桥接.update,'cancel').mockResolvedValue({成功:false,错误:'取消操作失败'})
    render(<外壳><UpdateCard /></外壳>);act(()=>{展示更新(发布,'手动')})
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
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
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await waitFor(()=>expect(桥接.update.download).toHaveBeenCalledOnce())
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
    fireEvent.click(screen.getByRole('button',{name:'更新'}));await act(async()=>{})
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
