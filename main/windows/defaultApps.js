const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

function 获取关联程序路径(已打包, 当前路径, 环境 = process.env) {
  const 便携路径 = 环境.PORTABLE_EXECUTABLE_FILE
  if (!已打包 || !便携路径) return 当前路径
  if (typeof 便携路径 !== 'string' || !path.win32.isAbsolute(便携路径) || path.win32.extname(便携路径).toLowerCase() !== '.exe') throw new Error('便携版启动文件路径无效，请从原始便携程序启动')
  return path.win32.normalize(便携路径)
}

function 创建注册执行器({ 可执行文件, 资源目录 }) {
  return async 操作 => {
    const 脚本 = path.join(资源目录, 'shell-integration', 'shellIntegration.ps1')
    const 原脚本 = fs.readFileSync(path.join(__dirname, 'shellIntegration.ps1'))
    if (!原脚本.equals(fs.readFileSync(脚本))) throw new Error('系统关联组件已缺失或修改，请重新安装可信版本')
    const 命令 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const 输出 = await new Promise((完成, 拒绝) => execFile(命令, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 脚本, '-Action', 操作, '-ExecutableFile', 可执行文件], { windowsHide: true, timeout: 30000, encoding: 'utf8' }, (错误, stdout, stderr) => {
      if (错误) {
        let 说明
        try { 说明 = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()).错误 } catch { /* 系统未返回结构化错误 */ }
        拒绝(new Error(`系统文件关联操作失败：${说明 || stderr.trim() || 错误.message}`))
      }
      else 完成(stdout)
    }))
    let 数据
    try { 数据 = JSON.parse(输出.replace(/^\uFEFF/, '').trim()) } catch { throw new Error('系统关联组件未返回有效结果') }
    if (数据.成功 !== true) throw new Error(数据.错误 || '系统文件关联操作失败')
    return 数据
  }
}

function 创建默认程序服务({ 平台 = process.platform, 已打包, 可执行文件, 数据目录, 资源目录, 执行注册, 打开地址 }) {
  const 执行 = 执行注册 || 创建注册执行器({ 可执行文件, 资源目录 })
  const 状态路径 = path.join(数据目录, 'default-app-prompt.json')
  let 队列 = Promise.resolve()
  async function 设置默认程序() {
    if (平台 !== 'win32') throw new Error('默认程序设置仅支持 Windows')
    if (!已打包) throw new Error('请使用 Windows 打包版本设置默认程序')
    await 执行('RegisterApplication')
    await 打开地址('ms-settings:defaultapps?registeredAppUser=SealOffice')
    return { 成功: true, 提示: '请在海豹办公的默认应用页面确认文件关联' }
  }
  async function 检查() {
    if (平台 !== 'win32' || !已打包) return { 成功: true, 需要询问: false }
    const 安装 = await 执行('GetInstallation')
    if (typeof 安装.已安装 !== 'boolean' || (安装.已安装 && (!安装.安装标识 || !安装.可执行文件))) throw new Error('安装注册信息不完整，无法核验首次提醒')
    if (!安装.已安装 || !安装.安装标识 || path.win32.normalize(安装.可执行文件 || '').toLowerCase() !== path.win32.normalize(可执行文件).toLowerCase()) return { 成功: true, 需要询问: false }
    let 已处理
    try { 已处理 = JSON.parse(await fs.promises.readFile(状态路径, 'utf8')) }
    catch (错误) { if (错误.code !== 'ENOENT') throw new Error('首次默认程序提醒记录无法读取，请检查本机存储') }
    if (已处理?.安装标识 === 安装.安装标识) return { 成功: true, 需要询问: false }
    await fs.promises.mkdir(数据目录, { recursive: true })
    const 临时 = `${状态路径}.${process.pid}.tmp`
    try {
      await fs.promises.writeFile(临时, JSON.stringify({ 安装标识: 安装.安装标识 }), { mode: 0o600 })
      await fs.promises.rename(临时, 状态路径)
    } catch { throw new Error('首次默认程序提醒记录保存失败，请检查存储空间和权限') }
    const 状态 = await 执行('InspectDefaults')
    if (typeof 状态.已全部默认 !== 'boolean') throw new Error('系统默认程序查询结果无效')
    return { 成功: true, 需要询问: !状态.已全部默认 }
  }
  function 检查首次提示() {
    const 本次 = 队列.catch(() => {}).then(检查)
    队列 = 本次
    return 本次
  }
  return { 设置默认程序, 检查首次提示 }
}
module.exports = { 创建默认程序服务, 创建注册执行器, 获取关联程序路径 }
