const { BrowserWindow, ipcMain } = require('electron')
const path = require('path')

const 弹窗请求 = new Map()
/** 弹窗窗口尺寸：宽度固定，高度按内容适配后回调校对 */
const 弹窗宽度 = 432
const 弹窗最小高度 = 148
const 弹窗最大高度 = 560
let 已注册 = false

function 注册弹窗通道() {
  if (已注册) return
  已注册 = true
  ipcMain.handle('appDialog.get', (事件) => 弹窗请求.get(事件.sender)?.内容 ?? null)
  ipcMain.handle('appDialog.choose', (事件, 选择) => {
    const 请求 = 弹窗请求.get(事件.sender)
    if (!请求 || !Number.isInteger(选择) || 选择 < 0 || 选择 >= 请求.内容.按钮.length) return { 成功: false }
    请求.完成(选择)
    return { 成功: true }
  })
  // 内容高度由渲染端实测，避免为长短不一的内容固定一个大窗口
  ipcMain.handle('appDialog.fit', (事件, 高度) => {
    const 请求 = 弹窗请求.get(事件.sender)
    if (!请求) return { 成功: false }
    if (!Number.isFinite(高度)) return { 成功: false, 错误: '弹窗高度无效' }
    const 目标 = Math.round(Math.min(弹窗最大高度, Math.max(弹窗最小高度, 高度)))
    const 弹窗 = 请求.窗口
    if (!弹窗 || 弹窗.isDestroyed?.()) return { 成功: false }
    try { 弹窗.setContentSize(弹窗宽度, 目标) } catch { return { 成功: false } }
    return { 成功: true, 高度: 目标 }
  })
}

/** 独立的应用弹窗在主编辑页无法响应时也能提供明确的退出选择。 */
async function 显示应用确认(父窗口, 选项) {
  注册弹窗通道()
  if (父窗口.isDestroyed?.()) return 选项.cancelId ?? 0
  const 按钮 = 选项.buttons
  if (!Array.isArray(按钮) || 按钮.length < 1 || 按钮.some((项) => typeof 项 !== 'string')) throw new Error('弹窗按钮配置无效')
  const 颜色 = {}
  try {
    const 读取 = 父窗口.webContents.executeJavaScript?.(`(() => {
      const 样式 = getComputedStyle(document.documentElement);
      return Object.fromEntries(['brand','brand-hover','bg-card','bg-hover','border','text-1','text-2','danger'].map(名 => [名, 样式.getPropertyValue('--' + 名).trim()]));
    })()`)
    if (读取) {
      let 超时
      try { Object.assign(颜色, await Promise.race([读取, new Promise((完成) => { 超时 = setTimeout(() => 完成({}), 300) })])) }
      finally { clearTimeout(超时) }
    }
  } catch { /* 编辑页无法读取主题时使用弹窗自身的基础主题。 */ }
  if (父窗口.isDestroyed?.()) return 选项.cancelId ?? 0
  return new Promise((完成) => {
    const 弹窗 = new BrowserWindow({
      parent: 父窗口, modal: true, show: false, frame: false, resizable: false,
      width: 弹窗宽度, height: 232, minimizable: false, maximizable: false, skipTaskbar: true,
      backgroundColor: 颜色['bg-card'] || '#FFFFFF',
      webPreferences: { preload: path.join(__dirname, 'ui/dialogPreload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    let 已完成 = false
    const 取消 = Number.isInteger(选项.cancelId) ? 选项.cancelId : 0
    const 完成选择 = (选择) => {
      if (已完成) return
      已完成 = true
      弹窗请求.delete(弹窗.webContents)
      父窗口.removeListener?.('closed', 父窗口关闭)
      if (!弹窗.isDestroyed()) 弹窗.destroy()
      完成(选择)
    }
    const 父窗口关闭 = () => 完成选择(取消)
    父窗口.once?.('closed', 父窗口关闭)
    弹窗请求.set(弹窗.webContents, { 完成: 完成选择, 窗口: 弹窗, 内容: {
      标题: 选项.title, 原因: 选项.message, 说明: 选项.detail || '', 按钮,
      按钮样式: Array.isArray(选项.按钮样式) ? 选项.按钮样式 : [],
      默认选择: Number.isInteger(选项.defaultId) ? 选项.defaultId : 0, 取消选择: 取消, 颜色,
    } })
    弹窗.on('closed', () => 完成选择(取消))
    弹窗.webContents.on('render-process-gone', () => 完成选择(取消))
    弹窗.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    弹窗.webContents.on('will-navigate', (事件) => 事件.preventDefault())
    弹窗.once('ready-to-show', () => { if (!弹窗.isDestroyed()) 弹窗.show() })
    弹窗.loadFile(path.join(__dirname, 'ui/dialog.html')).catch((错误) => {
      console.error('应用确认弹窗加载失败：', 错误)
      完成选择(取消)
    })
  })
}

module.exports = { 显示应用确认 }
