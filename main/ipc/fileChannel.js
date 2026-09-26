const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { 读取docx } = require('../office/docxReader')
const { 读取xlsx } = require('../office/xlsxCodec')
const { 读取pptx } = require('../office/pptxCodec')

const 文本扩展名 = new Set(['.html', '.htm', '.txt', '.md', '.csv', '.json'])

/**
 * 把渲染进程传入的文件内容统一转成 Buffer。
 * 支持三种形态：
 *   1. Buffer：直接使用；
 *   2. Uint8Array（二进制字节）：拷贝为 Buffer；
 *   3. 格式为'二进制'时的 base64 字符串：解码为二进制字节；
 *   4. 其它情况按 UTF-8 文本处理。
 */
function 内容转缓冲(内容, 格式) {
  if (Buffer.isBuffer(内容)) return 内容
  if (内容 instanceof Uint8Array) {
    return Buffer.from(内容.buffer, 内容.byteOffset, 内容.byteLength)
  }
  const 文本 = String(内容 ?? '')
  if (格式 === '二进制') {
    // 合法的 base64 文本（长度是 4 的倍数且仅含 base64 字符）按二进制解码
    if (文本.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(文本)) {
      return Buffer.from(文本, 'base64')
    }
    return Buffer.from(文本, 'utf8')
  }
  return Buffer.from(文本, 'utf8')
}

function 注册文件通道(ipcMain) {
  ipcMain.handle('file.showSaveDialog', async (event, 默认文件名) => {
    const 窗口 = require('electron').BrowserWindow.fromWebContents(event.sender)
    const 结果 = await dialog.showSaveDialog(窗口, {
      title: '保存文件',
      defaultPath: 默认文件名,
      filters: [
        { name: '文字文档', extensions: ['docx', 'html', 'txt'] },
        { name: '表格文档', extensions: ['xlsx'] },
        { name: '演示文档', extensions: ['pptx'] },
        { name: '网页文件', extensions: ['html'] },
        { name: 'PDF 文件', extensions: ['pdf'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    return 结果.canceled ? null : 结果.filePath || null
  })

  ipcMain.handle('file.showOpenDialog', async (event) => {
    const 窗口 = require('electron').BrowserWindow.fromWebContents(event.sender)
    const 结果 = await dialog.showOpenDialog(窗口, {
      title: '打开文件',
      filters: [
        { name: '办公文档', extensions: ['docx', 'xlsx', 'pptx', 'html', 'htm', 'txt', 'md', 'csv', 'json', 'pdf'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    return 结果.canceled ? null : 结果.filePaths[0] || null
  })

  ipcMain.handle('file.saveToFile', async (_event, filePath, 内容, 格式) => {
    try {
      if (!filePath) return { 成功: false, 错误: '未指定保存路径' }
      fs.writeFileSync(filePath, 内容转缓冲(内容, 格式))
      return { 成功: true, 路径: filePath }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '保存文件失败' }
    }
  })

  ipcMain.handle('file.readFile', async (_event, filePath) => {
    try {
      if (!filePath) return { 成功: false, 错误: '未指定文件路径' }
      const 缓冲 = fs.readFileSync(filePath)
      const 扩展名 = path.extname(filePath).toLowerCase()
      return 文本扩展名.has(扩展名)
        ? { 成功: true, 内容: 缓冲.toString('utf8'), 二进制: false, 扩展名 }
        : { 成功: true, 内容: 缓冲.toString('base64'), 二进制: true, 扩展名 }
    } catch (错误) {
      return { 成功: false, 错误: 错误.message || '读取文件失败' }
    }
  })
}

module.exports = { 注册文件通道, 内容转缓冲, 文本扩展名 }
