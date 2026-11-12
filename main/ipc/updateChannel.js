// 版本更新通道：版本号取 app.getVersion()，服务器地址沿用云服务当前配置。
const { app, shell } = require('electron')
const { spawn } = require('child_process')
const { 创建更新服务, 判定更新平台 } = require('../update/updater')
const { AI失败结果 } = require('../ai/identityGate')

function 注册更新通道(ipcMain, { cloudService, 更新服务 } = {}) {
  let 实例 = 更新服务
  const 服务 = () => 实例 || (实例 = 创建更新服务({
    当前版本: app.getVersion(),
    平台: 判定更新平台(),
    获取服务地址: () => cloudService.status().url,
    临时目录: app.getPath('temp'),
    // 安装程序独立运行，主程序退出后由 NSIS 覆盖安装
    启动安装程序: 文件 => new Promise((resolve, reject) => {
      const 进程 = spawn(文件, [], { detached: true, stdio: 'ignore' })
      进程.once('error', reject)
      进程.once('spawn', () => { 进程.unref(); resolve() })
    }),
    退出: () => app.quit(),
    打开外部: 地址 => shell.openExternal(地址),
  }))
  ipcMain.handle('update.info', async () => {
    try { const 当前 = 服务(); return { 成功: true, 版本: 当前.当前版本, 平台: 当前.平台 } }
    catch (错误) { return AI失败结果(错误, '无法读取版本信息') }
  })
  ipcMain.handle('update.check', async (_事件, 通道) => {
    try { return { 成功: true, 数据: await 服务().检查(通道 === 'beta' ? 'beta' : 'stable') } }
    catch (错误) { return { ...AI失败结果(错误, '检查更新失败'), ...(错误?.code === 'UNSUPPORTED' ? { 不支持: true } : {}), ...(Number.isInteger(错误?.status) ? { 状态码: 错误.status } : {}) } }
  })
  ipcMain.handle('update.install', async (_事件, 发布) => {
    try { return { 成功: true, 数据: await 服务().安装(发布) } }
    catch (错误) { return AI失败结果(错误, '更新失败') }
  })
}

module.exports = { 注册更新通道 }
