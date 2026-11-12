const fs = require('fs')
const path = require('path')
const { dialog, BrowserWindow, app } = require('electron')
const { 创建Access数据库服务, ACCESS_RUNTIME_URL } = require('../database/accessDatabase')

const 允许操作 = new Set(['inspect', 'query', 'readTable', 'execute', 'insert', 'update', 'delete', 'createTable', 'alterTable', 'dropTable', 'importRows'])
const 默认文件名 = '新建数据库.accdb'
const 驱动未安装提示 = '未检测到 Access 数据库引擎，当前无法新建或打开 Access 数据库。请安装与本机 Office 位数匹配的 Microsoft 365 Access Runtime 后重试。'
const 目录不可写提示 = '所选目录不可写或不存在，无法在此创建数据库，请选择“文档”等有写入权限的目录。'

/** 在目录中写入并删除一个探测文件，确认当前进程确有写入权限。 */
async function 检查目录可写(目录) {
  const 探测文件 = path.join(目录, `.seal-access-${process.pid}-${Date.now()}.tmp`)
  try {
    const 句柄 = await fs.promises.open(探测文件, 'wx')
    await 句柄.close()
    await fs.promises.unlink(探测文件)
    return true
  } catch {
    await fs.promises.unlink(探测文件).catch(() => {})
    return false
  }
}

/** 只取默认名称中的文件名部分，避免渲染进程借此指定任意目录。 */
function 规范默认文件名(默认名称) {
  const 原名 = typeof 默认名称 === 'string' ? path.win32.basename(path.posix.basename(默认名称.trim())) : ''
  const 文件名 = 原名.replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '') || 默认文件名
  return path.extname(文件名).toLowerCase() === '.accdb' ? 文件名 : `${文件名}.accdb`
}

function 默认文档目录() {
  try { return app.getPath('documents') } catch { return app.getPath('home') }
}

function 注册Access数据库通道(ipcMain, 依赖 = {}) {
  const 数据库服务 = 依赖.数据库服务 ?? 创建Access数据库服务()
  const 对话框 = 依赖.对话框 ?? dialog
  const 取窗口 = 依赖.取窗口 ?? ((event) => BrowserWindow.fromWebContents(event.sender))
  const 取文档目录 = 依赖.取文档目录 ?? 默认文档目录
  const 目录可写 = 依赖.检查目录可写 ?? 检查目录可写
  // 驱动一旦确认可用即缓存；不可用时每次重新探测，便于用户安装后无需重启即可使用。
  let 已确认可用 = false

  const 读取状态 = async () => {
    const 状态 = await 数据库服务.status()
    if (状态?.可用) 已确认可用 = true
    return 状态
  }

  ipcMain.handle('database.status', async () => {
    try { return await 读取状态() } catch (错误) { return { 成功: false, 可用: false, 错误: 错误 instanceof Error ? 错误.message : '无法检测 Access 数据库引擎' } }
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

  ipcMain.handle('database.create', async (event, 默认名称 = 默认文件名) => {
    try {
      // 先确认驱动：未安装时不进入保存对话框，直接告知当前无法新建。
      if (!已确认可用) {
        const 状态 = await 读取状态()
        if (!状态?.可用) {
          return {
            成功: false,
            错误类别: '驱动未安装',
            错误: 状态?.平台支持 === false ? (状态.错误 || 'Access 数据库编辑仅在 Windows 桌面版可用') : 驱动未安装提示,
            安装地址: 状态?.安装地址 || ACCESS_RUNTIME_URL,
          }
        }
      }
      // defaultPath 必须是完整路径：裸文件名会按进程工作目录解析，安装版落到不可写的安装目录。
      const 结果 = await 对话框.showSaveDialog(取窗口(event), {
        title: '新建 Access 数据库',
        defaultPath: path.join(取文档目录(), 规范默认文件名(默认名称)),
        filters: [{ name: 'Access 数据库', extensions: ['accdb'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })
      if (结果.canceled || !结果.filePath) return { 成功: true, 已取消: true }
      const 路径 = path.extname(结果.filePath).toLowerCase() === '.accdb' ? 结果.filePath : `${结果.filePath}.accdb`
      if (!(await 目录可写(path.dirname(路径)))) return { 成功: false, 错误类别: '目录不可写', 错误: 目录不可写提示, 路径 }

      const 创建结果 = await 数据库服务.invoke('create', { 路径 })
      if (!创建结果.成功) return { ...创建结果, 路径 }

      // 创建后立即回读，区分“没建出来”与“建出来了但打不开”。
      const 回读 = await 数据库服务.invoke('inspect', { 路径 })
      if (!回读.成功) {
        return {
          成功: false,
          已创建: true,
          路径,
          错误类别: 回读.错误类别 || '其他',
          错误: `数据库文件已创建但无法打开：${路径}`,
          原因: 回读.错误 || '',
          详情: 回读.详情,
          安装地址: 回读.安装地址,
        }
      }
      return { 成功: true, 路径, 数据: 回读.数据 }
    } catch (错误) {
      return { 成功: false, 错误类别: '其他', 错误: 错误 instanceof Error ? 错误.message : '无法创建数据库文件' }
    }
  })

  ipcMain.handle('database.invoke', async (_event, 操作, 输入) => {
    if (!允许操作.has(操作)) return { 成功: false, 错误: '不支持的 Access 数据库操作' }
    try { return await 数据库服务.invoke(操作, 输入) } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : 'Access 数据库操作失败' } }
  })
}

module.exports = { 注册Access数据库通道, 允许操作, 检查目录可写, 规范默认文件名 }
