const { EventEmitter } = require('events')
const { 注册演讲者通道 } = require('./presenterWindow')

function 创建显示器(标识, 主屏 = false, x = 0) {
  return { id: 标识, label: `显示器 ${标识}`, bounds: { x, y: 0, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1, internal: false, ...(主屏 ? { _主屏: true } : {}) }
}

function 创建环境({ 显示器列表 = [创建显示器(1, true)], 主进程窗口异常 } = {}) {
  const 屏幕事件 = new EventEmitter()
  const 屏幕 = {
    getAllDisplays: () => 显示器列表,
    getPrimaryDisplay: () => 显示器列表.find(项 => 项._主屏) ?? 显示器列表[0],
    on: (事件, 处理) => 屏幕事件.on(事件, 处理),
    removeListener: (事件, 处理) => 屏幕事件.removeListener(事件, 处理),
  }
  const 窗口列表 = []
  class 假窗口 extends EventEmitter {
    constructor(选项) {
      super()
      this.选项 = 选项
      this.边界 = { ...选项 }
      this.全屏 = false
      this.已销毁 = false
      this.webContents = Object.assign(new EventEmitter(), {
        send: vi.fn(),
        isDestroyed: () => false,
        once: (事件, 处理) => this.webContents.once(事件, 处理),
      })
      窗口列表.push(this)
    }
    isDestroyed() { return this.已销毁 }
    isFullScreen() { return this.全屏 }
    getBounds() { return { ...this.边界 } }
    setBounds(值) { this.边界 = { ...this.边界, ...值 } }
    setFullScreen(值) { this.全屏 = 值; this.emit(值 ? 'enter-full-screen' : 'leave-full-screen') }
    isMinimized() { return false }
    focus() { this.已聚焦 = true }
    close() { this.已销毁 = true; this.emit('closed') }
    loadURL(地址) { this.载入地址 = 地址; return Promise.resolve() }
    loadFile(路径, 选项) { this.载入文件 = { 路径, 选项 }; return Promise.resolve() }
  }
  const 编辑窗口 = new EventEmitter()
  编辑窗口.isDestroyed = () => false
  编辑窗口.webContents = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false })
  const 处理器 = new Map()
  const ipcMain = { handle: (名称, 处理) => 处理器.set(名称, 处理) }
  注册演讲者通道(ipcMain, {
    BrowserWindow: 假窗口,
    screen: 屏幕,
    fromWebContents: (发送者) => (发送者 === 编辑窗口.webContents ? 编辑窗口 : 窗口列表.find(项 => 项.webContents === 发送者) ?? null),
    载入演讲者窗口: (窗口, 标识) => 窗口.loadURL(`http://localhost:5172/?seal-presenter=${标识}`),
    ...(主进程窗口异常 ? { 主进程窗口异常 } : {}),
  })
  const 调用 = (名称, ...参数) => 处理器.get(名称)({ sender: 参数.shift() ?? 编辑窗口.webContents }, ...参数)
  return { 编辑窗口, 窗口列表, 屏幕事件, 显示器列表, 调用 }
}

