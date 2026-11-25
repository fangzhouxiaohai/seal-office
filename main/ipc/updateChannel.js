// 版本更新通道：版本号取 app.getVersion()，服务器地址沿用云服务当前配置。
const { app, shell, net } = require('electron')
const { spawn } = require('child_process')
const path = require('node:path')
const { 创建更新服务, 判定更新平台 } = require('../update/updater')
const { 创建暂存更新 } = require('../update/stagedUpdater')
const { 启动安装向导交接 } = require('../update/installerHandoff')
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
    // 走 Chromium 网络栈：沿用系统代理与系统证书库，避免 Node fetch 在代理或企业证书环境下连不上更新服务
    请求: (地址, 选项) => net.fetch(地址, 选项),
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
    // 安装包下载同样走 Chromium 网络栈，代理环境下可用
    请求: (地址, 选项) => net.fetch(地址, 选项),
    打开安装包: async (文件) => {
      if (服务().平台 !== 'windows') {
        const 错误 = await shell.openPath(文件)
        if (错误) throw new Error('无法打开已校验的安装包：' + 错误)
        return
      }
      // 交接进程等待本程序退出后，以普通方式启动安装程序（不带 --updated），显示完整安装向导。
      // 交接进程启动失败时打开安装包所在目录，提示用户手动运行；已下载的安装包保留以便重试。
      const 日志文件 = path.join(app.getPath('userData'), 'verified-updates', 'install-log.jsonl')
      try {
        await 启动安装向导交接({ 安装包: 文件, 日志文件 })
      } catch (错误) {
        shell.showItemInFolder(文件)
        throw new Error('无法启动安装向导，已打开安装包所在文件夹，请手动运行安装程序：' + (错误?.message || '未知错误'))
      }
      setTimeout(() => app.quit(), 300)
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
      // 商店版跳转微软商店；Linux 确认后在浏览器中打开 DEB 下载地址（不在应用内下载与安装）。
      if (!['windows-store', 'linux'].includes(服务().平台)) throw new Error('请先下载并校验更新，再选择安装')
      const 通道 = 发布?.channel ?? 'stable'
      if (!['stable', 'beta'].includes(通道)) throw new Error('发布通道无效')
      const 最新 = await 服务().检查(通道)
      if (!最新?.hasUpdate || 最新.version !== 发布?.version || 最新.url !== 发布?.url) throw new Error('发布信息已变化，请重新检查更新')
      return { 成功: true, 数据: await 服务().安装(发布) }
    }
    catch (错误) { return AI失败结果(错误, '更新失败') }
  })
  ipcMain.handle('update.download', async (事件, 发布) => {
    try {
      if (服务().平台 === 'linux') throw new Error('Linux 版请在浏览器中下载 DEB 安装包，再用软件中心或 dpkg 安装')
      记住(事件); return { 成功:true, 数据:await 暂存().下载(发布) }
    }
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
