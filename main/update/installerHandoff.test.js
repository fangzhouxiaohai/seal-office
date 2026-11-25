import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
const { 交接参数, 启动安装向导交接, 执行交接 } = require('./installerHandoff')

const 假进程 = (事件 = 'spawn', pid = 4321) => {
  const 进程 = new EventEmitter()
  进程.pid = pid
  进程.unref = vi.fn()
  queueMicrotask(() => 事件 === 'spawn' ? 进程.emit('spawn') : 进程.emit('error', new Error('拒绝访问')))
  return 进程
}

describe('Windows 安装向导交接', () => {
  const 安装包 = path.join(os.tmpdir(), 'package-0d8f2c3a-1111-4222-8333-944455556666.exe')

  it('交接进程参数不含 --updated 或任何静默参数', () => {
    const 参数 = 交接参数({ 安装包, 主进程号: 100, 日志文件: 'log' })
    expect(参数).toContain(安装包)
    expect(参数.join(' ')).not.toMatch(/--updated|\/S\b|--force-run|--silent/)
  })

  it('以 Electron 的 Node 模式分离启动交接进程', async () => {
    const 启动 = vi.fn(() => 假进程())
    await expect(启动安装向导交接({ 安装包, 主进程号: 100, 执行文件: 'electron.exe', 启动 })).resolves.toBe(4321)
    const [执行文件, 参数, 选项] = 启动.mock.calls[0]
    expect(执行文件).toBe('electron.exe')
    expect(参数[1]).toBe('--seal-installer-handoff')
    expect(选项).toMatchObject({ detached: true, stdio: 'ignore', env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }) })
  })

  it('交接进程启动失败时抛错，由调用方回退', async () => {
    await expect(启动安装向导交接({ 安装包, 主进程号: 100, 启动: () => 假进程('error') })).rejects.toThrow('拒绝访问')
  })

  it('拒绝非 exe 或相对路径', () => {
    expect(() => 交接参数({ 安装包: 'setup.exe', 主进程号: 1 })).toThrow('安装包路径无效')
    expect(() => 交接参数({ 安装包: path.join(os.tmpdir(), 'a.msi'), 主进程号: 1 })).toThrow('安装包路径无效')
  })

  it('等待主程序退出后才无参数启动安装程序，并写入日志', async () => {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-handoff-'))
    const 文件 = path.join(目录, 'setup.exe'), 日志 = path.join(目录, 'install-log.jsonl')
    fs.writeFileSync(文件, 'MZ')
    let 轮次 = 0
    const 存在 = vi.fn(() => ++轮次 < 3)
    const 启动 = vi.fn(() => 假进程('spawn', 999))
    await expect(执行交接({ 安装包: 文件, 主进程号: 100, 日志文件: 日志, 存在, 启动, 等待: async () => {} })).resolves.toBe(true)
    expect(存在).toHaveBeenCalledTimes(3)
    expect(启动).toHaveBeenCalledWith(文件, [], { detached: true, stdio: 'ignore' })
    const 记录 = fs.readFileSync(日志, 'utf8').trim().split('\n').map(行 => JSON.parse(行).事件)
    expect(记录).toEqual(['交接开始', '安装向导已启动'])
    fs.rmSync(目录, { recursive: true, force: true })
  })

  it('主程序迟迟不退出或安装包被删除时不启动安装程序', async () => {
    const 启动 = vi.fn()
    let 时间 = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (时间 += 1000))
    await expect(执行交接({ 安装包, 主进程号: 100, 存在: () => true, 启动, 等待: async () => {}, 上限: 5000 })).resolves.toBe(false)
    vi.restoreAllMocks()
    await expect(执行交接({ 安装包: path.join(os.tmpdir(), 'missing-seal.exe'), 主进程号: 100, 存在: () => false, 启动 })).resolves.toBe(false)
    expect(启动).not.toHaveBeenCalled()
  })
})

describe('更新通道源码守卫', () => {
  it('Windows 暂存安装不再以 --updated 启动安装程序', () => {
    const 源码 = fs.readFileSync(path.join(__dirname, '../ipc/updateChannel.js'), 'utf8')
    expect(源码).not.toMatch(/['"]--updated['"]/)
    expect(源码).toMatch(/启动安装向导交接/)
  })
})
