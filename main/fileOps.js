// 文件操作模块
const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')

/**
 * 打开保存文件对话框
 * @param win - BrowserWindow 实例
 * @param 默认文件名 - 默认显示的文件名
 * @returns 文件路径或 null（用户取消）
 */
exports.showSaveDialog = (win, 默认文件名) => {
  return dialog.showSaveDialog(win, {
    title: '保存',
    defaultPath: 默认文件名,
    filters: [
      { name: 'Word 文档', extensions: ['docx'] },
      { name: 'Excel 表格', extensions: ['xlsx'] },
      { name: 'PPT 演示', extensions: ['pptx'] },
      { name: 'HTML 网页', extensions: ['html'] },
      { name: '纯文本', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
}

/**
 * 打开打开文件对话框
 * @param win - BrowserWindow 实例
 * @returns 文件路径数组或空数组（用户取消）
 */
exports.showOpenDialog = (win) => {
  return dialog.showOpenDialog(win, {
    title: '打开文件',
    filters: [
      { name: 'Office 文档', extensions: ['docx', 'xlsx', 'pptx', 'html', 'txt'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
}

/**
 * 保存文件到磁盘
 * @param filePath - 文件路径
 * @param 内容 - 文件内容
 * @returns 操作结果
 */
exports.saveToFile = (filePath, 内容) => {
  try {
    if (!filePath) {
      return { 成功: false, 错误: '未指定文件路径' }
    }
    fs.writeFileSync(filePath, 内容, 'utf-8')
    return { 成功: true }
  } catch (error) {
    return { 成功: false, 错误: error.message || '保存文件失败' }
  }
}

/**
 * 读取文件内容
 * @param filePath - 文件路径
 * @returns 文件内容或错误
 */
exports.readFile = (filePath) => {
  try {
    if (!filePath) {
      return { 成功: false, 错误: '未指定文件路径' }
    }
    const 内容 = fs.readFileSync(filePath, 'utf-8')
    return { 成功: true, 内容 }
  } catch (error) {
    return { 成功: false, 错误: error.message || '读取文件失败' }
  }
}

/**
 * 获取文件目录
 * @param win - BrowserWindow 实例
 * @returns 目录路径或 null（用户取消）
 */
exports.showOpenDirectoryDialog = (win) => {
  return dialog.showOpenDialog(win, {
    title: '选择文件夹',
    properties: ['openDirectory']
  })
}
