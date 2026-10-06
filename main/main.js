const { app, BrowserWindow, Menu } = require('electron')
const { 显示应用确认 } = require('./appDialog')
const path = require('path')
const { pathToFileURL } = require('url')
const { 注册全部通道 } = require('./ipc')
const { 获取未保存风险数量, 查询实时关闭状态 } = require('./ipc/systemChannel')
const { 创建关联文件入口 } = require('./fileAssociation')
const { 创建文稿会话服务 } = require('./ppt/session')
const { 创建窗口管理器 } = require('./ppt/windowManager')

const DEV_SERVER_URL = 'http://localhost:5172'
const MAX_LOAD_RETRY = 30
const RETRY_INTERVAL = 500

// 单实例锁：二次启动唤起已有窗口，避免同一文档被两个实例并发打开
const 获得单实例锁 = app.requestSingleInstanceLock()
let 主窗口 = null
// 演示文稿会话：同文件多个窗口共享内容、版本与保存结果
const 演示会话 = 创建文稿会话服务()
/** webContents.id -> { 文稿标识, 视图标识 }，新窗口据此接管同一份文稿 */
const 窗口身份表 = new Map()
let 窗口管理器 = null
const 关联文件入口 = 创建关联文件入口(() => 主窗口)
if (process.platform === 'win32') 关联文件入口.加入命令行(process.argv)

function 加载开发服务(窗口, 次数) {
  窗口.loadURL(DEV_SERVER_URL).catch(() => {
    if (次数 >= MAX_LOAD_RETRY) {
      console.error(`开发服务器加载失败：已重试 ${MAX_LOAD_RETRY} 次，请确认 Vite 已在 ${DEV_SERVER_URL} 启动`)
      return
    }
    setTimeout(() => 加载开发服务(窗口, 次数 + 1), RETRY_INTERVAL)
  })
}

