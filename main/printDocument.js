// 使用独立的临时窗口打印当前内容，避免把应用界面和工具栏送往打印机。
const { BrowserWindow } = require('electron')
const fs = require('fs/promises')
const os = require('os')
const path = require('path')

async function 打印文档(内容, 格式 = 'html', 窗口类型 = BrowserWindow) {
  if (!['html', 'pdf'].includes(格式) || typeof 内容 !== 'string' || 内容.length === 0) {
    return { 成功: false, 错误: '打印内容无效' }
  }
  let 临时目录
  let 窗口
  try {
    临时目录 = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-print-'))
    const 路径 = path.join(临时目录, 格式 === 'pdf' ? 'document.pdf' : 'document.html')
    await fs.writeFile(路径, 格式 === 'pdf' ? Buffer.from(内容, 'base64') : 内容)
    窗口 = new 窗口类型({ show: false, webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true, plugins: 格式 === 'pdf',
    } })
    await 窗口.loadFile(路径)
    if (格式 === 'html') await 窗口.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    const 结果 = await new Promise((resolve) => {
      窗口.webContents.print({ silent: false, printBackground: true }, (成功, 原因) => {
        resolve(成功 ? { 成功: true } : 原因 === 'Print job canceled' || 原因 === 'cancelled'
          ? { 成功: false, 已取消: true } : { 成功: false, 错误: 原因 || '打印失败' })
      })
    })
    return 结果
  } catch (错误) {
    return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '打印失败' }
  } finally {
    if (窗口 && !窗口.isDestroyed()) 窗口.destroy()
    if (临时目录) {
      try { await fs.rm(临时目录, { recursive: true, force: true }) }
      catch (错误) { console.error('打印临时文件清理失败:', 错误) }
    }
  }
}

module.exports = { 打印文档 }
