function 加载系统通道(打开系统设置) {
  const 电子路径 = require.resolve('electron')
  const 通道路径 = require.resolve('./systemChannel')
  require('electron')
  const 原电子导出 = require.cache[电子路径].exports
  const 原通道缓存 = require.cache[通道路径]
  require.cache[电子路径].exports = {
    app: { getVersion: () => '1.6.3' },
    BrowserWindow: { fromWebContents: () => null },
    shell: { openExternal: 打开系统设置 },
  }
  delete require.cache[通道路径]
  try {
    const 处理器 = new Map()
    require('./systemChannel').注册系统通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) })
    return 处理器.get('system.setDefaultApp')
  } finally {
    require.cache[电子路径].exports = 原电子导出
    if (原通道缓存) require.cache[通道路径] = 原通道缓存
    else delete require.cache[通道路径]
  }
}

describe('Windows 文件默认应用设置', () => {
  it('打开系统默认应用页面，由用户选择具体关联', async () => {
    const 打开 = vi.fn().mockResolvedValue(undefined)
    const 处理 = 加载系统通道(打开)
    const 结果 = await 处理()
    expect(结果).toMatchObject({ 成功: true })
    expect(打开).toHaveBeenCalledWith('ms-settings:defaultapps')
  })

  it('系统拒绝打开时返回可展示的错误', async () => {
    const 处理 = 加载系统通道(vi.fn().mockRejectedValue(new Error('系统拒绝')))
    expect(await 处理()).toMatchObject({ 成功: false, 错误: expect.stringContaining('系统拒绝') })
  })
})
