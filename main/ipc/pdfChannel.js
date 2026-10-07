const { BrowserWindow } = require('electron')
const { exportToPdf, exportToPdfToPath } = require('../pdf/pdfPrint')
const { createPdfFromHtml } = require('../pdfExport')
const { 提取页面, 合并文档, 删除页面, 旋转页面, 插入空白页, 插入文件页, 编辑页面 } = require('../pdf/pdfTools')
const { 打印文档 } = require('../printDocument')

function 注册Pdf通道(ipcMain) {
  ipcMain.handle('pdf.export', async (event, html, 默认文件名) => exportToPdf(BrowserWindow.fromWebContents(event.sender), html, 默认文件名))
  ipcMain.handle('pdf.exportToPath', async (_event, html, 保存路径) => exportToPdfToPath(html, 保存路径))
  ipcMain.handle('document.print', async (_event, 内容, 格式) => 打印文档(内容, 格式))
  ipcMain.handle('document.printPreview', async (_event, 内容, 格式) => {
    if (typeof 内容 !== 'string' || !内容 || !['html', 'pdf'].includes(格式)) return { 成功: false, 错误: '预览内容无效' }
    try {
      const 数据 = 格式 === 'pdf' ? Buffer.from(内容, 'base64') : await createPdfFromHtml(内容)
      if (数据.length < 5 || 数据.subarray(0, 5).toString() !== '%PDF-') throw new Error('无法生成有效的 PDF 预览')
      return { 成功: true, 数据: 数据.toString('base64') }
    } catch (错误) { return { 成功: false, 错误: 错误.message || '打印预览失败' } }
  })
  ipcMain.handle('pdf.extract', async (_event, 数据, 页码) => 执行(() => 提取页面(Buffer.from(数据, 'base64'), 页码)))
  ipcMain.handle('pdf.merge', async (_event, 列表) => 执行(() => 合并文档(列表.map((项) => Buffer.from(项, 'base64')))))
  ipcMain.handle('pdf.delete', async (_event, 数据, 页码) => 执行(() => 删除页面(Buffer.from(数据, 'base64'), 页码)))
  ipcMain.handle('pdf.rotate', async (_event, 数据, 页码, 角度) => 执行(() => 旋转页面(Buffer.from(数据, 'base64'), 页码, 角度)))
  ipcMain.handle('pdf.insertBlank', async (_event, 数据, 位置) => 执行(() => 插入空白页(Buffer.from(数据, 'base64'), 位置)))
  ipcMain.handle('pdf.insertPages', async (_event, 数据, 插入数据, 页码, 位置) => 执行(() => 插入文件页(Buffer.from(数据, 'base64'), Buffer.from(插入数据, 'base64'), 页码, 位置)))
  ipcMain.handle('pdf.editPage', async (_event, 数据, 操作) => 执行(() => 编辑页面(Buffer.from(数据, 'base64'), 操作)))
}

async function 执行(任务) {
  try { return { 成功: true, 数据: Buffer.from(await 任务()).toString('base64') } }
  catch (错误) { return { 成功: false, 错误: 错误.message || 'PDF 操作失败' } }
}

module.exports = { 注册Pdf通道 }