function 安装关闭保护(窗口) {
  let 已确认退出 = false
  let 正在核验 = false
  const 询问是否仍然退出 = async (选项) => {
    if (窗口.isDestroyed?.()) return
    const 选择 = await 显示应用确认(窗口, {
      ...选项,
      buttons: ['保留窗口', '仍然退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (选择 !== 1 || 窗口.isDestroyed?.()) return
    已确认退出 = true
    窗口.close()
  }
  窗口.on('close', (事件) => {
    if (已确认退出) return
    事件.preventDefault()
    if (正在核验) return
    正在核验 = true
    void 查询实时关闭状态(窗口).then(async (状态) => {
      if (窗口.isDestroyed?.()) return
      if (状态 === null) {
        const 已上报数量 = 获取未保存风险数量(窗口)
        return 询问是否仍然退出({
          type: 'warning',
          title: '无法确认保存状态',
          message: '关闭前未能完成文档与工作状态检查',
          detail: `${已上报数量 > 0 ? `先前记录有 ${已上报数量} 个未保存文档` : '未保存数量无法确认'}。退出后未保存内容及工作区状态可能无法恢复。请先保存文件；确需退出时手动选择“仍然退出”。`,
        })
      }
      if (!状态.备份成功) {
        return 询问是否仍然退出({
          type: 'error',
          title: '工作状态保存失败',
          message: `工作状态保存失败：${状态.备份错误 || '无法写入当前工作区备份'}`,
          detail: `当前有 ${状态.未保存数量} 个未保存文档。退出后未保存内容及工作区状态可能无法恢复。请先检查存储空间并保存文件；确需退出时手动选择“仍然退出”。`,
        })
      }
      const 数量 = 状态.未保存数量
      if (数量 === 0) {
        已确认退出 = true
        窗口.close()
        return
      }
      const 选择 = await 显示应用确认(窗口, {
        type: 'warning',
        title: '确认退出',
        message: `还有 ${数量} 个文档可能包含未保存的修改`,
        detail: '放弃修改并退出后，原文件中的内容可能丢失。请先保存文档，或确认放弃修改。',
        buttons: ['取消', '放弃修改并退出'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (选择 !== 1 || 窗口.isDestroyed?.()) return
      已确认退出 = true
      窗口.close()
    }).catch((错误) => {
      console.error('关闭前状态核验失败：', 错误)
      const 已上报数量 = 获取未保存风险数量(窗口)
      return 询问是否仍然退出({
        type: 'error',
        title: '无法确认保存状态',
        message: '关闭前检查文档状态失败',
        detail: `${已上报数量 > 0 ? `先前记录有 ${已上报数量} 个未保存文档` : '未保存数量无法确认'}。退出后未保存内容及工作区状态可能无法恢复。请检查并保存文件；确需退出时手动选择“仍然退出”。`,
      })
    }).finally(() => { 正在核验 = false })
  })
}

function 安装导航保护(窗口) {
  const 应用地址 = new URL(app.isPackaged
    ? pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
    : DEV_SERVER_URL)
  窗口.webContents.on('will-navigate', (事件, 目标地址) => {
    try {
      const 目标 = new URL(目标地址)
      if (目标.protocol === 应用地址.protocol && 目标.origin === 应用地址.origin &&
        目标.pathname === 应用地址.pathname && 目标.search === 应用地址.search) return
    } catch {
      // 无效地址与外部地址统一阻止，避免远端页面获得应用预加载桥接。
    }
    事件.preventDefault()
  })
  窗口.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

function 创建窗口(选项 = {}) {
  const 窗口 = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f0f0f0',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  if (!主窗口) 主窗口 = 窗口
  // 新窗口登记会话身份：渲染端启动后据此接管同一份文稿
  if (选项.文稿标识 && 窗口.webContents) 窗口身份表.set(窗口.webContents.id, { 文稿标识: 选项.文稿标识, 视图标识: 选项.视图标识 })
  安装关闭保护(窗口)
  安装导航保护(窗口)
  Menu.setApplicationMenu(null)
  窗口.webContents.on('before-input-event', (_事件, 输入) => {
    if (输入.type !== 'keyDown') return
    // F12 保留给 WPS 惯例的「另存为」；DevTools 仅在开发态经 F12 / Ctrl+Shift+I 打开
    const 是开发态 = !app.isPackaged
    if (是开发态 && 输入.key === 'F12') 窗口.webContents.toggleDevTools()
    if (是开发态 && 输入.key === 'I' && (输入.control || 输入.metaKey) && 输入.shift) 窗口.webContents.toggleDevTools()
  })
  if (app.isPackaged) 窗口.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else 加载开发服务(窗口, 0)
  窗口.on('closed', () => {
    清理已关闭窗口(窗口)
  })
  return 窗口
}

/**
 * 窗口关闭后的收尾：注销会话身份、更新主窗口引用与退出标志。
 * 关闭后再访问 webContents 会抛出「对象已被销毁」；在退出链路上抛异常会让进程无法结束
 * （真实成品实测：1.7.3 关闭后 2 秒退出，带该异常时进程一直驻留），因此这里必须容错。
 */
function 清理已关闭窗口(窗口) {
  let 视图编号
  try { 视图编号 = 窗口.webContents?.id } catch { 视图编号 = undefined }
  if (视图编号 !== undefined) 窗口身份表.delete(视图编号)
  const 剩余窗口 = BrowserWindow.getAllWindows().filter((项) => !项.isDestroyed?.())
  if (主窗口 === 窗口) 主窗口 = 剩余窗口[0] ?? null
  if (剩余窗口.length === 0) app.isWindowClosed = true
  return { 视图编号: 视图编号 ?? null, 剩余窗口数: 剩余窗口.length }
}

/** 会话变更广播：只发给同一文稿的其他窗口，来源窗口由会话调用方标识 */
function 广播会话变更(文稿标识, 消息, 来源视图标识) {
  for (const 窗口 of BrowserWindow.getAllWindows()) {
    if (窗口.isDestroyed?.() || 窗口.webContents?.isDestroyed?.()) continue
    const 身份 = 窗口身份表.get(窗口.webContents.id)
    if (!身份 || 身份.文稿标识 !== 文稿标识) continue
    if (来源视图标识 && 身份.视图标识 === 来源视图标识) continue
    窗口.webContents.send('system.presentationSessionChanged', { ...消息, 文稿标识 })
  }
}

/** 屏幕工作区：重排窗口只使用工作区，不覆盖任务栏 */
function 工作区尺寸() {
  const { screen } = require('electron')
  const 区域 = screen.getPrimaryDisplay().workArea
  return { x: 区域.x, y: 区域.y, 宽: 区域.width, 高: 区域.height }
}

function 建立窗口管理器() {
  if (窗口管理器) return 窗口管理器
  窗口管理器 = 创建窗口管理器({
    会话: 演示会话,
    创建浏览器窗口: 选项 => 创建窗口(选项),
    屏幕尺寸: 工作区尺寸,
    应用入口: () => (app.isPackaged ? pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href : DEV_SERVER_URL),
  })
  return 窗口管理器
}

if (!获得单实例锁) {
  app.quit()
} else {
  app.on('second-instance', (_事件, 命令行) => {
    if (process.platform === 'win32') 关联文件入口.加入命令行(命令行)
    if (主窗口 !== null) {
      if (主窗口.isMinimized()) 主窗口.restore()
      主窗口.focus()
    }
  })

  app.on('activate', () => { if (app.isWindowClosed) 创建窗口() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.whenReady().then(() => {
    const 主进程通道 = require('electron').ipcMain
    注册全部通道(主进程通道, {
      会话: 演示会话,
      广播: 广播会话变更,
      窗口管理器: 建立窗口管理器(),
      窗口身份表,
    })
    关联文件入口.注册读取通道(主进程通道)
    创建窗口()
  })
}

module.exports = { 安装关闭保护, 安装导航保护, 创建窗口, 广播会话变更, 建立窗口管理器, 清理已关闭窗口 }
