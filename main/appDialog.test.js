const { EventEmitter } = require('events')

function 加载弹窗(加载失败 = false) {
  const 电子路径 = require.resolve('electron')
  const 弹窗路径 = require.resolve('./appDialog')
  require('electron')
  const 原电子 = require.cache[电子路径].exports
  const 原弹窗 = require.cache[弹窗路径]
  const 通道 = new Map()
  const 窗口列表 = []
  class 测试窗口 extends EventEmitter {
    constructor(选项) {
      super()
      this.选项 = 选项
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = vi.fn()
      this.show = vi.fn()
      this.destroy = vi.fn(() => { this.已销毁 = true; this.emit('closed') })
      this.loadFile = vi.fn(() => 加载失败 ? Promise.reject(new Error('弹窗资源缺失')) : Promise.resolve())
      窗口列表.push(this)
    }
    isDestroyed() { return Boolean(this.已销毁) }
  }
  require.cache[电子路径].exports = { BrowserWindow: 测试窗口, ipcMain: { handle: (名称, 处理) => 通道.set(名称, 处理) } }
  delete require.cache[弹窗路径]
  let 显示应用确认
  try { ({ 显示应用确认 } = require('./appDialog')) }
  finally {
    require.cache[电子路径].exports = 原电子
    if (原弹窗) require.cache[弹窗路径] = 原弹窗
    else delete require.cache[弹窗路径]
  }
  const 父窗口 = new EventEmitter()
  父窗口.isDestroyed = vi.fn(() => false)
  父窗口.webContents = {}
  return { 显示应用确认, 通道, 窗口列表, 父窗口 }
}

const 选项 = { title: '确认退出', message: '尚有未保存文件', detail: '请先保存', buttons: ['取消', '退出'], defaultId: 0, cancelId: 0 }

describe('自定义应用确认弹窗', () => {
  it('使用独立无边框子窗口，只有对应弹窗可读取内容并确认', async () => {
    const { 显示应用确认, 通道, 窗口列表, 父窗口 } = 加载弹窗()
    const 结果 = 显示应用确认(父窗口, 选项)
    const 弹窗 = 窗口列表[0]
    expect(弹窗.选项).toMatchObject({ parent: 父窗口, modal: true, frame: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    expect(通道.get('appDialog.get')({ sender: 父窗口.webContents })).toBeNull()
    expect(通道.get('appDialog.choose')({ sender: 父窗口.webContents }, 1)).toEqual({ 成功: false })
    expect(通道.get('appDialog.get')({ sender: 弹窗.webContents })).toMatchObject({ 标题: '确认退出', 取消选择: 0 })
    for (const 无效 of [-1, 2, 0.5, '1', null]) expect(通道.get('appDialog.choose')({ sender: 弹窗.webContents }, 无效)).toEqual({ 成功: false })
    expect(弹窗.destroy).not.toHaveBeenCalled()
    expect(通道.get('appDialog.choose')({ sender: 弹窗.webContents }, 1)).toEqual({ 成功: true })
    await expect(结果).resolves.toBe(1)
    expect(通道.get('appDialog.get')({ sender: 弹窗.webContents })).toBeNull()
    expect(父窗口.listenerCount('closed')).toBe(0)
    expect(弹窗.destroy).toHaveBeenCalledOnce()
  })

  it.each(['closed', 'render-process-gone', '父窗口关闭'])('%s 只取消退出且清理请求', async (事件) => {
    const { 显示应用确认, 通道, 窗口列表, 父窗口 } = 加载弹窗()
    const 结果 = 显示应用确认(父窗口, 选项)
    const 弹窗 = 窗口列表[0]
    if (事件 === '父窗口关闭') 父窗口.emit('closed')
    else if (事件 === 'render-process-gone') 弹窗.webContents.emit(事件)
    else 弹窗.emit(事件)
    await expect(结果).resolves.toBe(0)
    expect(通道.get('appDialog.choose')({ sender: 弹窗.webContents }, 1)).toEqual({ 成功: false })
    expect(父窗口.listenerCount('closed')).toBe(0)
  })

  it('资源加载失败时保留主窗口', async () => {
    const 日志 = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { 显示应用确认, 父窗口 } = 加载弹窗(true)
      await expect(显示应用确认(父窗口, 选项)).resolves.toBe(0)
      expect(日志).toHaveBeenCalledWith('应用确认弹窗加载失败：', expect.any(Error))
    } finally { 日志.mockRestore() }
  })

  it('主题读取期间父窗口销毁时不创建弹窗', async () => {
    const { 显示应用确认, 窗口列表, 父窗口 } = 加载弹窗()
    let 完成读取
    父窗口.webContents.executeJavaScript = () => new Promise((完成) => { 完成读取 = 完成 })
    const 结果 = 显示应用确认(父窗口, 选项)
    父窗口.isDestroyed.mockReturnValue(true)
    完成读取({ 'bg-card': '#252a33' })
    await expect(结果).resolves.toBe(0)
    expect(窗口列表).toHaveLength(0)
  })

  it('主题读取超时后仍能取消，并阻止导航和新窗口', async () => {
    vi.useFakeTimers()
    try {
      const { 显示应用确认, 窗口列表, 父窗口, 通道 } = 加载弹窗()
      父窗口.webContents.executeJavaScript = () => new Promise(() => {})
      const 结果 = 显示应用确认(父窗口, 选项)
      await vi.advanceTimersByTimeAsync(300)
      const 弹窗 = 窗口列表[0]
      const 导航事件 = { preventDefault: vi.fn() }
      弹窗.webContents.emit('will-navigate', 导航事件)
      expect(导航事件.preventDefault).toHaveBeenCalledOnce()
      expect(弹窗.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' })
      弹窗.emit('ready-to-show')
      expect(弹窗.show).toHaveBeenCalledOnce()
      通道.get('appDialog.choose')({ sender: 弹窗.webContents }, 0)
      await expect(结果).resolves.toBe(0)
    } finally { vi.useRealTimers() }
  })
})
