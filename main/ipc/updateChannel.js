// 版本更新通道：版本号取 app.getVersion()，服务器地址沿用云服务当前配置。
const { app, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { 创建更新服务, 判定更新平台 } = require('../update/updater')
const { 创建暂存更新 } = require('../update/stagedUpdater')
const { AI失败结果 } = require('../ai/identityGate')

function 注册更新通道(ipcMain, { cloudService, 更新服务, 暂存服务 } = {}) {
  let 实例 = 更新服务
  let 暂存实例 = 暂存服务
  const 订阅者 = new Set()
  const 记住 = 事件 => { if (事件?.sender?.send) 订阅者.add(事件.sender) }
  const 通知 = 状态 => { for (const 接收 of 订阅者) { if (接收.isDestroyed?.()) 订阅者.delete(接收); else 接收.send('update.progress', 状态) } }
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
  const 暂存 = () => 暂存实例 || (暂存实例 = 创建暂存更新({
    平台: 服务().平台,
    当前版本: 服务().当前版本,
    目录: path.join(app.getPath('userData'), 'verified-updates'),
    检查: (通道, 信号) => 服务().检查(通道, 信号),
    通知,
    打开安装包: async (文件, 发布, 任务标识) => {
      if (服务().平台 !== 'windows') {
        const 错误 = await shell.openPath(文件)
        if (错误) throw new Error('无法打开已校验的安装包：' + 错误)
        return
      }
      const 结果路径 = path.join(app.getPath('userData'), 'verified-updates', 'install-result.json')
      fs.rmSync(结果路径, { force: true })
      await new Promise((resolve, reject) => {
        const helper = spawn(process.execPath, [path.join(__dirname, '../update/installAfterExit.js'), String(process.pid), 文件, 发布.sha256, String(发布.bytes), 结果路径, 任务标识], {
          detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        })
        helper.once('error', reject)
        helper.once('spawn', () => { helper.unref(); resolve() })
      })
      setTimeout(() => app.quit(), 800)
    },
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
    try {
      if (服务().平台 !== 'windows-store') throw new Error('请先下载并校验更新，再选择安装')
      const 通道 = 发布?.channel ?? 'stable'
      if (!['stable', 'beta'].includes(通道)) throw new Error('发布通道无效')
      const 最新 = await 服务().检查(通道)
      if (!最新?.hasUpdate || 最新.version !== 发布?.version || 最新.url !== 发布?.url) throw new Error('发布信息已变化，请重新检查更新')
      return { 成功: true, 数据: await 服务().安装(发布) }
    }
    catch (错误) { return AI失败结果(错误, '更新失败') }
  })
  ipcMain.handle('update.download', async (事件, 发布) => {
    try { 记住(事件); return { 成功:true, 数据:await 暂存().下载(发布) } }
    catch (错误) { return AI失败结果(错误, '下载更新失败') }
  })
  ipcMain.handle('update.cancel', async (事件) => {
    try { 记住(事件); return { 成功:true, 数据:await 暂存().取消() } }
    catch (错误) { return AI失败结果(错误, '取消更新失败') }
  })
  ipcMain.handle('update.status', async (事件) => {
    try { 记住(事件); return { 成功:true, 数据:await 暂存().状态() } }
    catch (错误) { return AI失败结果(错误, '读取更新状态失败') }
  })
  ipcMain.handle('update.installReady', async (事件) => {
    try { 记住(事件); return { 成功:true, 数据:await 暂存().安装() } }
    catch (错误) { return AI失败结果(错误, '安装更新失败') }
  })
}

module.exports = { 注册更新通道 }
