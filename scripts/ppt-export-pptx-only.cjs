// 定位实验：只在 Electron 主进程内调用图片型 PPTX 生成，判断崩溃是否来自 pptxgenjs。
// 运行：npx electron scripts/ppt-export-pptx-only.cjs
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
app.disableHardwareAcceleration()
// 核验脚本没有主窗口：真实应用由主窗口保持进程存活，这里显式阻止最后一个隐藏窗口销毁时自动退出
app.on('window-all-closed', () => {})
const 目录 = process.env.PPT_OUT
app.whenReady().then(async () => {
  const 标记 = (文本) => fs.appendFileSync(path.join(目录, 'pptx-only-progress.txt'), `${new Date().toISOString()} ${文本}\n`, 'utf8')
  try {
    const { 生成图片型PPTX, 生成PDF } = require('../main/ppt/export')
    const 清单 = JSON.parse(fs.readFileSync(path.join(目录, 'capture-result.json'), 'utf8'))
    const 页图片 = 清单.图片.map(项 => ({ 序号: 项.序号, 类型: 项.类型, 数据: fs.readFileSync(path.join(目录, 项.文件)), 宽: 项.宽, 高: 项.高 }))
    标记('读取图片完成，开始生成 PDF')
    const pdf = await 生成PDF(页图片, 清单.页面尺寸)
    fs.writeFileSync(path.join(目录, '仅主进程.pdf'), pdf)
    标记('PDF 完成，开始生成图片型 PPTX')
    const pptx = await 生成图片型PPTX(页图片, 清单.页面尺寸)
    fs.writeFileSync(path.join(目录, '仅主进程-图片版.pptx'), pptx)
    标记('图片型 PPTX 完成')
  } catch (错误) {
    标记('失败 ' + (错误 && 错误.stack ? 错误.stack : String(错误)))
  } finally { app.exit(0) }
})

