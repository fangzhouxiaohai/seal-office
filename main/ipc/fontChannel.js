'use strict'

const { app, dialog, shell } = require('electron')
const { 创建字体服务 } = require('../fonts/fontService')

function 注册字体通道(ipcMain, 依赖 = {}) {
  let 服务
  const 获取服务 = () => {
    if (!服务) 服务 = 创建字体服务({
      数据目录: app.getPath('userData'),
      选择文件: async () => {
        const result = await dialog.showOpenDialog({
          title: '导入字体到海豹办公',
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: '字体文件', extensions: ['ttf', 'otf', 'ttc'] },
            { name: '所有文件', extensions: ['*'] },
          ],
        })
        return result.canceled ? [] : result.filePaths
      },
      打开目录: async (directory) => {
        const result = await shell.openPath(directory)
        if (result) throw new Error(result)
      },
    })
    return 服务
  }
  ipcMain.handle('font.list', async (_event, 选项) => {
    try { return { 成功: true, 数据: await 获取服务().列出({ 刷新: Boolean(选项?.刷新) }) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '读取字体目录失败' } }
  })
  ipcMain.handle('font.read', async (_event, 标识) => {
    if (typeof 标识 !== 'string' || !/^(?:system|user)-[a-f0-9]{20}$/.test(标识)) return { 成功: false, 错误: '字体标识无效' }
    try { return { 成功: true, 数据: await 获取服务().读取字体(标识) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '读取字体失败' } }
  })
  ipcMain.handle('font.import', async () => {
    try { return { 成功: true, 数据: await 获取服务().导入字体() } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '导入字体失败' } }
  })
  ipcMain.handle('font.remove', async (_event, 标识) => {
    if (typeof 标识 !== 'string') return { 成功: false, 错误: '字体标识无效' }
    try { return { 成功: true, 数据: await 获取服务().移除字体(标识) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '移除字体失败' } }
  })
  ipcMain.handle('font.folder', async () => {
    try { return { 成功: true, 数据: await 获取服务().打开字体目录() } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法打开字体目录' } }
  })
}

module.exports = { 注册字体通道 }
