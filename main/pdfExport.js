// PDF 导出模块：把编辑区 HTML 渲染为 PDF 文件。
const { BrowserWindow, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

/** 渲染前的兜底等待上限；正常情况下由字体与图片就绪事件提前结束 */
const 渲染等待上限毫秒 = 10000

/**
 * printToPDF 的页边距与背景设置，键名必须为 Electron 定义的英文字段。
 * 实测 Electron 25 在此平台上忽略 margins 的数值、并拒绝过大的自定义边距，
 * 页边距改由导出 HTML 的 @page 规则控制（preferCSSPageSize 打开时生效），
 * 因此这里显式关闭附加边距，避免与 CSS 版心叠加。
 * preferCSSPageSize 打开后按 CSS 的 A4 纸张排版，不再把内容缩放塞进纸张，
 * 避免整页被缩小导致的文字发虚。
 */
const 打印选项 = {
  margins: { marginType: 'none' },
  printBackground: true,
  pageSize: 'A4',
  preferCSSPageSize: true,
  scale: 1,
}

/** 在隐藏窗口里等待字体与图片就绪，再连续两帧后返回，确保打印拿到最终排版 */
const 渲染就绪脚本 = `(async () => {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch (错误) {}
  const 图片 = Array.from(document.images || [])
  await Promise.all(图片.map((图片) => 图片.complete
    ? Promise.resolve()
    : new Promise((完成) => {
        图片.addEventListener('load', 完成, { once: true })
        图片.addEventListener('error', 完成, { once: true })
      })))
  await new Promise((完成) => requestAnimationFrame(() => requestAnimationFrame(完成)))
  return true
})()`

/**
 * 等待渲染完成；字体或图片迟迟不就绪时按上限超时，不让导出一直卡住。
 * @param 窗口 - 已加载 HTML 的 BrowserWindow
 * @param 上限毫秒 - 超时时间
 */
async function 等待渲染就绪(窗口, 上限毫秒 = 渲染等待上限毫秒) {
  let 计时器
  const 超时 = new Promise((完成) => {
    计时器 = setTimeout(() => 完成('超时'), 上限毫秒)
  })
  try {
    await Promise.race([窗口.webContents.executeJavaScript(渲染就绪脚本, true), 超时])
  } catch {
    // 页面脚本异常不应中断导出，继续按当前排版打印
  } finally {
    clearTimeout(计时器)
  }
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
      paintWhenInitiallyHidden: true,
      width: 900,
      height: 1200,
      webPreferences: {
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
        // 渲染的是本地临时文件，关闭远程内容加载
        webSecurity: true,
      },
    })

    临时文件 = path.join(os.tmpdir(), `seal-pdf-${Date.now()}.html`)
    fs.writeFileSync(临时文件, html内容, 'utf-8')

    await 临时窗口.loadFile(临时文件)
    await 等待渲染就绪(临时窗口)

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
      paintWhenInitiallyHidden: true,
      width: 900,
      height: 1200,
      webPreferences: { backgroundThrottling: false, nodeIntegration: false, contextIsolation: true },
    })

    临时文件 = path.join(os.tmpdir(), `seal-pdf-${Date.now()}.html`)
    fs.writeFileSync(临时文件, html内容, 'utf-8')

    await 临时窗口.loadFile(临时文件)
    await 等待渲染就绪(临时窗口)

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

/** 供测试核对打印参数与就绪脚本，不参与导出流程 */
exports.打印选项 = 打印选项
exports.渲染就绪脚本 = 渲染就绪脚本
exports.等待渲染就绪 = 等待渲染就绪
