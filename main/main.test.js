function 加载关闭保护(打包状态 = false, 关闭状态查询 = null) {
  const 电子路径 = require.resolve('electron')
  const 主进程路径 = require.resolve('./main')
  const 系统通道路径 = require.resolve('./ipc/systemChannel')
  require('electron')
  const 原电子导出 = require.cache[电子路径].exports
  const 原主进程缓存 = require.cache[主进程路径]
  const 原系统通道缓存 = require.cache[系统通道路径]
  const 窗口映射 = new Map()
  const 显示确认框 = vi.fn()
  require.cache[电子路径].exports = {
    app: {
      isPackaged: 打包状态,
      requestSingleInstanceLock: () => true,
      on: vi.fn(),
      whenReady: () => new Promise(() => {}),
      getVersion: () => '1.6.3',
    },
    BrowserWindow: { fromWebContents: (网页) => 窗口映射.get(网页) ?? null },
    Menu: { setApplicationMenu: vi.fn() },
    dialog: { showMessageBoxSync: 显示确认框 },
  }
  delete require.cache[主进程路径]
  delete require.cache[系统通道路径]
  if (关闭状态查询) {
    const 系统通道 = require('./ipc/systemChannel')
    require.cache[系统通道路径].exports = { ...系统通道, 查询实时关闭状态: 关闭状态查询 }
  }
  try {
    return {
      主进程: require('./main'),
      系统通道: require('./ipc/systemChannel'),
      窗口映射,
      显示确认框,
    }
  } finally {
    require.cache[电子路径].exports = 原电子导出
    if (原主进程缓存) require.cache[主进程路径] = 原主进程缓存
    else delete require.cache[主进程路径]
    if (原系统通道缓存) require.cache[系统通道路径] = 原系统通道缓存
    else delete require.cache[系统通道路径]
  }
}

function 创建测试窗口(窗口映射) {
  const 监听器 = new Map()
  const 网页 = { send: vi.fn() }
  const 窗口 = {
    webContents: 网页,
    on: (名称, 处理) => 监听器.set(名称, 处理),
    close: vi.fn(() => {
      const 第二次关闭事件 = { preventDefault: vi.fn() }
      监听器.get('close')(第二次关闭事件)
      expect(第二次关闭事件.preventDefault).not.toHaveBeenCalled()
    }),
  }
  窗口映射.set(网页, 窗口)
  return {
    窗口,
    触发关闭: () => {
      const 事件 = { preventDefault: vi.fn() }
      监听器.get('close')(事件)
      return 事件
    },
  }
}

