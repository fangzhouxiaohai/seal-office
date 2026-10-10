const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { 准备关联文件图标 } = require('./fileIcons')

function 获取关联程序路径(已打包, 当前路径, 环境 = process.env) {
  const 便携路径 = 环境.PORTABLE_EXECUTABLE_FILE
  if (!已打包 || !便携路径) return 当前路径
  if (typeof 便携路径 !== 'string' || !path.win32.isAbsolute(便携路径) || path.win32.extname(便携路径).toLowerCase() !== '.exe') throw new Error('便携版启动文件路径无效，请从原始便携程序启动')
  return path.win32.normalize(便携路径)
}

function 创建注册执行器({ 可执行文件, 资源目录, 数据目录, 便携版 = Boolean(process.env.PORTABLE_EXECUTABLE_FILE), 测试根 = '' }) {
  return async 操作 => {
    const 脚本 = path.join(资源目录, 'shell-integration', 'shellIntegration.ps1')
    const 原脚本 = fs.readFileSync(path.join(__dirname, 'shellIntegration.ps1'))
    if (!原脚本.equals(fs.readFileSync(脚本))) throw new Error('系统关联组件已缺失或修改，请重新安装可信版本')
    const 命令 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const 参数 = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 脚本, '-Action', 操作, '-ExecutableFile', 可执行文件]
    // 注册应用需要图标路径；验收时用测试根把写入限制在沙箱注册表项下
    if (操作 === 'RegisterApplication' || 操作 === 'ApplyDefaults') 参数.push('-Icons', await 准备关联文件图标({ 资源目录, 数据目录, 便携版 }))
    if (测试根) 参数.push('-TestRoot', 测试根)
    const 输出 = await new Promise((完成, 拒绝) => execFile(命令, 参数, { windowsHide: true, timeout: 30000, encoding: 'utf8' }, (错误, stdout, stderr) => {
      if (错误) {
        let 说明
        try { 说明 = JSON.parse(stdout.replace(/^\uFEFF/, '').trim()).错误 } catch { /* 系统未返回结构化错误 */ }
        const 超时 = 错误.killed || 错误.code === 'ETIMEDOUT'
        拒绝(new Error(`系统文件关联操作失败：${说明 || (超时 ? 'Windows 响应超时，请稍后在设置中心打开默认应用页面' : stderr.trim() || 'Windows 未能完成关联操作，请检查系统权限后重试')}`))
      }
      else 完成(stdout)
    }))
    let 数据
    try { 数据 = JSON.parse(输出.replace(/^\uFEFF/, '').trim()) } catch { throw new Error('系统关联组件未返回有效结果') }
    if (数据.成功 !== true) throw new Error(数据.错误 || '系统文件关联操作失败')
    return 数据
  }
}

function 创建默认程序服务({ 平台 = process.platform, 已打包, 可执行文件, 数据目录, 资源目录, 执行注册, 打开地址, 测试根 = '' }) {
  const 执行 = 执行注册 || 创建注册执行器({ 可执行文件, 资源目录, 数据目录, 测试根 })
  const 状态路径 = path.join(数据目录, 'default-app-prompt.json')
  let 队列 = Promise.resolve()
  /** 注册应用并读取默认状态；保留系统保护的用户选择 */
  async function 应用默认程序() {
    if (平台 !== 'win32') throw new Error('默认程序设置仅支持 Windows')
    if (!已打包) throw new Error('请使用 Windows 打包版本设置默认程序')
    const 结果 = await 执行('ApplyDefaults')
    if (typeof 结果.已全部默认 !== 'boolean' || !Array.isArray(结果.格式)) throw new Error('系统默认程序查询结果无效')
    const 未生效 = 结果.格式.filter((项) => !项.已默认).map((项) => 项.扩展名)
    return {
      成功: true,
      已全部默认: 结果.已全部默认,
      未生效,
      清除用户选择的格式: Array.isArray(结果.清除用户选择的格式) ? 结果.清除用户选择的格式 : [],
      格式: 结果.格式,
    }
  }
  /** 设置默认程序：注册应用，打开 Windows 默认应用页面供用户确认 */
  async function 设置默认程序() {
    const 结果 = await 应用默认程序()
    if (结果.已全部默认) return { 成功: true, 已全部默认: true, 提示: '已将 DOCX、XLSX、PPTX、PDF 设为海豹办公打开' }
    try { await 打开地址('ms-settings:defaultapps?registeredAppUser=SealOffice') }
    catch {
      // Windows 10 或旧系统设置不接受应用专属地址时，仍可进入默认应用列表。
      try { await 打开地址('ms-settings:defaultapps') }
      catch { throw new Error('海豹办公已注册，但 Windows 默认应用页面未能打开。请在系统设置 → 应用 → 默认应用中选择海豹办公。') }
    }
    const 未生效 = 结果.未生效.map((项) => `.${项}`).join('、')
    return {
      成功: true,
      已全部默认: false,
      未生效: 结果.未生效,
      提示: `已打开 Windows 默认应用页面，请确认：${未生效}`,
    }
  }
  /** 启动只查询；受保护的默认程序设置由用户主动在系统页面确认。 */
  async function 启动检查默认程序() {
    if (平台 !== 'win32' || !已打包) return { 成功: true, 已全部默认: true, 已处理: false }
    const 当前 = await 执行('InspectDefaults')
    if (typeof 当前.已全部默认 !== 'boolean') throw new Error('系统默认程序查询结果无效')
    if (当前.已全部默认) return { 成功: true, 已全部默认: true, 已处理: false }
    if (!Array.isArray(当前.格式)) throw new Error('系统默认程序查询结果无效')
    return { 成功: true, 已全部默认: false, 已处理: false, 未生效: 当前.格式.filter(项 => !项.已默认).map(项 => 项.扩展名) }
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
  return { 设置默认程序, 检查首次提示, 应用默认程序, 启动检查默认程序 }
}
module.exports = { 创建默认程序服务, 创建注册执行器, 获取关联程序路径 }
