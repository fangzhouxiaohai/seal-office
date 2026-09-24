const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')

const 文本扩展名 = new Set(['.html', '.htm', '.txt', '.md', '.csv', '.json'])

function 注册文件通道(ipcMain) {
  ipcMain.handle('file.showSaveDialog', async (event, 默认文件名) => {
    const 窗口 = require('electron').BrowserWindow.fromWebContents(event.sender)
    const 结果 = await dialog.showSaveDialog(窗口, {
      title: '保存文件',
      defaultPath: 默认文件名,
      filters: [
        { name: '文字文档', extensions: ['docx'] },
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
        { name: '办公文档', extensions: ['docx', 'xlsx', 'pptx', 'html', 'txt', 'pdf'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    return 结果.canceled ? null : 结果.filePaths[0] || null
  })

  ipcMain.handle('file.saveToFile', async (_event, filePath, 内容, 格式) => {
    try {
      if (!filePath) return { 成功: false, 错误: '未指定保存路径' }
      const 缓冲 = Buffer.isBuffer(内容) ? 内容 : Buffer.from(String(内容 ?? ''), 格式 === '二进制' ? undefined : 'utf8')
      fs.writeFileSync(filePath, 缓冲)
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

module.exports = { 注册文件通道 }
