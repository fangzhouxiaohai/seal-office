const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { randomUUID } = require('crypto')
const { 检查安装目录 } = require('../integrity')

const 未保存风险数量 = new WeakMap()
const 关闭核验请求 = new WeakMap()

function 获取未保存风险数量(窗口) {
  return 未保存风险数量.get(窗口) ?? 0
}

function 查询实时关闭状态(窗口, 超时毫秒 = 15000) {
  return new Promise((完成) => {
    if (!窗口 || 窗口.isDestroyed?.() || 窗口.webContents?.isDestroyed?.()) {
      完成(null)
      return
    }
    const 标识 = randomUUID()
    let 已结束 = false
    const 结束 = (状态) => {
      if (已结束) return
      已结束 = true
      clearTimeout(计时器)
      关闭核验请求.delete(窗口)
      完成(状态)
    }
    const 计时器 = setTimeout(() => 结束(null), 超时毫秒)
    关闭核验请求.set(窗口, { 标识, 结束 })
    try {
      窗口.webContents.send('system.requestCloseState', 标识)
    } catch {
      结束(null)
    }
  })
}

function 注册系统通道(ipcMain) {
  require('./slideshowFullscreen').注册放映全屏通道(ipcMain)
  ipcMain.handle('system.reportUnsavedCount', async (事件, 数量) => {
    if (!Number.isSafeInteger(数量) || 数量 < 0) {
      return { 成功: false, 错误: '未保存文档数量无效' }
    }
    const 窗口 = BrowserWindow.fromWebContents(事件?.sender)
    if (!窗口 || 窗口.isDestroyed?.()) {
      return { 成功: false, 错误: '无法确定当前窗口' }
    }
    未保存风险数量.set(窗口, 数量)
    return { 成功: true }
  })
  ipcMain.handle('system.respondCloseState', async (事件, 标识, 状态) => {
    if (typeof 标识 !== 'string' || typeof 状态 !== 'object' || 状态 === null ||
        !Number.isSafeInteger(状态.未保存数量) || 状态.未保存数量 < 0 ||
        typeof 状态.备份成功 !== 'boolean' ||
        (状态.备份错误 !== undefined && typeof 状态.备份错误 !== 'string')) {
      return { 成功: false, 错误: '关闭前文档状态无效' }
    }
    const 窗口 = BrowserWindow.fromWebContents(事件?.sender)
    const 请求 = 窗口 && 关闭核验请求.get(窗口)
    if (!请求 || 请求.标识 !== 标识) return { 成功: false, 错误: '关闭核验请求已失效' }
    请求.结束(状态)
    return { 成功: true }
  })
  ipcMain.handle('system.setDefaultApp', async () => {
    if (process.platform !== 'win32') return { 成功: false, 错误: '文件默认应用设置仅支持 Windows' }
    try {
      await shell.openExternal('ms-settings:defaultapps')
      return { 成功: true, 提示: '已打开系统默认应用设置，请按文件类型选择海豹办公' }
    } catch (错误) {
      return { 成功: false, 错误: `无法打开系统默认应用设置：${错误 instanceof Error ? 错误.message : '系统拒绝打开设置'}` }
    }
  })
  ipcMain.handle('system.checkIntegrity', async () => {
    try {
      return { 成功: true, ...检查安装目录(path.join(__dirname, '..', '..')) }
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法检查安装目录' }
    }
  })
  ipcMain.handle('help.getContent', async () => ({
    入门指南: '您可以从首页新建或打开办公文档。',
    文档编辑: '使用顶部功能区编辑文字、表格与演示文稿。',
    文件保存: '首次保存会选择路径，之后可直接使用保存命令。',
    PDF导出: '在文件菜单中选择导出为 PDF。',
  }))
  ipcMain.handle('app.getInfo', async () => ({
    名称: '海豹办公', 英文名称: 'Seal Office', 版本: app.getVersion(), 作者: '饮风一笑',
    邮箱: '24519660@qq.com', 说明: '本程序永久免费开源',
    开源地址: 'https://github.com/fangzhouxiaohai/seal-office', 专业服务: '专业应用开发服务',
  }))
}

module.exports = { 注册系统通道, 获取未保存风险数量, 查询实时关闭状态 }
