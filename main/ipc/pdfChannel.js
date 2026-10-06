const { BrowserWindow } = require('electron')
const { exportToPdf, exportToPdfToPath } = require('../pdf/pdfPrint')
const { 提取页面, 合并文档, 删除页面, 旋转页面 } = require('../pdf/pdfTools')
const { 打印文档 } = require('../printDocument')

function 注册Pdf通道(ipcMain) {
  ipcMain.handle('pdf.export', async (event, html, 默认文件名) => exportToPdf(BrowserWindow.fromWebContents(event.sender), html, 默认文件名))
  ipcMain.handle('pdf.exportToPath', async (_event, html, 保存路径) => exportToPdfToPath(html, 保存路径))
  ipcMain.handle('document.print', async (_event, 内容, 格式) => 打印文档(内容, 格式))
  ipcMain.handle('pdf.extract', async (_event, 数据, 页码) => 执行(() => 提取页面(Buffer.from(数据, 'base64'), 页码)))
  ipcMain.handle('pdf.merge', async (_event, 列表) => 执行(() => 合并文档(列表.map((项) => Buffer.from(项, 'base64')))))
  ipcMain.handle('pdf.delete', async (_event, 数据, 页码) => 执行(() => 删除页面(Buffer.from(数据, 'base64'), 页码)))
  ipcMain.handle('pdf.rotate', async (_event, 数据, 页码, 角度) => 执行(() => 旋转页面(Buffer.from(数据, 'base64'), 页码, 角度)))
}

async function 执行(任务) {
  try { return { 成功: true, 数据: Buffer.from(await 任务()).toString('base64') } }
  catch (错误) { return { 成功: false, 错误: 错误.message || 'PDF 操作失败' } }
}

module.exports = { 注册Pdf通道 }
