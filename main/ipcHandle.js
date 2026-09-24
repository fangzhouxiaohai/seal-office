const { ipcMain, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')
const fileOps = require('./fileOps')
const pdfExport = require('./pdfExport')

// 原有的 IPC 处理器
ipcMain.handle('open-file', (event, args) => {
  const { filePath } = args
  console.log('ipcHandle open-file:', filePath)
  return filePath
})

// ==================== 文件操作 IPC ====================

// 打开保存对话框
ipcMain.handle('file.showSaveDialog', async (event, 默认文件名) => {
  const win = event.sender.ownerWindow
  const result = await fileOps.showSaveDialog(win, 默认文件名)
  return result.filePath || null
})

// 打开文件对话框
ipcMain.handle('file.showOpenDialog', async (event) => {
  const win = event.sender.ownerWindow
  const result = await fileOps.showOpenDialog(win)
  return result.canceled ? null : result.filePaths
})

// 保存文件
ipcMain.handle('file.saveToFile', async (event, filePath, 内容) => {
  return await fileOps.saveToFile(filePath, 内容)
})

// 读取文件
ipcMain.handle('file.readFile', async (event, filePath) => {
  return await fileOps.readFile(filePath)
})

// ==================== PDF 导出 IPC ====================

// 导出 PDF
ipcMain.handle('pdf.export', async (event, html内容, 默认文件名) => {
  const win = event.sender.ownerWindow
  return await pdfExport.exportToPdf(win, html内容, 默认文件名)
})

// ==================== 系统设置 IPC ====================

// 设为默认办公软件
ipcMain.handle('system.setDefaultApp', async (event) => {
  // 在 Windows 上，可以通过注册表设置文件关联
  // 这里返回提示信息，实际需要调用系统命令或注册表操作
  const 当前平台 = process.platform
  
  if (当前平台 === 'win32') {
    // Windows 系统 - 通过注册表设置
    // 注意：这通常需要管理员权限
    const child = require('child_process')
    try {
      // 注册 .docx 文件关联
      const commands = [
        // 这里需要实际的注册表命令来设置文件关联
        // 由于安全限制，这里仅返回提示
        '需要管理员权限来设置默认应用'
      ]
      return { 
        成功: false, 
        需要管理员权限: true,
        提示: '请在系统设置中手动关联文件类型，或右键文件选择"打开方式"->"选择其他应用"->选择海豹办公并勾选"始终使用此应用打开'.文件类型' '
      }
    } catch (error) {
      return { 成功: false, 错误: error.message }
    }
  } else if (当前平台 === 'darwin') {
    // macOS - 使用 dcfade 命令
    return { 
      成功: false, 
      提示: 'macOS 用户请在"系统偏好设置"->"默认应用程序"中设置' 
    }
  } else {
    // Linux
    return { 
      成功: false, 
      提示: 'Linux 用户需要使用 xdg-mime 命令设置默认应用' 
    }
  }
})

// ==================== 帮助文档 IPC ====================

// 获取帮助文档内容
ipcMain.handle('help.getContent', async (event) => {
  // 返回内置帮助内容
  return {
    入门指南: '欢迎使用海豹办公！您可以通过首页快速创建新文档或打开最近文档。',
    文档编辑: '在文档编辑器中，使用顶部功能栏进行文字编辑、格式设置、插入表格等操作。',
    表格操作: '表格支持插入、删除行列，设置边框，拖选范围等功能。点击表格单元格即可编辑。',
    文件保存: '按 Ctrl+S 可快速保存文档，或使用菜单栏中的保存功能。',
    PDF导出: '使用"文件"菜单中的"导出为PDF"功能，可将当前文档导出为PDF格式。',
    常见问题: 'Q: 如何设为默认办公软件？A: 进入"设置"页面，点击"设为默认办公软件"即可。'
  }
})

// ==================== 应用信息 IPC ====================

// 获取应用信息
ipcMain.handle('app.getInfo', async (event) => {
  return {
    名称: '海豹办公',
    英文名称: 'Seal Office',
    版本: app.getVersion(),
    作者: '饮风一笑',
    邮箱: '24519660@qq.com',
    说明: '本程序永久免费开源',
    开源地址: 'https://github.com/seal-office/seal-office',
    专业服务: '专业AI开发定制小程序APP'
  }
})
