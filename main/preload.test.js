describe('预加载桥接', () => {
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
