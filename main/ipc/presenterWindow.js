const path = require('path')
const { randomUUID } = require('crypto')

const 允许动作 = new Set(['下一页', '上一页', '暂停', '继续', '结束', '首尾'])

function 显示器标签(显示器, 主屏) {
  return `${主屏 ? '主显示器' : '扩展显示器'} ${显示器.id}（${显示器.bounds.width}×${显示器.bounds.height}）`
}

/**
 * 注册演讲者视图通道：独立只读窗口 + 显示器选择 + 插拔与分辨率变化处理。
 * 演讲者窗口只接收只读播放状态快照，控制命令统一回传编辑窗口。
 */
function 注册演讲者通道(ipcMain, {
  BrowserWindow,
  screen,
  fromWebContents,
  载入演讲者窗口,
  preload = path.join(__dirname, '..', 'preload.js'),
} = {}) {
  /** 窗口或屏幕服务缺失（例如无 Electron 环境）时保留通道，但每次调用都返回真实原因。 */
  const 环境缺失原因 = !BrowserWindow ? '当前环境不支持演讲者窗口：缺少窗口服务'
    : !screen ? '当前环境不支持演讲者窗口：缺少屏幕服务'
    : typeof 载入演讲者窗口 !== 'function' ? '当前环境不支持演讲者窗口：缺少窗口载入方式'
    : null
  const 取窗口 = fromWebContents ?? ((发送者) => BrowserWindow?.fromWebContents?.(发送者) ?? null)
  let 会话 = null

  const 显示器列表 = () => {
    const 主屏 = screen?.getPrimaryDisplay?.() ?? null
    return (screen?.getAllDisplays?.() ?? []).map((项) => ({
      标识: String(项.id),
      名称: 显示器标签(项, 项.id === 主屏?.id),
      主屏: 项.id === 主屏?.id,
      宽: 项.bounds.width,
      高: 项.bounds.height,
      缩放: 项.scaleFactor ?? 1,
      内部标识: 项.id,
    }))
  }

  const 选择显示器 = (请求) => {
    const 列表 = 显示器列表()
    const 主屏 = 列表.find((项) => 项.主屏) ?? 列表[0]
    if (请求 === '第二屏') {
      const 扩展 = 列表.find((项) => !项.主屏)
      if (!扩展) return { 错误: `本机只检测到 ${列表.length} 台显示器，没有可用的第二屏；请改用“主显示器”并在切回观众画面时注意观众会看到演讲者窗口` }
      return { 显示器: 扩展 }
    }
    if (请求 && 请求 !== '主屏') {
      const 指定 = 列表.find((项) => 项.标识 === String(请求) || 项.名称 === 请求)
      if (!指定) return { 错误: `未找到所选显示器（${String(请求)}），请重新选择` }
      return { 显示器: 指定 }
    }
    return { 显示器: 主屏 }
  }

  const 通知窗口 = (编辑窗口, 频道, 数据) => {
    if (!编辑窗口 || 编辑窗口.isDestroyed?.() || 编辑窗口.webContents?.isDestroyed?.()) return
    try { 编辑窗口.webContents.send(频道, 数据) } catch { /* 编辑窗口已销毁时忽略 */ }
  }

  const 关闭会话 = (原因) => {
    const 当前 = 会话
    if (!当前) return
    会话 = null
    if (!当前.窗口.isDestroyed?.()) {
      当前.正在关闭 = true
      当前.窗口.close()
    }
    通知窗口(当前.编辑窗口, 'system.presenterClosed', { 会话标识: 当前.会话标识, 原因 })
  }

  const 处理插拔 = () => {
    if (!会话 || !screen) return
    const 存在 = (screen.getAllDisplays?.() ?? []).some((项) => 项.id === 会话.显示器内部标识)
    if (存在) return
    const 主屏 = screen.getPrimaryDisplay()
    const 当前 = 会话
    if (!当前.窗口.isDestroyed?.()) {
      当前.窗口.setBounds({ x: 主屏.bounds.x, y: 主屏.bounds.y, width: 主屏.bounds.width, height: 主屏.bounds.height })
    }
    会话 = null
    通知窗口(当前.编辑窗口, 'system.presenterClosed', { 会话标识: 当前.会话标识, 原因: '演讲者窗口所在的显示器已断开，窗口已移回主显示器并需要重新打开演讲者视图' })
    if (!当前.窗口.isDestroyed?.()) {
      当前.正在关闭 = true
      当前.窗口.close()
    }
  }

  const 处理分辨率 = (显示器) => {
    if (!会话 || 显示器?.id !== 会话.显示器内部标识) return
    会话.窗口.setBounds({ x: 显示器.bounds.x, y: 显示器.bounds.y, width: 显示器.bounds.width, height: 显示器.bounds.height })
    通知窗口(会话.编辑窗口, 'system.presenterDisplayChanged', { 会话标识: 会话.会话标识, 原因: '演讲者显示器分辨率或缩放已变化，窗口已按新的显示区域适配' })
  }

  screen?.on?.('display-removed', (_事件, 显示器) => { void 显示器; 处理插拔() })
  screen?.on?.('display-added', () => { 处理插拔() })
  screen?.on?.('display-metrics-changed', (_事件, 显示器) => 处理分辨率(显示器))

  const 执行 = (任务) => {
    if (环境缺失原因) return { 成功: false, 错误: 环境缺失原因 }
    try { return { 成功: true, ...任务() } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '演讲者视图操作失败' } }
  }

  ipcMain.handle('system.presenter.screens', () => 执行(() => ({ 显示器: 显示器列表() })))

  ipcMain.handle('system.presenter.open', (事件, 选项 = {}) => 执行(() => {
    const 编辑窗口 = 取窗口(事件?.sender)
    if (!编辑窗口 || 编辑窗口.isDestroyed?.()) throw new Error('无法确定发起放映的编辑窗口')
    if (会话) {
      if (会话.窗口.isDestroyed?.()) throw new Error('演讲者窗口已关闭，请重新打开')
      会话.窗口.focus?.()
      return { 会话标识: 会话.会话标识, 显示器名称: 会话.显示器名称, 已有窗口: true }
    }
    const 选择 = 选择显示器(选项.显示器)
    if (选择.错误) throw new Error(选择.错误)
    const 目标显示器 = 选择.显示器
    const 原始 = screen.getAllDisplays().find((项) => 项.id === 目标显示器.内部标识) ?? screen.getPrimaryDisplay()
    const 窗口 = new BrowserWindow({
      x: 原始.bounds.x, y: 原始.bounds.y, width: 原始.bounds.width, height: 原始.bounds.height,
      minWidth: 640, minHeight: 480, title: '演讲者视图', backgroundColor: '#111418', autoHideMenuBar: true,
      webPreferences: { preload, nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    const 会话标识 = randomUUID()
    会话 = { 会话标识, 窗口, 编辑窗口, 显示器内部标识: 原始.id, 显示器名称: 目标显示器.名称, 状态: null, 正在关闭: false }
    窗口.on?.('closed', () => {
      const 当前 = 会话
      if (!当前 || 当前.窗口 !== 窗口) return
      会话 = null
      if (!当前.正在关闭) 通知窗口(当前.编辑窗口, 'system.presenterClosed', { 会话标识: 当前.会话标识, 原因: '演讲者窗口已关闭' })
    })
    if (typeof 载入演讲者窗口 === 'function') 载入演讲者窗口(窗口, 会话标识)
    else throw new Error('演讲者窗口缺少载入方式')
    return {
      会话标识,
      显示器名称: 目标显示器.名称,
      ...(显示器列表().filter((项) => !项.主屏).length === 0
        ? { 提示: '本机只有一台显示器：演讲者窗口与观众画面位于同一台显示器，切到演讲者视图时观众会看到演讲者窗口内容' }
        : {}),
    }
  }))

  ipcMain.handle('system.presenter.update', (事件, 会话标识, 状态) => 执行(() => {
    if (typeof 会话标识 !== 'string' || !会话标识) throw new Error('演讲者会话标识无效')
    if (!会话 || 会话.会话标识 !== 会话标识) throw new Error('演讲者窗口不存在或已关闭')
    if (状态 !== null && typeof 状态 !== 'object') throw new Error('演讲者状态无效')
    会话.状态 = 状态
    if (!会话.窗口.isDestroyed?.() && !会话.窗口.webContents?.isDestroyed?.()) 会话.窗口.webContents.send('system.presenterState', 状态)
    return {}
  }))

  ipcMain.handle('system.presenter.control', (事件, 会话标识, 动作) => 执行(() => {
    if (!允许动作.has(动作)) throw new Error(`不支持的演讲者控制动作：${String(动作)}`)
    const 当前 = 会话
    if (!当前) throw new Error('演讲者窗口不存在或已关闭')
    const 来自演讲者窗口 = 取窗口(事件?.sender) === 当前.窗口
    if ((会话标识 === undefined || 会话标识 === null) && !来自演讲者窗口) throw new Error('演讲者会话标识无效')
    if (会话标识 !== undefined && 会话标识 !== null && 会话标识 !== 当前.会话标识) throw new Error('演讲者窗口不存在或已关闭')
    通知窗口(当前.编辑窗口, 'system.presenterControl', { 会话标识: 当前.会话标识, 动作 })
    return {}
  }))

  ipcMain.handle('system.presenter.close', (事件, 会话标识) => 执行(() => {
    if (!会话 || (会话标识 !== undefined && 会话.会话标识 !== 会话标识)) throw new Error('演讲者窗口不存在或已关闭')
    关闭会话('演讲者视图已结束')
    return {}
  }))

  ipcMain.handle('system.presenter.state', (事件) => 执行(() => {
    const 发送者窗口 = 取窗口(事件?.sender)
    if (!会话 || (发送者窗口 && 发送者窗口 !== 会话.窗口)) throw new Error('演讲者窗口不存在或已关闭')
    return { 会话标识: 会话.会话标识, 状态: 会话.状态 }
  }))
}

module.exports = { 注册演讲者通道, 允许动作 }
