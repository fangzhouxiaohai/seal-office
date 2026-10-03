// PDF 导出模块：把编辑区 HTML 渲染为 PDF 文件。
const { BrowserWindow, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

/** 渲染完成后的等待时长，留给字体与图片加载 */
const 渲染等待毫秒 = 600

/** printToPDF 的页边距与背景设置，键名必须为 Electron 定义的英文字段 */
const 打印选项 = {
  margins: { top: 1, bottom: 1, left: 1, right: 1 },
  printBackground: true,
  pageSize: 'A4',
}

/**
 * 使用 Electron 的 printToPDF 功能导出 PDF
 * @param win - 发起导出的 BrowserWindow，作为保存对话框的父窗口
 * @param html内容 - 完整的 HTML 文档字符串
 * @param 默认文件名 - 保存对话框中预填的文件名
 * @returns 操作结果，取消时返回 已取消
 */
exports.exportToPdf = async (win, html内容, 默认文件名) => {
  let 临时窗口 = null
  let 临时文件 = ''

  try {
    const 基础名 = 默认文件名 ? 默认文件名.replace(/\.[^.]+$/, '') : '文档'

    // 保存位置交由用户选择，不再固定写入「文档」目录
    const 对话框结果 = await dialog.showSaveDialog(win, {
      title: '导出为 PDF',
      defaultPath: path.join(os.homedir(), 'Documents', 基础名 + '.pdf'),
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    })

    if (对话框结果.canceled || !对话框结果.filePath) {
      return { 成功: false, 已取消: true }
    }
    const 保存路径 = 对话框结果.filePath

    // 用隐藏窗口渲染 HTML，避免影响主窗口内容
    临时窗口 = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // 渲染的是本地临时文件，关闭远程内容加载
        webSecurity: true,
      },
    })

    临时文件 = path.join(os.tmpdir(), `seal-pdf-${Date.now()}.html`)
    fs.writeFileSync(临时文件, html内容, 'utf-8')

    await 临时窗口.loadFile(临时文件)
    await new Promise((resolve) => setTimeout(resolve, 渲染等待毫秒))

    const 数据 = await 临时窗口.webContents.printToPDF(打印选项)
    fs.writeFileSync(保存路径, Buffer.from(数据))

    return { 成功: true, 路径: 保存路径 }
  } catch (error) {
    console.error('PDF 导出失败:', error)
    return { 成功: false, 错误: error.message || 'PDF 导出失败' }
  } finally {
    // 无论成功与否都要清理临时资源，避免窗口泄漏与临时文件堆积
    if (临时窗口 && !临时窗口.isDestroyed()) {
      临时窗口.destroy()
    }
    if (临时文件) {
      try {
        fs.unlinkSync(临时文件)
      } catch {
        // 临时文件清理失败不影响导出结果
      }
    }
  }
}

/**
 * 将 HTML 渲染为 PDF 并写入指定路径（不弹保存对话框，供「保存」链路复用）
 * @param html内容 - 完整的 HTML 文档字符串
 * @param 保存路径 - 目标 PDF 文件路径
 * @returns 操作结果
 */
exports.exportToPdfToPath = async (html内容, 保存路径) => {
  try {
    const 数据 = await exports.createPdfFromHtml(html内容)
    fs.writeFileSync(保存路径, 数据)
    return { 成功: true, 路径: 保存路径 }
  } catch (error) {
    console.error('PDF 导出失败:', error)
    return { 成功: false, 错误: error.message || 'PDF 导出失败' }
  }
}

/**
 * 将 HTML 渲染为 PDF 数据，不落盘，供 PDF 工具模块组合使用
 * @param html内容 - 完整的 HTML 文档字符串
 * @returns PDF 内容的 Buffer
 */
exports.createPdfFromHtml = async (html内容) => {
  let 临时窗口 = null
  let 临时文件 = ''

  try {
    临时窗口 = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    临时文件 = path.join(os.tmpdir(), `seal-pdf-${Date.now()}.html`)
    fs.writeFileSync(临时文件, html内容, 'utf-8')

    await 临时窗口.loadFile(临时文件)
    await new Promise((resolve) => setTimeout(resolve, 渲染等待毫秒))

    return Buffer.from(await 临时窗口.webContents.printToPDF(打印选项))
  } finally {
    if (临时窗口 && !临时窗口.isDestroyed()) {
      临时窗口.destroy()
    }
    if (临时文件) {
      try {
        fs.unlinkSync(临时文件)
      } catch {
        // 清理失败不影响返回结果
      }
    }
  }
}
