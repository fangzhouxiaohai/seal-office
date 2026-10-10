const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const { execFile } = require('node:child_process')
const formats = require('../../main/documentFormats.json')
const normalFilters = { word: 'Office Open XML Text', table: 'Calc Office Open XML', ppt: 'Impress Office Open XML' }
const normalExtensions = { word: 'docx', table: 'xlsx', ppt: 'pptx' }

async function convertWithOffice(bytes, inputExtension, outputExtension, type, { executable = 'soffice', timeout = 90000 } = {}) {
  const target = formats.find(f => f.extension === outputExtension && f.type === type && !f.readOnlySource)
  const source = formats.find(f => f.extension === inputExtension && (f.type === type || f.extension === 'xml'))
  const filter = outputExtension === normalExtensions[type] ? normalFilters[type] : target?.outputFilter
  if (!source || !target || !filter || ['xml','mhtml','prn'].includes(filter)) throw new Error('文档转换格式无效')
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-converter-'))
  try {
    const profile = path.join(folder, 'profile'), out = path.join(folder, 'output'), input = path.join(folder, 'input.' + inputExtension)
    await fs.mkdir(path.join(profile, 'user'), { recursive: true }); await fs.mkdir(out)
    await fs.writeFile(path.join(profile, 'user/registrymodifications.xcu'), '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Load"><prop oor:name="UpdateMode" oor:op="fuse"><value>0</value></prop></item></oor:items>')
    await fs.writeFile(input, bytes)
    await new Promise((resolve, reject) => {
      let timedOut = false
      const child = execFile(executable, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--nolockcheck', '--convert-to', `${outputExtension}:${filter}`, '--outdir', out, input], { windowsHide: true, detached: process.platform !== 'win32', maxBuffer: 1024 * 1024 }, error => {
        clearTimeout(timer)
        if (timedOut) reject(new Error('文档转换超时，请稍后重试'))
        else if (error) reject(new Error('转换引擎执行失败，请检查服务安装和文件是否加密'))
        else resolve()
      })
      const timer = setTimeout(() => {
        timedOut = true
        if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { if (child.exitCode === null) child.kill() })
        else { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }
      }, timeout)
    })
    const output = await fs.readFile(path.join(out, 'input.' + outputExtension)).catch(() => { throw new Error('没有生成有效文档，文件可能已损坏或加密') })
    if (!output.length) throw new Error('转换结果为空')
    return output
  } finally { await fs.rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
}
module.exports = { convertWithOffice }