describe('演讲者窗口生命周期', () => {
  it('缺少窗口或屏幕服务时不抛异常，调用时返回真实原因', async () => {
    const 处理器 = new Map()
    注册演讲者通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) }, {})
    const 结果 = await 处理器.get('system.presenter.open')({ sender: {} }, { 显示器: '主屏' })
    expect(结果).toMatchObject({ 成功: false, 错误: expect.stringContaining('不支持演讲者窗口') })
    expect((await 处理器.get('system.presenter.screens')()).成功).toBe(false)
  })
  it('只有一台显示器时拒绝第二屏并给出真实原因', async () => {
    const 环境 = 创建环境()
    const 结果 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    expect(结果).toMatchObject({ 成功: false, 错误: expect.stringContaining('1 台显示器') })
    expect(环境.窗口列表).toHaveLength(0)
  })

  it('单屏请求主屏时成功并明确提示会遮挡观众画面', async () => {
    const 环境 = 创建环境()
    const 结果 = await 环境.调用('system.presenter.open', undefined, { 显示器: '主屏' })
    expect(结果.成功).toBe(true)
    expect(结果.提示).toContain('同一台显示器')
    expect(环境.窗口列表).toHaveLength(1)
    expect(环境.窗口列表[0].载入地址).toContain('seal-presenter=')
  })

  it('双屏时演讲者窗口落在第二台显示器并返回显示器名称', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 结果 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    expect(结果.成功).toBe(true)
    expect(结果.显示器名称).toContain('2')
    expect(环境.窗口列表[0].边界.x).toBe(1920)
    expect(结果.提示).toBeUndefined()
  })

  it('状态只按只读快照转发给演讲者窗口，控制命令回传编辑窗口', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    const 演讲者 = 环境.窗口列表[0]
    const 状态 = { 索引: 1, 总页数: 5, 备注: '讲解要点', 暂停: false, 阶段: '等待' }
    expect(await 环境.调用('system.presenter.update', undefined, 打开.会话标识, 状态)).toEqual({ 成功: true })
    expect(演讲者.webContents.send).toHaveBeenCalledWith('system.presenterState', 状态)
    await 环境.调用('system.presenter.control', 演讲者.webContents, 打开.会话标识, '下一页')
    expect(环境.编辑窗口.webContents.send).toHaveBeenCalledWith('system.presenterControl', { 会话标识: 打开.会话标识, 动作: '下一页' })
  })

  it('演讲者窗口控制器只转发白名单动作，未知动作被拒绝', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    const 演讲者 = 环境.窗口列表[0]
    expect(await 环境.调用('system.presenter.control', 演讲者.webContents, 打开.会话标识, '删除全部页面')).toEqual({ 成功: false, 错误: expect.stringContaining('动作') })
    expect(环境.编辑窗口.webContents.send).not.toHaveBeenCalled()
  })

  it('演讲者窗口按发送者解析会话，无需自行持有会话标识', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    const 演讲者 = 环境.窗口列表[0]
    expect(await 环境.调用('system.presenter.control', 演讲者.webContents, undefined, '上一页')).toEqual({ 成功: true })
    expect(环境.编辑窗口.webContents.send).toHaveBeenCalledWith('system.presenterControl', { 会话标识: 打开.会话标识, 动作: '上一页' })
  })

  it('非演讲者窗口省略会话标识时拒绝转发，避免任意窗口驱动放映', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    expect(await 环境.调用('system.presenter.control', undefined, undefined, '下一页')).toEqual({ 成功: false, 错误: expect.stringContaining('会话标识') })
    expect(环境.编辑窗口.webContents.send).not.toHaveBeenCalled()
  })

  it('关闭演讲者窗口会通知编辑窗口并清理会话', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    环境.窗口列表[0].close()
    expect(环境.编辑窗口.webContents.send).toHaveBeenCalledWith('system.presenterClosed', { 会话标识: 打开.会话标识, 原因: expect.stringContaining('关闭') })
    expect(await 环境.调用('system.presenter.update', undefined, 打开.会话标识, { 索引: 0 })).toEqual({ 成功: false, 错误: expect.stringContaining('不存在') })
  })

  it('显示器断开时把窗口移回主屏并说明真实原因', async () => {
    const 第二屏 = 创建显示器(2, false, 1920)
    const 显示器列表 = [创建显示器(1, true), 第二屏]
    const 环境 = 创建环境({ 显示器列表 })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    显示器列表.splice(1, 1)
    环境.屏幕事件.emit('display-removed', {}, 第二屏)
    expect(环境.窗口列表[0].边界.x).toBe(0)
    expect(环境.编辑窗口.webContents.send).toHaveBeenCalledWith('system.presenterClosed', { 会话标识: 打开.会话标识, 原因: expect.stringContaining('显示器') })
  })

  it('分辨率变化时重新适配演讲者窗口并通知编辑窗口', async () => {
    const 第二屏 = 创建显示器(2, false, 1920)
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 第二屏] })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    第二屏.bounds.width = 1280; 第二屏.bounds.height = 720
    环境.屏幕事件.emit('display-metrics-changed', {}, 第二屏, ['bounds'])
    expect(环境.窗口列表[0].边界.width).toBe(1280)
    expect(环境.编辑窗口.webContents.send).toHaveBeenCalledWith('system.presenterDisplayChanged', { 会话标识: 打开.会话标识, 原因: expect.stringContaining('分辨率') })
  })

  it('已有演讲者窗口时重复打开返回同一会话并聚焦', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 甲 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    const 乙 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    expect(乙.会话标识).toBe(甲.会话标识)
    expect(环境.窗口列表).toHaveLength(1)
  })

  it('演讲者窗口可以读取最近一次只读状态，没有状态时返回空', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 打开 = await 环境.调用('system.presenter.open', undefined, { 显示器: '第二屏' })
    expect(await 环境.调用('system.presenter.state', 环境.窗口列表[0].webContents)).toEqual({ 成功: true, 状态: null, 会话标识: 打开.会话标识 })
    await 环境.调用('system.presenter.update', undefined, 打开.会话标识, { 索引: 2 })
    expect(await 环境.调用('system.presenter.state', 环境.窗口列表[0].webContents)).toMatchObject({ 状态: { 索引: 2 } })
  })

  it('显示器列表返回主屏标识与缩放，供设置界面展示真实屏幕', async () => {
    const 环境 = 创建环境({ 显示器列表: [创建显示器(1, true), 创建显示器(2, false, 1920)] })
    const 结果 = await 环境.调用('system.presenter.screens')
    expect(结果.成功).toBe(true)
    expect(结果.显示器).toHaveLength(2)
    expect(结果.显示器[0]).toMatchObject({ 主屏: true })
    expect(结果.显示器[1]).toMatchObject({ 主屏: false })
  })
})
