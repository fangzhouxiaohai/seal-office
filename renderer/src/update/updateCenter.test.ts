import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { 桥接 } from '../ipc/bridge'
import { 检查更新, 执行更新, 重置更新状态 } from './updateCenter'

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
