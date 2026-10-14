const path = require('path')
const { dialog, BrowserWindow } = require('electron')
const { 创建Access数据库服务 } = require('../database/accessDatabase')

const 允许操作 = new Set(['inspect', 'query', 'readTable', 'execute', 'insert', 'update', 'delete', 'createTable', 'dropTable', 'importRows'])

function 注册Access数据库通道(ipcMain, 依赖 = {}) {
  const 数据库服务 = 依赖.数据库服务 ?? 创建Access数据库服务()
  const 对话框 = 依赖.对话框 ?? dialog
  const 取窗口 = 依赖.取窗口 ?? ((event) => BrowserWindow.fromWebContents(event.sender))

  ipcMain.handle('database.status', async () => {
    try { return await 数据库服务.status() } catch (错误) { return { 成功: false, 可用: false, 错误: 错误 instanceof Error ? 错误.message : '无法检测 Access 数据库引擎' } }
  })

  ipcMain.handle('database.pick', async (event) => {
    try {
      const 结果 = await 对话框.showOpenDialog(取窗口(event), {
        title: '打开 Access 数据库',
        filters: [
          { name: 'Access 数据库（2003–Microsoft 365）', extensions: ['accdb', 'mdb'] },
          { name: 'Access 2007 及以后', extensions: ['accdb'] },
          { name: 'Access 2003', extensions: ['mdb'] },
        ],
        properties: ['openFile'],
      })
      return 结果.canceled ? { 成功: true, 已取消: true } : { 成功: true, 路径: 结果.filePaths[0] }
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法选择数据库文件' }
    }
  })

  ipcMain.handle('database.create', async (event, 默认名称 = '新建数据库.accdb') => {
    try {
      const 文件名 = typeof 默认名称 === 'string' && 默认名称.trim() ? 默认名称.trim() : '新建数据库.accdb'
      const 结果 = await 对话框.showSaveDialog(取窗口(event), {
        title: '新建 Access 数据库',
        defaultPath: path.extname(文件名).toLowerCase() === '.accdb' ? 文件名 : `${文件名}.accdb`,
        filters: [{ name: 'Access 数据库', extensions: ['accdb'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })
      if (结果.canceled || !结果.filePath) return { 成功: true, 已取消: true }
      const 路径 = path.extname(结果.filePath).toLowerCase() === '.accdb' ? 结果.filePath : `${结果.filePath}.accdb`
      const 创建结果 = await 数据库服务.invoke('create', { 路径 })
      return 创建结果.成功 ? { ...创建结果, 路径 } : 创建结果
    } catch (错误) {
      return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法创建数据库文件' }
    }
  })

  ipcMain.handle('database.invoke', async (_event, 操作, 输入) => {
    if (!允许操作.has(操作)) return { 成功: false, 错误: '不支持的 Access 数据库操作' }
    try { return await 数据库服务.invoke(操作, 输入) } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : 'Access 数据库操作失败' } }
  })
}

module.exports = { 注册Access数据库通道, 允许操作 }
