import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { 桥接, type 更新操作结果 } from '../ipc/bridge'
import type { 下载进度 } from './downloadState'
import { 开始下载更新, 恢复下载状态, 重置更新状态 } from './updateCenter'

const 进度 = { 阶段:'已就绪' as const, 已下载:100, 总大小:100, 版本:'2.7.3', 任务标识:'a' }
beforeEach(() => { 重置更新状态(); vi.spyOn(桥接.update,'下载可用','get').mockReturnValue(true) })
afterEach(() => { vi.restoreAllMocks(); 重置更新状态() })

it('首次状态查询失败后，本次新下载不能被后续恢复误认成启动前待安装包', async () => {
  vi.spyOn(桥接.update,'status').mockResolvedValueOnce({成功:false,错误:'暂时不可用'}).mockResolvedValue({成功:true,数据:进度})
  vi.spyOn(桥接.update,'download').mockResolvedValue({成功:true,数据:进度})
  const 安装 = vi.spyOn(桥接.update,'installReady')
  await expect(恢复下载状态()).rejects.toThrow('暂时不可用')
  await 开始下载更新({hasUpdate:true,version:'2.7.3'})
  await 恢复下载状态()
  expect(安装).not.toHaveBeenCalled()
})
it('启动查询尚未返回时开始下载，查询失败也不能重置本次运行标记', async () => {
  let 完成!: (value: {成功: boolean; 错误: string}) => void
  vi.spyOn(桥接.update,'status').mockImplementationOnce(()=>new Promise<更新操作结果<下载进度>>(resolve=>{完成=resolve})).mockResolvedValue({成功:true,数据:进度})
  vi.spyOn(桥接.update,'download').mockResolvedValue({成功:true,数据:进度})
  const 安装 = vi.spyOn(桥接.update,'installReady')
  const 启动查询=恢复下载状态()
  await 开始下载更新({hasUpdate:true,version:'2.7.3'})
  完成({成功:false,错误:'连接中断'});await expect(启动查询).rejects.toThrow('连接中断')
  await 恢复下载状态()
  expect(安装).not.toHaveBeenCalled()
})
it('启动查询抛出异常后，尚未开启新下载时可安全重试原待安装包', async () => {
  vi.spyOn(桥接.update,'status').mockRejectedValueOnce(new Error('连接中断')).mockResolvedValue({成功:true,数据:进度})
  const 安装=vi.spyOn(桥接.update,'installReady').mockResolvedValue({成功:true,数据:{...进度,阶段:'安装中'}})
  await expect(恢复下载状态()).rejects.toThrow('连接中断')
  await 恢复下载状态()
  expect(安装).toHaveBeenCalledOnce()
})
