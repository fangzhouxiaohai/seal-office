const path = require('path')

const 关联扩展名 = new Set(require('./documentFormats.json').map(({ extension }) => `.${extension}`))

/** 提取平台对应的文件绝对路径，不把启动参数误当文件。 */
function 提取关联路径(命令行, 平台 = 'win32') {
  const 路径 = 平台 === 'win32' ? path.win32 : path.posix
  if (!Array.isArray(命令行)) return []
  return 命令行.filter((参数) => typeof 参数 === 'string' &&
    路径.isAbsolute(参数) && 关联扩展名.has(路径.extname(参数).toLowerCase()))
}

/** 文件路径保留到渲染层主动领取，避免首次加载时消息早于页面监听器。 */
function 创建关联文件入口(获取主窗口, 平台 = 'win32') {
  let 待打开 = []
  const 路径 = 平台 === 'win32' ? path.win32 : path.posix
  const 路径键 = 文件 => 平台 === 'win32' ? 路径.normalize(文件).toLowerCase() : 路径.normalize(文件)

  function 加入命令行(命令行) {
    const 已有路径 = new Set(待打开.map(路径键))
    const 新路径 = 提取关联路径(命令行, 平台).filter((文件路径) => {
      const 规范路径 = 路径键(文件路径)
      if (已有路径.has(规范路径)) return false
      已有路径.add(规范路径)
      return true
    })
    if (新路径.length === 0) return 0
    待打开.push(...新路径)
    const 窗口 = 获取主窗口()
    if (窗口 && !窗口.isDestroyed?.()) 窗口.webContents.send('file.association.available')
    return 新路径.length
  }

  function 注册读取通道(ipcMain) {
    ipcMain.handle('file.association.takePending', async (事件) => {
      const 窗口 = 获取主窗口()
      if (!窗口 || 窗口.isDestroyed?.() || 事件?.sender !== 窗口.webContents) {
        return { 成功: false, 错误: '无法确认文件打开请求来自主窗口' }
      }
      const 路径列表 = 待打开
      待打开 = []
      return { 成功: true, 路径列表 }
    })
  }

  return { 加入命令行, 注册读取通道 }
}

module.exports = { 提取关联路径, 创建关联文件入口 }
