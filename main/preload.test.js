describe('预加载桥接', () => {
  it('保存文件仅在提供预期指纹时传第四个参数', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    const 调用 = vi.fn().mockResolvedValue({ 成功: true })
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: { invoke: 调用 },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      await 对外接口.saveToFile('C:\\报告.docx', '内容', '文本')
      expect(调用).toHaveBeenLastCalledWith('file.saveToFile', 'C:\\报告.docx', '内容', '文本')
      await 对外接口.saveToFile('C:\\报告.docx', '内容', '文本', '指纹')
      expect(调用).toHaveBeenLastCalledWith('file.saveToFile', 'C:\\报告.docx', '内容', '文本', '指纹')
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })

  it('关闭前核验请求可订阅并将当前文档数量回复主进程', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    let 请求处理
    const 调用 = vi.fn().mockResolvedValue({ 成功: true })
    const 移除 = vi.fn()
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: {
        invoke: 调用,
        on: (名称, 处理) => { if (名称 === 'system.requestCloseState') 请求处理 = 处理 },
        removeListener: 移除,
      },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      const 收到 = vi.fn()
      const 取消订阅 = 对外接口.onCloseStateRequested(收到)
      请求处理({}, '请求一')
      expect(收到).toHaveBeenCalledWith('请求一')
      const 状态 = { 未保存数量: 1, 备份成功: true }
      await 对外接口.respondCloseState('请求一', 状态)
      expect(调用).toHaveBeenCalledWith('system.respondCloseState', '请求一', 状态)
      取消订阅()
      expect(移除).toHaveBeenCalledWith('system.requestCloseState', 请求处理)
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })

  it('文件关联主动取队列并订阅二次唤醒通知', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    let 通知处理
    const 调用 = vi.fn().mockResolvedValue({ 成功: true, 路径列表: [] })
    const 移除 = vi.fn()
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: {
        invoke: 调用,
        on: (名称, 处理) => { if (名称 === 'file.association.available') 通知处理 = 处理 },
        removeListener: 移除,
      },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      await 对外接口.takePendingAssociatedFiles()
      expect(调用).toHaveBeenCalledWith('file.association.takePending')
      const 通知 = vi.fn()
      const 停止 = 对外接口.onAssociatedFilesAvailable(通知)
      通知处理()
      expect(通知).toHaveBeenCalledOnce()
      停止()
      expect(移除).toHaveBeenCalledWith('file.association.available', 通知处理)
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })
  it('安装目录校验通过系统通道调用', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    const 调用 = vi.fn().mockResolvedValue({ 成功: true, 完整: true })
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: { invoke: 调用 },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      await 对外接口.checkIntegrity()
      expect(调用).toHaveBeenCalledWith('system.checkIntegrity')
      await 对外接口.showOpenDialogMany('pdf')
      expect(调用).toHaveBeenCalledWith('file.showOpenDialogMany', 'pdf')
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })

  it('模型配置与对话只经主进程通道调用', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    const 调用 = vi.fn().mockResolvedValue({ 成功: true })
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: { invoke: 调用 },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      const 配置 = { 名称: '本机服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 密钥: '只在主进程保存' }
      await 对外接口.ai.saveConfig(配置)
      expect(调用).toHaveBeenCalledWith('ai.saveConfig', 配置)
      await 对外接口.ai.getConfig()
      expect(调用).toHaveBeenCalledWith('ai.getConfig')
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })

  it('暴露按路径导出 PDF 并调用主进程通道', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    const 调用 = vi.fn().mockResolvedValue({ 成功: true })
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: { invoke: 调用 },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      expect(typeof 对外接口.pdf.exportToPath).toBe('function')
      await 对外接口.pdf.exportToPath('<p>正文</p>', 'C:\\输出.pdf')
      expect(调用).toHaveBeenCalledWith('pdf.exportToPath', '<p>正文</p>', 'C:\\输出.pdf')
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })

  it('暴露磁盘文件重命名通道', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    const 调用 = vi.fn().mockResolvedValue({ 成功: true, 路径: 'C:\\新报告.docx' })
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: { invoke: 调用 },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      expect(typeof 对外接口.renameFile).toBe('function')
      await 对外接口.renameFile('C:\\原报告.docx', '新报告')
      expect(调用).toHaveBeenCalledWith('file.rename', 'C:\\原报告.docx', '新报告')
      await 对外接口.renameFile('C:\\原报告.docx', '新报告', '打开时指纹')
      expect(调用).toHaveBeenCalledWith('file.rename', 'C:\\原报告.docx', '新报告', '打开时指纹')
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })

  it('暴露未保存风险数量上报通道', async () => {
    const 电子路径 = require.resolve('electron')
    const 预加载路径 = require.resolve('./preload')
    require('electron')
    const 原电子导出 = require.cache[电子路径].exports
    const 原预加载缓存 = require.cache[预加载路径]
    let 对外接口
    const 调用 = vi.fn().mockResolvedValue({ 成功: true })
    require.cache[电子路径].exports = {
      contextBridge: { exposeInMainWorld: (_名称, 接口) => { 对外接口 = 接口 } },
      ipcRenderer: { invoke: 调用 },
    }
    delete require.cache[预加载路径]
    try {
      require('./preload')
      expect(typeof 对外接口.reportUnsavedCount).toBe('function')
      await 对外接口.reportUnsavedCount(3)
      expect(调用).toHaveBeenCalledWith('system.reportUnsavedCount', 3)
    } finally {
      require.cache[电子路径].exports = 原电子导出
      if (原预加载缓存) require.cache[预加载路径] = 原预加载缓存
      else delete require.cache[预加载路径]
    }
  })
})
