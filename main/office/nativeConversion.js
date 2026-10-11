const fs = require('fs')
const path = require('path')
const os = require('os')
const { pathToFileURL } = require('url')
const { execFile } = require('child_process')
const { app } = require('electron')
const 格式列表 = require('../documentFormats.json')
const { 定位兼容引擎, 选择兼容过滤器 } = require('./nativeRuntime')

function 获取转换程序() {
  return 定位兼容引擎({ 根目录: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../.upgrade-private') })
}

/** 转换器仅在独立临时目录处理字节；最终写盘仍由文件通道执行版本校验和原子替换。 */
async function 转换文档(字节, 输入扩展, 输出扩展, 类型) {
  const 来源 = 格式列表.find(项 => 项.extension === 输入扩展)
  const 目标 = 格式列表.find(项 => 项.extension === 输出扩展)
  if (!来源 || !目标 || !['word', 'table', 'ppt'].includes(类型)) throw new Error('文档转换格式无效')
  if (目标.readOnlySource) throw new Error('该格式含宏、加载项或二进制内容，不能直接回写，请另存为普通文档格式')
  const 标准扩展 = { word: 'docx', table: 'xlsx', ppt: 'pptx' }[类型]
  const 过滤器 = 输出扩展 === 标准扩展 ? { word: 'Office Open XML Text', table: 'Calc Office Open XML', ppt: 'Impress Office Open XML' }[类型] : 目标.outputFilter
  if (!过滤器 || ['xml', 'mhtml'].includes(过滤器)) throw new Error('这种格式需要专用写入处理')
  const 程序 = 获取转换程序()
  const 临时 = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'seal-office-convert-'))
  try {
    const 输入 = path.join(临时, `input.${输入扩展}`), 输出目录 = path.join(临时, 'output'), 配置 = path.join(临时, 'profile')
    await fs.promises.mkdir(输出目录)
    await fs.promises.mkdir(path.join(配置, 'user'), { recursive: true })
    // 独立配置拒绝运行文档宏，也不继承本机办公软件的信任目录。
    await fs.promises.writeFile(path.join(配置, 'user/registrymodifications.xcu'), '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>')
    await fs.promises.writeFile(输入, 字节)
    const 参数 = [`-env:UserInstallation=${pathToFileURL(配置).href}`, '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--nolockcheck', '--convert-to', `${输出扩展}:${选择兼容过滤器(过滤器)}`, '--outdir', 输出目录, 输入]
    await new Promise((完成, 拒绝) => {
      let 超时 = false
      const 进程 = execFile(程序, 参数, { windowsHide: true, detached: process.platform !== 'win32', maxBuffer: 1024 * 1024, encoding: 'utf8' }, 错误 => {
        clearTimeout(计时)
        if (超时) 拒绝(new Error('文档转换超时，来源文件未修改，请重试或转换为标准格式后打开'))
        else if (错误) 拒绝(new Error('文档转换失败，请检查文件是否损坏、加密或不符合该格式'))
        else 完成()
      })
      const 计时 = setTimeout(() => {
        超时 = true
        // Only stop this job's process tree; stopping the launcher alone leaves soffice.bin alive.
        if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(进程.pid), '/T', '/F'], { windowsHide: true }, () => { if (进程.exitCode === null) 进程.kill() })
        else if (Number.isInteger(进程.pid) && 进程.pid > 0) {
          // detached gives this conversion its own process group, including soffice.bin.
          try { process.kill(-进程.pid, 'SIGKILL') } catch { if (进程.exitCode === null) 进程.kill('SIGKILL') }
        }
      }, 90000)
    })
    const 输出 = path.join(输出目录, `input.${输出扩展}`)
    if (!fs.existsSync(输出) || fs.statSync(输出).size === 0) throw new Error('兼容引擎没有生成有效文档，文件可能已损坏、加密或格式不受支持')
    return await fs.promises.readFile(输出)
  } finally {
    await fs.promises.rm(临时, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
module.exports = { 转换文档, 获取转换程序 }
