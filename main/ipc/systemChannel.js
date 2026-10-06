const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { randomUUID } = require('crypto')
const { 检查安装目录 } = require('../integrity')
const { 创建默认程序服务, 获取关联程序路径 } = require('../windows/defaultApps')

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
  let 默认程序服务
  const 获取默认程序服务 = () => {
    if (!默认程序服务) 默认程序服务 = 创建默认程序服务({ 已打包: app.isPackaged, 可执行文件: 获取关联程序路径(app.isPackaged, app.getPath('exe')), 数据目录: app.getPath('userData'), 资源目录: process.resourcesPath, 打开地址: 地址 => shell.openExternal(地址) })
    return 默认程序服务
  }
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
    try {
      return await 获取默认程序服务().设置默认程序()
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '系统默认程序设置失败' }
    }
  })
  ipcMain.handle('system.checkDefaultAppPrompt', async () => {
    try { return await 获取默认程序服务().检查首次提示() }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '系统默认程序检查失败' } }
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
  ipcMain.handle('system.openExternal', async (_事件, 地址) => {
    // 协议白名单在渲染端与主进程各校验一次，避免任意协议被系统打开。
    if (typeof 地址 !== 'string' || !地址 || 地址.length > 2048) return { 成功: false, 错误: '链接地址无效' }
    let 网址
    try { 网址 = new URL(地址) } catch { return { 成功: false, 错误: '链接地址格式无效' } }
    if (!['http:', 'https:', 'mailto:'].includes(网址.protocol)) return { 成功: false, 错误: `链接协议不受支持：${网址.protocol}` }
    try {
      await shell.openExternal(网址.toString())
      return { 成功: true }
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '系统无法打开该链接' }
    }
  })
  ipcMain.handle('app.getInfo', async () => ({
    名称: '海豹办公', 英文名称: 'Seal Office', 版本: app.getVersion(), 作者: '饮风一笑',
    邮箱: '24519660@qq.com', 说明: '本程序永久免费开源',
    开源地址: 'https://github.com/fangzhouxiaohai/seal-office', 专业服务: '专业应用开发服务',
  }))
}

module.exports = { 注册系统通道, 获取未保存风险数量, 查询实时关闭状态 }
