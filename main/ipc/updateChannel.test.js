describe('桌面更新 IPC', () => {
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
})
