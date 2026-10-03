describe('主进程文件关联装配', () => {
  it('单实例锁失败时仅退出，不注册启动回调或创建窗口', () => {
    const 电子路径 = require.resolve('electron')
    const 主进程路径 = require.resolve('./main')
    const 通道入口路径 = require.resolve('./ipc')
    const 系统通道路径 = require.resolve('./ipc/systemChannel')
    require('electron')
    const 原电子 = require.cache[电子路径].exports
    const 原主进程 = require.cache[主进程路径]
    const 原通道入口 = require.cache[通道入口路径]
    const 原系统通道 = require.cache[系统通道路径]
    const 退出 = vi.fn()
    const 准备完成 = vi.fn(() => Promise.resolve())
    const 创建窗口 = vi.fn()
    require.cache[电子路径].exports = {
      app: { requestSingleInstanceLock: () => false, quit: 退出, on: vi.fn(), whenReady: 准备完成 },
      BrowserWindow: 创建窗口,
      Menu: { setApplicationMenu: vi.fn() },
      dialog: { showMessageBoxSync: vi.fn() },
      ipcMain: { handle: vi.fn() },
    }
    require.cache[通道入口路径] = { id: 通道入口路径, filename: 通道入口路径, loaded: true, exports: { 注册全部通道: vi.fn() } }
    require.cache[系统通道路径] = { id: 系统通道路径, filename: 系统通道路径, loaded: true, exports: { 获取未保存风险数量: () => 0 } }
    delete require.cache[主进程路径]
    try {
      require('./main')
      expect(退出).toHaveBeenCalledOnce()
      expect(准备完成).not.toHaveBeenCalled()
      expect(创建窗口).not.toHaveBeenCalled()
    } finally {
      require.cache[电子路径].exports = 原电子
      if (原主进程) require.cache[主进程路径] = 原主进程
      else delete require.cache[主进程路径]
      if (原通道入口) require.cache[通道入口路径] = 原通道入口
      else delete require.cache[通道入口路径]
      if (原系统通道) require.cache[系统通道路径] = 原系统通道
      else delete require.cache[系统通道路径]
    }
  })

  it('初次启动与二次实例传入的路径都可由主窗口领取', async () => {
    const 电子路径 = require.resolve('electron')
    const 主进程路径 = require.resolve('./main')
    const 通道入口路径 = require.resolve('./ipc')
    const 系统通道路径 = require.resolve('./ipc/systemChannel')
    require('electron')
    const 原电子 = require.cache[电子路径].exports
    const 原主进程 = require.cache[主进程路径]
    const 原通道入口 = require.cache[通道入口路径]
    const 原系统通道 = require.cache[系统通道路径]
    const 原参数 = process.argv
    const 监听器 = new Map()
    const 处理器 = new Map()
    let 主窗口

    class 测试窗口 {
      constructor() {
        this.webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn(), send: vi.fn() }
        this.on = vi.fn()
        this.loadFile = vi.fn()
        this.focus = vi.fn()
        this.isMinimized = () => false
        this.isDestroyed = () => false
        主窗口 = this
      }
    }
    require.cache[电子路径].exports = {
      app: {
        isPackaged: true,
        requestSingleInstanceLock: () => true,
        on: (名称, 处理) => 监听器.set(名称, 处理),
        whenReady: () => Promise.resolve(),
        getVersion: () => '1.6.3',
      },
      BrowserWindow: 测试窗口,
      Menu: { setApplicationMenu: vi.fn() },
      dialog: { showMessageBoxSync: vi.fn() },
      ipcMain: { handle: (名称, 处理) => 处理器.set(名称, 处理) },
    }
    require.cache[通道入口路径] = { id: 通道入口路径, filename: 通道入口路径, loaded: true, exports: { 注册全部通道: vi.fn() } }
    require.cache[系统通道路径] = { id: 系统通道路径, filename: 系统通道路径, loaded: true, exports: { 获取未保存风险数量: () => 0 } }
    process.argv = ['C:\\程序\\SealOffice.exe', 'C:\\资料\\启动.docx']
    delete require.cache[主进程路径]
    try {
      require('./main')
      await vi.waitFor(() => expect(处理器.has('file.association.takePending')).toBe(true))
      const 领取 = 处理器.get('file.association.takePending')
      expect(await 领取({ sender: 主窗口.webContents })).toEqual({ 成功: true, 路径列表: ['C:\\资料\\启动.docx'] })
      监听器.get('second-instance')({}, ['C:\\程序\\SealOffice.exe', 'C:\\资料\\再打开.pdf'])
      expect(主窗口.focus).toHaveBeenCalledOnce()
      expect(主窗口.webContents.send).toHaveBeenCalledWith('file.association.available')
      expect(await 领取({ sender: 主窗口.webContents })).toEqual({ 成功: true, 路径列表: ['C:\\资料\\再打开.pdf'] })
    } finally {
      process.argv = 原参数
      require.cache[电子路径].exports = 原电子
      if (原主进程) require.cache[主进程路径] = 原主进程
      else delete require.cache[主进程路径]
      if (原通道入口) require.cache[通道入口路径] = 原通道入口
      else delete require.cache[通道入口路径]
      if (原系统通道) require.cache[系统通道路径] = 原系统通道
      else delete require.cache[系统通道路径]
    }
  })
})
