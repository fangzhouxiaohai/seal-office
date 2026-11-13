describe('主进程文件关联装配', () => {
  it('苹果系统在准备前接收访达文件，关闭后由访达或程序坞重新打开窗口', async () => {
    const 电子路径 = require.resolve('electron')
    const 主进程路径 = require.resolve('./main')
    const 通道路径 = require.resolve('./ipc')
    const 系统路径 = require.resolve('./ipc/systemChannel')
    require('electron')
    const 原电子 = require.cache[电子路径].exports
    const 原缓存 = [主进程路径, 通道路径, 系统路径].map(x => require.cache[x])
    const 原平台 = Object.getOwnPropertyDescriptor(process, 'platform')
    const 监听 = new Map(), 处理器 = new Map(), 窗口列表 = []
    let 准备
    class 测试窗口 {
      constructor() {
        this.已关闭 = false
        this.监听 = new Map()
        this.webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn(), send: vi.fn() }
        this.on = (名称, 处理) => this.监听.set(名称, 处理)
        this.loadFile = vi.fn()
        this.isDestroyed = () => this.已关闭
        窗口列表.push(this)
      }
      static getAllWindows() { return 窗口列表.filter(x => !x.已关闭) }
      关闭() { this.已关闭 = true; this.监听.get('closed')() }
    }
    require.cache[电子路径].exports = {
      app: { isPackaged: true, requestSingleInstanceLock: () => true, on: (名, 函数) => 监听.set(名, 函数), whenReady: () => new Promise(resolve => { 准备 = resolve }), getVersion: () => '2.7.2' },
      BrowserWindow: 测试窗口, Menu: { setApplicationMenu: vi.fn() }, dialog: { showMessageBoxSync: vi.fn() }, ipcMain: { handle: (名, 函数) => 处理器.set(名, 函数) },
    }
    require.cache[通道路径] = { id: 通道路径, filename: 通道路径, loaded: true, exports: { 注册全部通道: vi.fn() } }
    require.cache[系统路径] = { id: 系统路径, filename: 系统路径, loaded: true, exports: { 获取未保存风险数量: () => 0 } }
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    delete require.cache[主进程路径]
    try {
      require('./main')
      const 事件 = { preventDefault: vi.fn() }
      监听.get('open-file')(事件, '/Users/用户/启动.docx')
      expect(事件.preventDefault).toHaveBeenCalledOnce()
      expect(窗口列表).toHaveLength(0)
      准备()
      await vi.waitFor(() => expect(窗口列表).toHaveLength(1))
      const 领取 = 处理器.get('file.association.takePending')
      expect((await 领取({ sender: 窗口列表[0].webContents })).路径列表).toEqual(['/Users/用户/启动.docx'])
      窗口列表[0].关闭()
      监听.get('activate')()
      expect(窗口列表).toHaveLength(2)
      监听.get('activate')()
      expect(窗口列表).toHaveLength(2)
      窗口列表[1].关闭()
      监听.get('open-file')(事件, '/Users/用户/再次.pdf')
      expect(窗口列表).toHaveLength(3)
      expect((await 领取({ sender: 窗口列表[2].webContents })).路径列表).toEqual(['/Users/用户/再次.pdf'])
    } finally {
      Object.defineProperty(process, 'platform', 原平台)
      require.cache[电子路径].exports = 原电子
      ;[主进程路径, 通道路径, 系统路径].forEach((路径, 索引) => { if (原缓存[索引]) require.cache[路径] = 原缓存[索引]; else delete require.cache[路径] })
    }
  })
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

  it.each([
    ['win32', 'C:\\程序\\SealOffice.exe', 'C:\\资料\\启动.docx', 'C:\\资料\\再打开.pdf'],
    ['linux', '/opt/sealoffice/sealoffice', '/home/用户/启动.docx', '/home/用户/再打开.pdf'],
  ])('%s 初次启动与二次实例传入的路径都可由主窗口领取', async (平台, 程序, 启动文件, 再打开文件) => {
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
    const 原平台 = Object.getOwnPropertyDescriptor(process, 'platform')
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
    process.argv = [程序, 启动文件]
    Object.defineProperty(process, 'platform', { value: 平台 })
    delete require.cache[主进程路径]
    try {
      require('./main')
      await vi.waitFor(() => expect(处理器.has('file.association.takePending')).toBe(true))
      const 领取 = 处理器.get('file.association.takePending')
      expect(await 领取({ sender: 主窗口.webContents })).toEqual({ 成功: true, 路径列表: [启动文件] })
      监听器.get('second-instance')({}, [程序, 再打开文件])
      expect(主窗口.focus).toHaveBeenCalledOnce()
      expect(主窗口.webContents.send).toHaveBeenCalledWith('file.association.available')
      expect(await 领取({ sender: 主窗口.webContents })).toEqual({ 成功: true, 路径列表: [再打开文件] })
    } finally {
      process.argv = 原参数
      Object.defineProperty(process, 'platform', 原平台)
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
