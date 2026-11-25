// Windows 安装向导交接：由独立的交接进程等待主程序退出，再以普通方式启动 NSIS 安装程序。
// 不附加 --updated（electron-builder 会据此跳过安装模式与目录页并静默覆盖），也不附加任何静默参数，
// 因此用户看到的与手动双击安装包一致：安装模式、目录、进度与完成页逐步确认。
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const 等待上限毫秒 = 2 * 60 * 1000

/** 构造交接进程的启动参数（便于测试，不含任何安装程序参数）。 */
function 交接参数({ 安装包, 主进程号, 日志文件, 脚本 = __filename }) {
  if (!path.isAbsolute(安装包) || !/\.exe$/i.test(安装包)) throw new Error('安装包路径无效')
  if (!Number.isSafeInteger(主进程号) || 主进程号 <= 0) throw new Error('主程序进程号无效')
  return [脚本, '--seal-installer-handoff', 安装包, String(主进程号), 日志文件 || '']
}

/**
 * 在主进程中调用：用 Electron 自带的 Node 运行本文件作为交接进程。
 * 返回交接进程号；启动失败抛错，由调用方回退为打开安装包所在目录。
 */
function 启动安装向导交接({ 安装包, 主进程号 = process.pid, 日志文件, 执行文件 = process.execPath, 启动 = spawn }) {
  const 参数 = 交接参数({ 安装包, 主进程号, 日志文件 })
  return new Promise((resolve, reject) => {
    const 子进程 = 启动(执行文件, 参数, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    子进程.once('error', reject)
    子进程.once('spawn', () => { 子进程.unref(); resolve(子进程.pid) })
  })
}

function 进程存在(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

function 记录(日志文件, 内容) {
  if (!日志文件) return
  try { fs.appendFileSync(日志文件, JSON.stringify({ 时间: new Date().toISOString(), ...内容 }) + '\n') } catch { /* 日志失败不影响安装 */ }
}

/** 交接进程主体：等待主程序退出 → 启动安装程序（无参数）→ 记录结果。 */
async function 执行交接({ 安装包, 主进程号, 日志文件, 存在 = 进程存在, 启动 = spawn, 等待 = ms => new Promise(r => setTimeout(r, ms)), 上限 = 等待上限毫秒 }) {
  记录(日志文件, { 事件: '交接开始', 交接进程: process.pid, 主进程号, 安装包 })
  const 开始 = Date.now()
  while (存在(主进程号)) {
    if (Date.now() - 开始 > 上限) { 记录(日志文件, { 事件: '等待主程序退出超时' }); return false }
    await 等待(200)
  }
  if (!fs.existsSync(安装包)) { 记录(日志文件, { 事件: '安装包不存在' }); return false }
  return new Promise(resolve => {
    const 安装 = 启动(安装包, [], { detached: true, stdio: 'ignore' })
    安装.once('error', 错误 => { 记录(日志文件, { 事件: '安装程序启动失败', 错误: 错误.message }); resolve(false) })
    安装.once('spawn', () => {
      记录(日志文件, { 事件: '安装向导已启动', 安装进程: 安装.pid })
      安装.unref()
      resolve(true)
    })
  })
}

if (require.main === module && process.argv[2] === '--seal-installer-handoff') {
  const [, , , 安装包, 主进程号, 日志文件] = process.argv
  执行交接({ 安装包, 主进程号: Number(主进程号), 日志文件 }).then(成功 => process.exit(成功 ? 0 : 1))
}

module.exports = { 交接参数, 启动安装向导交接, 执行交接 }
