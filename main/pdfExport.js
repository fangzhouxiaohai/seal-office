// PDF 导出模块
const { BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

/**
 * 使用 Electron 的 printToPDF 功能导出 PDF
 * @param win - BrowserWindow 实例
 * @param html内容 - HTML 内容字符串
 * @param 默认文件名 - 默认保存文件名
 * @returns 操作结果
 */
exports.exportToPdf = async (win, html内容, 默认文件名) => {
  try {
    if (!win) {
      return { 成功: false, 错误: '窗口对象无效' }
    }

    // 生成 PDF 选项
    const 打印选项 = {
      默认页边距: { 上: '1in', 下: '1in', 左: '1in', 右: '1in' },
      页面范围: [], // 空数组表示全部页面
      打印背景: true,
      偏好打印机: ''
    }

    // 使用 Electron 的 printToPDF API
    const 结果 = await win.webContents.printToPDF(打印选项)

    // 将结果转换为 Buffer
    const 缓冲区 = Buffer.from(结果)

    // 确定保存路径
    const 基础名 = 默认文件名 ? 默认文件名.replace(/\.[^.]+$/, '') : '文档'
    const 保存路径 = path.join(os.homedir(), 'Documents', 基础名 + '.pdf')

    // 保存 PDF 文件
    fs.writeFileSync(保存路径, 缓冲区)

    return { 成功: true, 路径: 保存路径 }
  } catch (error) {
    console.error('PDF 导出失败:', error)
    return { 成功: false, 错误: error.message || 'PDF 导出失败' }
  }
}

/**
 * 创建临时 HTML 文件并打印为 PDF
 * @param win - BrowserWindow 实例
 * @param html内容 - HTML 内容
 * @returns PDF Buffer
 */
exports.createPdfFromHtml = async (win, html内容) => {
  try {
    // 创建临时文件
    const 临时文件 = path.join(os.tmpdir(), `seal-pdf-${Date.now()}.html`)
    fs.writeFileSync(临时文件, html内容, 'utf-8')

    // 加载临时文件
    await win.loadFile(临时文件)

    // 等待加载完成
    await new Promise(resolve => setTimeout(resolve, 500))

    // 导出 PDF
    const 结果 = await win.webContents.printToPDF({
      默认页边距: { 上: '0.5in', 下: '0.5in', 左: '0.5in', 右: '0.5in' },
      打印背景: true
    })

    // 删除临时文件
    try {
      fs.unlinkSync(临时文件)
    } catch {}

    return Buffer.from(结果)
  } catch (error) {
    console.error('创建 PDF 失败:', error)
    throw error
  }
}