describe('主进程窗口关闭保护', () => {
  it('工作区备份失败时即使文档均已保存也保留窗口并说明原因', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(0)

    const 事件 = 触发关闭()
    const 标识 = 窗口.webContents.send.mock.calls[0][1]
    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 标识, {
      未保存数量: 0, 备份成功: false, 备份错误: '磁盘已满',
    })).toMatchObject({ 成功: true })
    await Promise.resolve()

    expect(窗口.close).not.toHaveBeenCalled()
    expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
      title: '工作状态保存失败', message: expect.stringContaining('磁盘已满'),
      buttons: ['保留窗口', '仍然退出'], defaultId: 0, cancelId: 0,
      detail: expect.stringContaining('0 个未保存文档'),
    }))
  })

  it('备份失败且有未保存文档时仅在明确选择后退出', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(1)

    const 事件 = 触发关闭()
    const 标识 = 窗口.webContents.send.mock.calls[0][1]
    await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 标识, {
      未保存数量: 2, 备份成功: false, 备份错误: '磁盘空间不足',
    })
    await Promise.resolve()

    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
      buttons: ['保留窗口', '仍然退出'],
      detail: expect.stringContaining('2 个未保存文档'),
    }))
    expect(窗口.close).toHaveBeenCalledOnce()
  })

  it('新建后的异步上报尚未送达时先询问渲染层并阻止直接退出', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(0)

    const 事件 = 触发关闭()

    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(窗口.close).not.toHaveBeenCalled()
    expect(窗口.webContents.send).toHaveBeenCalledWith('system.requestCloseState', expect.any(String))
    const 请求标识 = 窗口.webContents.send.mock.calls[0][1]
    expect((await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 请求标识, { 未保存数量: -1, 备份成功: true })).成功).toBe(false)
    expect(显示确认框).not.toHaveBeenCalled()
    expect(await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 请求标识, { 未保存数量: 1, 备份成功: true })).toMatchObject({ 成功: true })
    await Promise.resolve()
    expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({ message: expect.stringContaining('1 个文档') }))
    expect(窗口.close).not.toHaveBeenCalled()
  })

  it('实时核验确认没有风险文档时关闭，不显示确认框', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    expect(typeof 主进程.安装关闭保护).toBe('function')
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    主进程.安装关闭保护(窗口)

    const 事件 = 触发关闭()
    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(窗口.close).not.toHaveBeenCalled()
    const 标识 = 窗口.webContents.send.mock.calls[0][1]
    await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 标识, { 未保存数量: 0, 备份成功: true })
    await Promise.resolve()

    expect(窗口.close).toHaveBeenCalledOnce()
    expect(显示确认框).not.toHaveBeenCalled()
  })

  it('存在风险文档时取消关闭并保留窗口', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    expect(typeof 主进程.安装关闭保护).toBe('function')
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    expect(处理器.has('system.reportUnsavedCount')).toBe(true)
    expect(await 处理器.get('system.reportUnsavedCount')({ sender: 窗口.webContents }, 2)).toMatchObject({ 成功: true })
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(0)

    const 事件 = 触发关闭()

    const 标识 = 窗口.webContents.send.mock.calls[0][1]
    await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 标识, { 未保存数量: 2, 备份成功: true })
    await Promise.resolve()
    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(窗口.close).not.toHaveBeenCalled()
    expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
      buttons: ['取消', '放弃修改并退出'],
      defaultId: 0,
      cancelId: 0,
    }))
    expect(显示确认框.mock.calls[0][1].message).toContain('2')
  })

  it('确认放弃修改后仅确认一次并真正关闭', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    expect(typeof 主进程.安装关闭保护).toBe('function')
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    expect(处理器.has('system.reportUnsavedCount')).toBe(true)
    await 处理器.get('system.reportUnsavedCount')({ sender: 窗口.webContents }, 1)
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(1)

    const 事件 = 触发关闭()

    const 标识 = 窗口.webContents.send.mock.calls[0][1]
    await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 标识, { 未保存数量: 1, 备份成功: true })
    await Promise.resolve()
    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(窗口.close).toHaveBeenCalledOnce()
    expect(显示确认框).toHaveBeenCalledOnce()
  })

  it('拒绝非窗口来源及无效数量的上报', async () => {
    const { 系统通道, 窗口映射 } = 加载关闭保护()
    const { 窗口 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    expect(处理器.has('system.reportUnsavedCount')).toBe(true)
    const 上报 = 处理器.get('system.reportUnsavedCount')

    expect((await 上报({ sender: {} }, 2)).成功).toBe(false)
    expect((await 上报({ sender: 窗口.webContents }, -1)).成功).toBe(false)
    expect((await 上报({ sender: 窗口.webContents }, 1.5)).成功).toBe(false)
  })

  it('主进程缓存仍显示风险但渲染层已保存时实时核验并关闭', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    const 上报 = 处理器.get('system.reportUnsavedCount')
    await 上报({ sender: 窗口.webContents }, 2)
    主进程.安装关闭保护(窗口)

    const 事件 = 触发关闭()
    const 标识 = 窗口.webContents.send.mock.calls[0][1]
    await 处理器.get('system.respondCloseState')({ sender: 窗口.webContents }, 标识, { 未保存数量: 0, 备份成功: true })
    await Promise.resolve()

    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(窗口.close).toHaveBeenCalledOnce()
    expect(显示确认框).not.toHaveBeenCalled()
  })

  it('其他窗口的上报不会改变当前窗口的关闭保护', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    const 当前 = 创建测试窗口(窗口映射)
    const 其他 = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    const 上报 = 处理器.get('system.reportUnsavedCount')
    await 上报({ sender: 当前.窗口.webContents }, 2)
    await 上报({ sender: 其他.窗口.webContents }, 0)
    主进程.安装关闭保护(当前.窗口)
    显示确认框.mockReturnValue(0)

    const 事件 = 当前.触发关闭()
    const 标识 = 当前.窗口.webContents.send.mock.calls[0][1]
    expect((await 处理器.get('system.respondCloseState')({ sender: 其他.窗口.webContents }, 标识, { 未保存数量: 0, 备份成功: true })).成功).toBe(false)
    await 处理器.get('system.respondCloseState')({ sender: 当前.窗口.webContents }, 标识, { 未保存数量: 2, 备份成功: true })
    await Promise.resolve()

    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(显示确认框).toHaveBeenCalledOnce()
  })

  it('渲染层无法响应时显示默认取消的友好警告并保留窗口', async () => {
    const { 主进程, 窗口映射, 显示确认框 } = 加载关闭保护()
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    窗口.webContents.send.mockImplementation(() => { throw new Error('渲染层不可用') })
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(0)

    const 事件 = 触发关闭()
    await Promise.resolve()

    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
      title: '无法确认保存状态', defaultId: 0, cancelId: 0,
      buttons: ['保留窗口', '仍然退出'],
      detail: expect.stringContaining('未保存数量无法确认'),
    }))
    expect(窗口.close).not.toHaveBeenCalled()
  })

  it('渲染层无法响应但已有风险上报时显示数量，人工选择后退出', async () => {
    const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护()
    const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
    const 处理器 = new Map()
    系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    await 处理器.get('system.reportUnsavedCount')({ sender: 窗口.webContents }, 3)
    窗口.webContents.send.mockImplementation(() => { throw new Error('渲染层不可用') })
    主进程.安装关闭保护(窗口)
    显示确认框.mockReturnValue(1)

    const 事件 = 触发关闭()
    await Promise.resolve()

    expect(事件.preventDefault).toHaveBeenCalledOnce()
    expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
      title: '无法确认保存状态',
      buttons: ['保留窗口', '仍然退出'],
      detail: expect.stringContaining('3 个未保存文档'),
    }))
    expect(窗口.close).toHaveBeenCalledOnce()
  })

  it('关闭状态查询抛错时同样由用户决定是否退出', async () => {
    const 日志 = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const 查询 = vi.fn().mockRejectedValue(new Error('核验通道已关闭'))
      const { 主进程, 系统通道, 窗口映射, 显示确认框 } = 加载关闭保护(false, 查询)
      const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
      const 处理器 = new Map()
      系统通道.注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
      await 处理器.get('system.reportUnsavedCount')({ sender: 窗口.webContents }, 4)
      主进程.安装关闭保护(窗口)
      显示确认框.mockReturnValue(1)

      const 事件 = 触发关闭()
      await vi.waitFor(() => expect(显示确认框).toHaveBeenCalledOnce())

      expect(事件.preventDefault).toHaveBeenCalledOnce()
      expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
        title: '无法确认保存状态',
        buttons: ['保留窗口', '仍然退出'],
        defaultId: 0,
        cancelId: 0,
        detail: expect.stringContaining('4 个未保存文档'),
      }))
      expect(窗口.close).toHaveBeenCalledOnce()
    } finally {
      日志.mockRestore()
    }
  })

  it('渲染层未回复时超时后提示风险，连续关闭不重复发起核验', async () => {
    vi.useFakeTimers()
    try {
      const { 主进程, 窗口映射, 显示确认框 } = 加载关闭保护()
      const { 窗口, 触发关闭 } = 创建测试窗口(窗口映射)
      主进程.安装关闭保护(窗口)
      显示确认框.mockReturnValue(0)

      const 首次事件 = 触发关闭()
      const 再次事件 = 触发关闭()
      expect(首次事件.preventDefault).toHaveBeenCalledOnce()
      expect(再次事件.preventDefault).toHaveBeenCalledOnce()
      expect(窗口.webContents.send).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(15000)

      expect(显示确认框).toHaveBeenCalledWith(窗口, expect.objectContaining({
        title: '无法确认保存状态', defaultId: 0, cancelId: 0,
      }))
      expect(窗口.close).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('主窗口导航保护', () => {
  function 创建导航窗口() {
    const 监听器 = new Map()
    const 网页 = {
      on: (名称, 处理) => 监听器.set(名称, 处理),
      setWindowOpenHandler: vi.fn(),
    }
    return { 窗口: { webContents: 网页 }, 监听器, 网页 }
  }

  it('开发版仅允许应用主页面自身跳转，拒绝外部链接和新窗口', () => {
    const { 主进程 } = 加载关闭保护()
    const { 窗口, 监听器, 网页 } = 创建导航窗口()
    expect(typeof 主进程.安装导航保护).toBe('function')
    主进程.安装导航保护(窗口)
    const 导航 = 监听器.get('will-navigate')
    const 外部事件 = { preventDefault: vi.fn() }
    导航(外部事件, 'https://example.com/office')
    expect(外部事件.preventDefault).toHaveBeenCalledOnce()
    const 内部事件 = { preventDefault: vi.fn() }
    导航(内部事件, 'http://localhost:5172/#help')
    expect(内部事件.preventDefault).not.toHaveBeenCalled()
    expect(网页.setWindowOpenHandler).toHaveBeenCalledOnce()
    expect(网页.setWindowOpenHandler.mock.calls[0][0]({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
  })

  it('打包版只允许自身文件地址，拒绝其他本机文件', () => {
    const { 主进程 } = 加载关闭保护(true)
    const { 窗口, 监听器 } = 创建导航窗口()
    主进程.安装导航保护(窗口)
    const 导航 = 监听器.get('will-navigate')
    const 其他文件事件 = { preventDefault: vi.fn() }
    导航(其他文件事件, 'file:///C:/Users/Public/other.html')
    expect(其他文件事件.preventDefault).toHaveBeenCalledOnce()
  })
})
