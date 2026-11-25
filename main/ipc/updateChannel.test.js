const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')

describe('桌面更新 IPC', () => {
  it.each([
    ['windows', '.exe'],
    ['macos', '.dmg'],
  ])('%s 更新入口通过真实暂存服务校验并恢复下载', async (平台, 扩展名) => {
    const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-update-ipc-'))
    const 内容 = Buffer.from('海豹办公测试安装包')
    const 发布 = {
      hasUpdate: true, version: '2.7.8', url: 'https://example.com/seal-office' + 扩展名,
      bytes: 内容.length, sha256: createHash('sha256').update(内容).digest('hex'),
    }
    const 请求 = vi.fn(async () => new Response(内容))
    const 获取目录 = vi.fn(() => 目录)
    const 服务 = { 平台, 当前版本: '2.7.7', 检查: vi.fn(async () => 发布) }
    const electronPath = require.resolve('electron')
    const 原模块 = require('electron')
    const channelPath = require.resolve('./updateChannel')
    const 原通道 = require.cache[channelPath]
    require.cache[electronPath].exports = { app: { getPath: 获取目录 }, net: { fetch: 请求 } }
    delete require.cache[channelPath]
    try {
      const { 注册更新通道 } = require('./updateChannel')
      const 注册 = () => {
        const 方法 = new Map()
        注册更新通道({ handle: (名, 回调) => 方法.set(名, 回调) }, { 更新服务: 服务 })
        return 方法
      }
      const 方法 = 注册()
      const 结果 = await 方法.get('update.download')({}, 发布)
      expect(结果).toMatchObject({ 成功: true, 数据: { 阶段: '已就绪', 已下载: 内容.length } })
      expect(获取目录).toHaveBeenCalledWith('userData')
      expect(请求.mock.calls[0][0]).toBe(发布.url)
      expect(服务.检查).toHaveBeenCalledOnce()
      const 暂存目录 = path.join(目录, 'verified-updates')
      const 记录 = JSON.parse(fs.readFileSync(path.join(暂存目录, 'pending.json'), 'utf8'))
      expect(path.extname(记录.文件)).toBe(扩展名)
      expect(fs.readFileSync(path.join(暂存目录, 记录.文件))).toEqual(内容)
      expect(await 注册().get('update.status')({})).toEqual(结果)
    } finally {
      require.cache[electronPath].exports = 原模块
      if (原通道) require.cache[channelPath] = 原通道
      else delete require.cache[channelPath]
      fs.rmSync(目录, { recursive: true, force: true })
    }
  })

  it('更新操作经过暂存服务，旧安装通道不能执行桌面安装包', async () => {
    const electronPath = require.resolve('electron')
    require('electron')
    const original = require.cache[electronPath].exports
    const channelPath = require.resolve('./updateChannel')
    const cached = require.cache[channelPath]
    require.cache[electronPath].exports = { app:{}, shell:{} }
    delete require.cache[channelPath]
    try {
      const { 注册更新通道 } = require('./updateChannel')
      const handlers = new Map(), ipc = { handle:(name, fn) => handlers.set(name, fn) }
      const 服务 = { 平台:'windows', 当前版本:'2.7.2', 安装:vi.fn(), 检查:vi.fn() }
      const 暂存 = { 下载:vi.fn(async () => ({阶段:'已就绪'})), 状态:vi.fn(async () => ({阶段:'空闲'})), 取消:vi.fn(async () => ({阶段:'已取消'})), 安装:vi.fn(async () => ({阶段:'安装中'})) }
      注册更新通道(ipc, { 更新服务:服务, 暂存服务:暂存 })
      expect((await handlers.get('update.install')({}, {})).成功).toBe(false)
      expect(服务.安装).not.toHaveBeenCalled()
      for (const name of ['download','status','cancel','installReady']) expect((await handlers.get('update.'+name)({sender:{}}, {})).成功).toBe(true)
      expect(暂存.下载).toHaveBeenCalledOnce()
    } finally {
      require.cache[electronPath].exports = original
      if (cached) require.cache[channelPath] = cached; else delete require.cache[channelPath]
    }
  })
  it('商店链接必须匹配当前后台发布记录', async () => {
    const electronPath = require.resolve('electron'); require('electron')
    const original = require.cache[electronPath].exports, channelPath = require.resolve('./updateChannel'), cached = require.cache[channelPath]
    require.cache[electronPath].exports = { app:{}, shell:{} }; delete require.cache[channelPath]
    try {
      const { 注册更新通道 } = require('./updateChannel'), handlers = new Map()
      const service = { 平台:'windows-store', 检查:vi.fn(async () => ({hasUpdate:true,version:'2.7.3',url:'ms-windows-store://pdp/?productid=ok'})), 安装:vi.fn(async () => ({已打开商店:true})) }
      注册更新通道({handle:(key, fn) => handlers.set(key,fn)}, { 更新服务:service })
      expect((await handlers.get('update.install')({}, {version:'2.7.3',url:'https://attacker.test'})).成功).toBe(false)
      expect(service.安装).not.toHaveBeenCalled()
      expect((await handlers.get('update.install')({}, {version:'2.7.3',url:'ms-windows-store://pdp/?productid=ok'})).成功).toBe(true)
    } finally { require.cache[electronPath].exports = original; if (cached) require.cache[channelPath] = cached; else delete require.cache[channelPath] }
  })
  it('Linux 不在应用内下载 DEB，确认后在浏览器打开当前发布的下载地址', async () => {
    const electronPath = require.resolve('electron'); require('electron')
    const original = require.cache[electronPath].exports, channelPath = require.resolve('./updateChannel'), cached = require.cache[channelPath]
    require.cache[electronPath].exports = { app:{}, shell:{} }; delete require.cache[channelPath]
    try {
      const { 注册更新通道 } = require('./updateChannel'), handlers = new Map()
      const 发布 = { hasUpdate:true, version:'2.8.0', url:'https://seal.xingmasoft.com/releases/seal-office-2.8.0-amd64.deb' }
      const service = { 平台:'linux', 检查:vi.fn(async () => 发布), 安装:vi.fn(async () => ({已打开下载:true})) }
      const 暂存 = { 下载:vi.fn() }
      注册更新通道({handle:(key, fn) => handlers.set(key,fn)}, { 更新服务:service, 暂存服务:暂存 })
      const 下载 = await handlers.get('update.download')({sender:{}}, 发布)
      expect(下载.成功).toBe(false)
      expect(暂存.下载).not.toHaveBeenCalled()
      expect(await handlers.get('update.install')({}, 发布)).toMatchObject({ 成功:true, 数据:{ 已打开下载:true } })
      expect(service.安装).toHaveBeenCalledWith(发布)
    } finally { require.cache[electronPath].exports = original; if (cached) require.cache[channelPath] = cached; else delete require.cache[channelPath] }
  })
})
