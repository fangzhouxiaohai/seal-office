// 生产路径核验：在 Electron 主进程内调用与 IPC 处理器相同的 导出演示 完整流程。
// 运行：npx electron scripts/ppt-export-run.cjs
// 环境变量：PPT_HTML、PPT_OUT、PPT_FORMAT、PPT_SCALE
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
app.disableHardwareAcceleration()
// 核验脚本没有主窗口：真实应用由主窗口保持进程存活，这里显式阻止最后一个隐藏窗口销毁时自动退出
app.on('window-all-closed', () => {})

const html路径 = process.env.PPT_HTML
const 输出目录 = process.env.PPT_OUT
const 格式 = process.env.PPT_FORMAT ?? 'PDF'
const 倍数 = Number(process.env.PPT_SCALE ?? '1')

app.whenReady().then(async () => {
  const 进度 = (文本) => fs.appendFileSync(path.join(输出目录, 'run-progress.txt'), `${new Date().toISOString()} ${文本}\n`, 'utf8')
  try {
    fs.mkdirSync(输出目录, { recursive: true })
    const { 导出演示 } = require('../main/ppt/export')
    const html = fs.readFileSync(html路径, 'utf8')
    const 条目数 = (html.match(/class="seal-export-page"/g) ?? []).length
    进度(`调用 导出演示，格式 ${格式}，区块数 ${条目数}`)
    const 结果 = await 导出演示({
      html,
      格式,
      页面尺寸: { 宽: 960, 高: 540 },
      条目: Array.from({ length: 条目数 }, (_, 序号) => ({ 序号 })),
      基础名: '导出样例',
      目录: 输出目录,
      分辨率倍数: 倍数,
      JPEG质量: 0.92,
      讲义每页张数: 1,
      输出备注: false,
    }, { 选择目录: async () => 输出目录 })
    进度(`导出演示 返回：${JSON.stringify({ 成功: 结果.成功, 错误: 结果.错误, 文件数: 结果.文件列表?.length })}`)
    fs.writeFileSync(path.join(输出目录, 'run-result.json'), JSON.stringify(结果, null, 2), 'utf8')
  } catch (错误) {
    进度('异常 ' + (错误 && 错误.stack ? 错误.stack : String(错误)))
  } finally { app.exit(0) }
})

