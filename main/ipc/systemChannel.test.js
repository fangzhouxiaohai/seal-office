function 加载系统通道(设置默认) {
  const 电子路径 = require.resolve('electron')
  const 通道路径 = require.resolve('./systemChannel')
  require('electron')
  const 原电子导出 = require.cache[电子路径].exports
  const 原通道缓存 = require.cache[通道路径]
  const 默认路径 = require.resolve('../windows/defaultApps')
  require(默认路径)
  const 原默认导出 = require.cache[默认路径].exports
  require.cache[默认路径].exports = { 创建默认程序服务: () => ({ 设置默认程序: 设置默认, 检查首次提示: async () => ({ 成功: true, 需要询问: false }) }) }
  require.cache[电子路径].exports = {
    app: { getVersion: () => '1.7.1', getPath: () => '测试路径', isPackaged: true },
    BrowserWindow: { fromWebContents: () => null },
    shell: { openExternal: vi.fn() },
  }
  delete require.cache[通道路径]
  try {
    const 处理器 = new Map()
    require('./systemChannel').注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    return 处理器.get('system.setDefaultApp')
  } finally {
    require.cache[电子路径].exports = 原电子导出
    require.cache[默认路径].exports = 原默认导出
    if (原通道缓存) require.cache[通道路径] = 原通道缓存
    else delete require.cache[通道路径]
  }
}

describe('Windows 文件默认应用设置', () => {
  it('调用真实默认程序服务并返回设置结果', async () => {
    const 打开 = vi.fn().mockResolvedValue({ 成功: true, 提示: '请在系统专属页面确认' })
    const 处理 = 加载系统通道(打开)
    const 结果 = await 处理()
    expect(结果).toMatchObject({ 成功: true })
    expect(打开).toHaveBeenCalledOnce()
  })

  it('系统拒绝打开时返回可展示的错误', async () => {
    const 处理 = 加载系统通道(vi.fn().mockRejectedValue(new Error('系统拒绝')))
    expect(await 处理()).toMatchObject({ 成功: false, 错误: expect.stringContaining('系统拒绝') })
  })
})
