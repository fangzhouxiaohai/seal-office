const path = require('path')

const 关联扩展名 = new Set(['.docx', '.xlsx', '.pptx', '.pdf'])

/** 仅提取安装版可处理的 Windows 文件绝对路径，不把启动参数误当文件。 */
function 提取关联路径(命令行) {
  if (!Array.isArray(命令行)) return []
  return 命令行.filter((参数) => typeof 参数 === 'string' &&
    path.win32.isAbsolute(参数) && 关联扩展名.has(path.win32.extname(参数).toLowerCase()))
}

/** 文件路径保留到渲染层主动领取，避免首次加载时消息早于页面监听器。 */
function 创建关联文件入口(获取主窗口) {
  let 待打开 = []

  function 加入命令行(命令行) {
    const 已有路径 = new Set(待打开.map((已有) => path.win32.normalize(已有).toLowerCase()))
    const 新路径 = 提取关联路径(命令行).filter((文件路径) => {
      const 规范路径 = path.win32.normalize(文件路径).toLowerCase()
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
