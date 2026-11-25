import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { 桥接 } from '../ipc/bridge'
import { 检查更新, 执行更新, 重置更新状态, 使用暂存下载, 官网下载页 } from './updateCenter'

describe('macOS 更新通道', () => {
  const 发布 = { hasUpdate: true as const, version: '2.7.3', url: 'https://seal.xingmasoft.com/seal-office-2.7.3-macos.dmg', mandatory: false }
  beforeEach(() => {
    重置更新状态()
    vi.spyOn(桥接.update, '可用', 'get').mockReturnValue(true)
    vi.spyOn(桥接.update, 'info').mockResolvedValue({ 成功: true, 平台: 'macos', 版本: '2.7.2' })
  })
  afterEach(() => { vi.restoreAllMocks(); 重置更新状态() })

  it('通过桌面更新接口查询 macOS，不误走移动云通道', async () => {
    const 查询 = vi.spyOn(桥接.update, 'check').mockResolvedValue({ 成功: true, 数据: 发布 })
    expect(await 检查更新()).toEqual({ 类型: '有新版', 发布 })
    expect(查询).toHaveBeenCalledWith('stable')
  })

  it('打开 DMG 后显示 macOS 安装提示', async () => {
    const 安装 = vi.spyOn(桥接.update, 'install').mockResolvedValue({ 成功: true, 数据: { 已打开下载: true } })
    expect(await 执行更新(发布)).toEqual({ 成功: true, 提示: '已打开 macOS 安装包下载地址，下载完成后请打开 DMG 并按提示安装' })
    expect(安装).toHaveBeenCalledWith(发布)
  })

  it('macOS 下载入口失败时保留具体错误', async () => {
    vi.spyOn(桥接.update, 'install').mockResolvedValue({ 成功: false, 错误: 'macOS 更新地址必须指向 DMG 安装包' })
    expect(await 执行更新(发布)).toEqual({ 成功: false, 错误: 'macOS 更新地址必须指向 DMG 安装包' })
  })

  it('有更新却没有有效版本号时报告响应无效，不能假报已最新', async () => {
    const 查询 = vi.spyOn(桥接.update, 'check')
    for (const version of [undefined, '', '无效版本', 272]) {
      查询.mockResolvedValue({ 成功: true, 数据: { hasUpdate: true, version } } as never)
      expect(await 检查更新()).toEqual({ 类型: '失败', 错误: '更新服务返回的版本号无效，请稍后重试' })
    }
  })

  it('macOS 缺少下载成功结果时不能误报已启动安装', async () => {
    const 安装 = vi.spyOn(桥接.update, 'install')
    for (const 数据 of [undefined, {}, { 已启动安装: true }, { 已打开下载: false }]) {
      安装.mockResolvedValue({ 成功: true, 数据 })
      expect(await 执行更新(发布)).toEqual({ 成功: false, 错误: '更新操作未返回有效结果，请重试' })
    }
  })
})

describe('鸿蒙应用市场更新', () => {
  beforeEach(() => { 重置更新状态(); vi.spyOn(桥接.update,'可用','get').mockReturnValue(true); vi.spyOn(桥接.update,'info').mockResolvedValue({成功:true,平台:'harmony',版本:'2.7.2'}) })
  afterEach(() => { vi.restoreAllMocks(); 重置更新状态() })
  it('调用官方市场弹窗并如实说明由市场处理', async () => {
    const 打开 = vi.spyOn(桥接.update,'openStore').mockResolvedValue({成功:true,数据:{已显示:true}})
    expect(await 执行更新({hasUpdate:true,version:'2.7.3'})).toEqual({成功:true,提示:'已打开应用市场更新弹窗，请按系统提示完成更新'})
    expect(打开).toHaveBeenCalledOnce()
  })
  it('市场未显示弹窗时如实说明并回退官网下载页', async () => {
    vi.spyOn(桥接.update,'openStore').mockResolvedValue({成功:true,数据:{已显示:false}})
    const 外部 = vi.spyOn(桥接,'openExternal').mockResolvedValue({成功:true} as any)
    expect(await 执行更新({hasUpdate:true,version:'2.7.3'})).toEqual({成功:true,提示:'应用市场未显示更新弹窗，已打开官网下载页。鸿蒙版需通过华为应用市场安装更新'})
    expect(外部).toHaveBeenCalledWith(官网下载页)
  })
  it('市场与官网都打不开时返回失败，不冒称已更新', async () => {
    vi.spyOn(桥接.update,'openStore').mockResolvedValue({成功:false,错误:'华为应用市场暂未发现可更新版本，请稍后再试'})
    vi.spyOn(桥接,'openExternal').mockResolvedValue({成功:false,错误:'x'} as any)
    const 结果 = await 执行更新({hasUpdate:true,version:'2.7.3'})
    expect(结果.成功).toBe(false)
    expect((结果 as any).错误).toContain('华为应用市场暂未发现可更新版本')
  })
})

describe('暂存下载路径', () => {
  it('Linux、鸿蒙、商店版与 Web 不走应用内下载', () => {
    for (const 平台 of ['linux', 'harmony', 'windows-store', 'web', 'unsupported'] as const) expect(使用暂存下载(平台)).toBe(false)
    for (const 平台 of ['windows', 'macos', 'android'] as const) expect(使用暂存下载(平台)).toBe(true)
  })
})
