const { randomUUID } = require('crypto')

/** 等待原生窗口完成转换，避免把编辑区覆盖误认为系统全屏。 */
function 切换窗口全屏(窗口, 目标) {
  if (窗口.isFullScreen() === 目标) return Promise.resolve()
  return new Promise((完成, 拒绝) => {
    const 事件名 = 目标 ? 'enter-full-screen' : 'leave-full-screen'
    let 已结束 = false
    const 结束 = (错误) => {
      if (已结束) return
      已结束 = true
      clearTimeout(计时器)
      窗口.removeListener(事件名, 核验)
      窗口.removeListener('closed', 已关闭)
      if (错误) 拒绝(错误)
      else 完成()
    }
    const 核验 = () => { if (窗口.isFullScreen() === 目标) 结束() }
    const 已关闭 = () => 结束(new Error('放映窗口已关闭'))
    const 计时器 = setTimeout(() => 结束(new Error(目标 ? '系统未能进入全屏，请重试' : '系统未能恢复窗口，请重试')), 5000)
    窗口.on(事件名, 核验)
    窗口.once('closed', 已关闭)
    try { 窗口.setFullScreen(目标); 核验() }
    catch (错误) { 结束(错误) }
  })
}

function 注册放映全屏通道(ipcMain, { BrowserWindow } = require('electron')) {
  const 会话按窗口 = new WeakMap()
  const 队列按窗口 = new WeakMap()
  const 串行 = (窗口, 操作) => {
    const 任务 = (队列按窗口.get(窗口) ?? Promise.resolve()).then(操作)
    const 队尾 = 任务.catch(() => {})
    队列按窗口.set(窗口, 队尾)
    void 队尾.then(() => { if (队列按窗口.get(窗口) === 队尾) 队列按窗口.delete(窗口) })
    return 任务
  }
  const 处理 = (事件, 操作) => {
    const 窗口 = BrowserWindow.fromWebContents(事件?.sender)
    if (!窗口 || 窗口.isDestroyed()) return Promise.resolve({ 成功: false, 错误: '无法确定当前放映窗口' })
    return 串行(窗口, async () => {
      try {
        if (窗口.isDestroyed()) throw new Error('放映窗口已关闭')
        return await 操作(窗口)
      } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '系统全屏操作失败' } }
    })
  }

  ipcMain.handle('system.enterSlideshowFullscreen', (事件) => 处理(事件, async (窗口) => {
    let 会话 = 会话按窗口.get(窗口)
    if (!会话) {
      const 原全屏 = 窗口.isFullScreen()
      await 切换窗口全屏(窗口, true)
      会话 = { 原全屏, 标识列表: new Set(), 清理: null, 正在恢复: false }
      const 系统退出 = () => {
        if (会话.正在恢复) return
        会话.清理()
        for (const 标识 of 会话.标识列表) {
          if (!窗口.webContents.isDestroyed?.()) 窗口.webContents.send('system.slideshowEnded', 标识)
        }
      }
      会话.清理 = () => {
        窗口.removeListener('leave-full-screen', 系统退出)
        窗口.removeListener('closed', 会话.清理)
        会话按窗口.delete(窗口)
      }
      窗口.on('leave-full-screen', 系统退出)
      窗口.once('closed', 会话.清理)
      会话按窗口.set(窗口, 会话)
    }
    const 会话标识 = randomUUID()
    会话.标识列表.add(会话标识)
    return { 成功: true, 会话标识 }
  }))

  ipcMain.handle('system.exitSlideshowFullscreen', (事件, 标识) => 处理(事件, async (窗口) => {
    if (typeof 标识 !== 'string' || !标识) throw new Error('放映会话标识无效')
    const 会话 = 会话按窗口.get(窗口)
    if (!会话?.标识列表.has(标识)) return { 成功: true }
    if (会话.标识列表.size > 1) { 会话.标识列表.delete(标识); return { 成功: true } }
    会话.正在恢复 = true
    try { await 切换窗口全屏(窗口, 会话.原全屏); 会话.清理() }
    finally { 会话.正在恢复 = false }
    return { 成功: true }
  }))
}

module.exports = { 注册放映全屏通道 }
