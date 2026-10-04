const { EventEmitter } = require('events')
const { 注册放映全屏通道 } = require('./slideshowFullscreen')

function 创建环境(初始全屏 = false) {
  const 窗口 = new EventEmitter()
  let 全屏 = 初始全屏
  窗口.isDestroyed = () => false
  窗口.isFullScreen = () => 全屏
  窗口.setFullScreen = vi.fn((值) => { 全屏 = 值; 窗口.emit(值 ? 'enter-full-screen' : 'leave-full-screen') })
  窗口.webContents = { send: vi.fn() }
  const 处理器 = new Map()
  注册放映全屏通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) }, { BrowserWindow: { fromWebContents: () => 窗口 } })
  return { 窗口, 进入: () => 处理器.get('system.enterSlideshowFullscreen')({ sender: {} }), 退出: (标识) => 处理器.get('system.exitSlideshowFullscreen')({ sender: {} }, 标识) }
}

describe('原生放映全屏生命周期', () => {
  it('进入整屏放映并在退出时恢复原窗口模式', async () => {
    const { 窗口, 进入, 退出 } = 创建环境()
    const 结果 = await 进入()
    expect(结果).toMatchObject({ 成功: true, 会话标识: expect.any(String) })
    expect(窗口.isFullScreen()).toBe(true)
    expect(await 退出(结果.会话标识)).toEqual({ 成功: true })
    expect(窗口.isFullScreen()).toBe(false)
  })

  it('原窗口已经全屏时，退出放映仍保留原全屏模式', async () => {
    const { 窗口, 进入, 退出 } = 创建环境(true)
    await 退出((await 进入()).会话标识)
    expect(窗口.isFullScreen()).toBe(true)
  })

  it('异步重挂载的旧会话退出不会关闭新会话的全屏', async () => {
    const { 窗口, 进入, 退出 } = 创建环境()
    const [旧会话, 新会话] = await Promise.all([进入(), 进入()])
    await 退出(旧会话.会话标识)
    expect(窗口.isFullScreen()).toBe(true)
    await 退出(新会话.会话标识)
    expect(窗口.isFullScreen()).toBe(false)
    expect(窗口.listenerCount('leave-full-screen')).toBe(0)
  })

  it('系统主动退出全屏时通知放映结束并清理会话', async () => {
    const { 窗口, 进入, 退出 } = 创建环境()
    const 结果 = await 进入()
    窗口.setFullScreen(false)
    expect(窗口.webContents.send).toHaveBeenCalledWith('system.slideshowEnded', 结果.会话标识)
    expect(await 退出(结果.会话标识)).toEqual({ 成功: true })
    expect(窗口.listenerCount('leave-full-screen')).toBe(0)
  })

  it('进入失败返回真实原因，不伪造全屏成功', async () => {
    const { 窗口, 进入 } = 创建环境()
    窗口.setFullScreen.mockImplementation(() => { throw new Error('窗口拒绝进入全屏') })
    expect(await 进入()).toMatchObject({ 成功: false, 错误: expect.stringContaining('窗口拒绝') })
    expect(窗口.listenerCount('leave-full-screen')).toBe(0)
  })

  it('窗口异步全屏转换结束后才确认成功', async () => {
    const { 窗口, 进入 } = 创建环境()
    const 原设置 = 窗口.setFullScreen.getMockImplementation()
    窗口.setFullScreen.mockImplementation((值) => setTimeout(() => 原设置(值), 10))
    expect(await 进入()).toMatchObject({ 成功: true })
    expect(窗口.isFullScreen()).toBe(true)
  })
})
