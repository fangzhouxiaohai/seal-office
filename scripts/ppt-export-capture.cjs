// 任务 10 真实栅格化核验：在真实 Electron 环境把导出 HTML 逐页截图，并生成真实 PDF 与图片型 PPTX。
// 运行：npx electron scripts/ppt-export-capture.cjs
// 环境变量：PPT_HTML（导出 HTML 路径）、PPT_OUT（输出目录）、PPT_SCALE（分辨率倍数，默认 2）、PPT_FORMAT（PNG/JPEG）
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

app.disableHardwareAcceleration()
// 核验脚本没有主窗口：真实应用由主窗口保持进程存活，这里显式阻止最后一个隐藏窗口销毁时自动退出
app.on('window-all-closed', () => {})

const html路径 = process.env.PPT_HTML
const 输出目录 = process.env.PPT_OUT
const 倍数 = Number(process.env.PPT_SCALE ?? '2')
const 格式 = process.env.PPT_FORMAT === 'JPEG' ? 'JPEG' : 'PNG'
const 页面尺寸 = { 宽: 960, 高: 540 }

async function 主流程() {
  const { 捕获页面图片 } = require('../main/ppt/export')
  if (!html路径 || !输出目录) throw new Error('缺少 PPT_HTML 或 PPT_OUT')
  fs.mkdirSync(输出目录, { recursive: true })
  const 进度 = (文本) => fs.appendFileSync(path.join(输出目录, 'capture-progress.txt'), `${new Date().toISOString()} ${文本}\n`, 'utf8')
  进度('开始读取 HTML')
  const html = fs.readFileSync(html路径, 'utf8')
  const 区块数 = (html.match(/class="seal-export-page"/g) ?? []).length
  进度(`区块数 ${区块数}，开始栅格化，倍数 ${倍数}`)
  const 图片列表 = await 捕获页面图片(html, 页面尺寸, { 倍数, 格式, JPEG质量: 0.92, 条目: Array.from({ length: 区块数 }, (_, 序号) => ({ 序号 })) })
  进度(`栅格化完成，共 ${图片列表.length} 页`)
  // 主进程只负责栅格化：把真实字节写到磁盘，PDF 与图片型 PPTX 由 Node 打包脚本生成
  const 图片文件 = 图片列表.map(项 => {
    const 名称 = `第${项.序号 + 1}页.${格式 === 'JPEG' ? 'jpg' : 'png'}`
    const 路径 = path.join(输出目录, 名称)
    fs.writeFileSync(路径, 项.数据)
    return { 序号: 项.序号, 文件: 名称, 字节数: 项.数据.length, 类型: 项.类型, 宽: 项.宽, 高: 项.高 }
  })
  const 结果 = { 区块数, 分辨率倍数: 倍数, 格式, 页面尺寸, 图片: 图片文件 }
  fs.writeFileSync(path.join(输出目录, 'capture-result.json'), JSON.stringify(结果, null, 2), 'utf8')
  进度('已写出 capture-result.json')
  console.log('CAPTURE_OK ' + JSON.stringify({ 区块数, 图片: 图片文件 }))
}

app.whenReady().then(async () => {
  try { await 主流程() } catch (错误) {
    const 文本 = 错误 && 错误.stack ? 错误.stack : String(错误)
    try { if (输出目录) fs.writeFileSync(path.join(输出目录, 'capture-error.txt'), 文本, 'utf8') } catch { /* 目录不可写时忽略 */ }
    console.error('CAPTURE_FAIL', 文本)
    process.exitCode = 1
  } finally { app.exit(process.exitCode ?? 0) }
})

