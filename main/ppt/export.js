// 演示导出模块：把渲染端生成的导出 HTML 逐页栅格化，再写图片、PDF、扫描件 PDF 与图片型 PPTX。
// 所有落盘都先写临时文件再改名；目标已存在时追加序号，绝不覆盖同名文件（包括源演示文稿）。
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PDFDocument } = require('pdf-lib')

const 允许格式 = new Set(['PNG', 'JPEG', 'PDF', '扫描件PDF', '图片型PPTX', 'HTML'])
const 讲义张数表 = new Set([1, 2, 3, 4, 6, 9])

/** 讲义与备注由渲染端排版进页面 HTML，主进程只按页栅格化 */
const 需栅格化 = new Set(['PNG', 'JPEG', 'PDF', '扫描件PDF', '图片型PPTX'])

function 校验导出请求(请求) {
  if (!请求 || typeof 请求 !== 'object') throw new Error('导出请求无效')
  if (!允许格式.has(请求.格式)) throw new Error('导出格式不受支持')
  const 倍数 = 请求.分辨率倍数 ?? 1
  if (typeof 倍数 !== 'number' || !Number.isFinite(倍数) || 倍数 < 1 || 倍数 > 4) throw new Error('分辨率倍数须在 1 到 4 之间')
  const 质量 = 请求.JPEG质量 ?? 0.92
  if (typeof 质量 !== 'number' || !Number.isFinite(质量) || 质量 <= 0 || 质量 > 1) throw new Error('图片画质须在 0 到 1 之间')
  const 张数 = 请求.讲义每页张数 ?? 1
  if (!讲义张数表.has(张数)) throw new Error('讲义每页张数只支持 1、2、3、4、6、9')
  if (张数 !== 1 && 请求.格式 !== 'PDF') throw new Error('讲义排版只用于 PDF 导出')
  if (请求.输出备注 && 请求.格式 !== 'PDF') throw new Error('备注输出只用于 PDF 导出')
  const 尺寸 = 请求.页面尺寸
  if (!尺寸 || typeof 尺寸.宽 !== 'number' || typeof 尺寸.高 !== 'number' || !Number.isFinite(尺寸.宽) || !Number.isFinite(尺寸.高) || 尺寸.宽 <= 0 || 尺寸.高 <= 0) {
    throw new Error('导出页面尺寸无效')
  }
  if (需栅格化.has(请求.格式) && (!Array.isArray(请求.条目) || 请求.条目.length === 0)) throw new Error('没有可导出的页面')
}

/** 逐页生成 PDF：按文稿实际页面尺寸建页，页面顺序与规划一致 */
async function 生成PDF(页图片列表, 页面尺寸) {
  if (!Array.isArray(页图片列表) || 页图片列表.length === 0) throw new Error('没有可导出的页面')
  const 文档 = await PDFDocument.create()
  for (const 页 of 页图片列表) {
    let 图片
    try {
      图片 = 页.类型 === 'image/jpeg' ? await 文档.embedJpg(页.数据) : await 文档.embedPng(页.数据)
    } catch (错误) {
      throw new Error(`第 ${Number(页.序号) + 1} 页图像无法写入 PDF：${错误 instanceof Error ? 错误.message : '未知错误'}`)
    }
    const 画布 = 文档.addPage([页面尺寸.宽, 页面尺寸.高])
    画布.drawImage(图片, { x: 0, y: 0, width: 页面尺寸.宽, height: 页面尺寸.高 })
  }
  return Buffer.from(await 文档.save())
}

/** 生成图片型 PPTX 副本：每页铺满一张栅格图片，文字不再可编辑 */
async function 生成图片型PPTX(页图片列表, 页面尺寸) {
  if (!Array.isArray(页图片列表) || 页图片列表.length === 0) throw new Error('没有可导出的页面')
  const pptxgen = require('pptxgenjs')
  const 演示 = new pptxgen()
  const 宽英寸 = Math.round((页面尺寸.宽 / 72) * 10000) / 10000
  const 高英寸 = Math.round((页面尺寸.高 / 72) * 10000) / 10000
  演示.defineLayout({ name: 'SEAL_EXPORT', width: 宽英寸, height: 高英寸 })
  演示.layout = 'SEAL_EXPORT'
  for (const 页 of 页图片列表) {
    const 幻灯片 = 演示.addSlide()
    幻灯片.addImage({ data: `${页.类型};base64,${页.数据.toString('base64')}`, x: 0, y: 0, w: 宽英寸, h: 高英寸 })
  }
  return Buffer.from(await 演示.write({ outputType: 'nodebuffer' }))
}

const 文件名表 = {
  PNG: (基准, 页码) => `${基准}-第${页码}页.png`,
  JPEG: (基准, 页码) => `${基准}-第${页码}页.jpg`,
  页内图片: (页码, 格式) => `第${页码}页.${格式 === 'JPEG' ? 'jpg' : 'png'}`,
  PDF: 基准 => `${基准}.pdf`,
  扫描件PDF: 基准 => `${基准}-扫描件.pdf`,
  图片型PPTX: 基准 => `${基准}-图片版.pptx`,
  HTML: 基准 => `${基准}.html`,
}

/** 生成不冲突的目标路径，已存在时追加 -1、-2 */
function 唯一路径(目录, 文件名, 文件系统) {
  const 扩展 = path.extname(文件名)
  const 主体 = 文件名.slice(0, 文件名.length - 扩展.length)
  let 候选 = path.join(目录, 文件名)
  let 序号 = 1
  while (文件系统.existsSync(候选)) {
    候选 = path.join(目录, `${主体}-${序号}${扩展}`)
    序号 += 1
  }
  return 候选
}

/** 先写临时文件再改名，失败时清理临时文件，不留下半个成品 */
function 原子写入(目标路径, 数据, 文件系统) {
  const 临时路径 = `${目标路径}.seal-tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  try {
    文件系统.writeFileSync(临时路径, 数据)
    文件系统.renameSync(临时路径, 目标路径)
  } catch (错误) {
    try { 文件系统.unlinkSync(临时路径) } catch { /* 临时文件不存在时忽略 */ }
    throw 错误
  }
  return 数据.length
}

/** 写盘：多页图片进入独立目录，单文件格式使用确定名称 */
function 写入导出文件(目录, 基础名, 格式, 条目, 文件系统 = fs) {
  if (!文件名表[格式]) throw new Error('导出格式不受支持')
  if (!Array.isArray(条目) || 条目.length === 0) throw new Error('没有可导出的页面')
  const 基准 = String(基础名 ?? '').trim().replace(/\.[^.]+$/, '').trim() || '演示文稿'
  if (格式 === 'PNG' || 格式 === 'JPEG') {
    // 单页导出写一个文件；多页导出进入独立目录，目录内按页码命名
    const 多页 = 条目.length > 1
    const 目标目录 = 多页 ? path.join(目录, `${基准}-图片`) : 目录
    文件系统.mkdirSync(目标目录, { recursive: true })
    return 条目.map((项, i) => {
      const 页码 = Number.isInteger(项.序号) ? 项.序号 + 1 : i + 1
      const 文件名 = 多页 ? 文件名表.页内图片(页码, 格式) : 文件名表[格式](基准, 页码)
      const 目标 = 唯一路径(目标目录, 文件名, 文件系统)
      return { 路径: 目标, 字节数: 原子写入(目标, 项.数据, 文件系统) }
    })
  }
  文件系统.mkdirSync(目录, { recursive: true })
  const 目标 = 唯一路径(目录, 文件名表[格式](基准), 文件系统)
  return [{ 路径: 目标, 字节数: 原子写入(目标, 条目[0].数据, 文件系统) }]
}

/** 保存目录选择：默认弹出系统对话框 */
async function 默认选择目录() {
  const { dialog, BrowserWindow } = require('electron')
  const 父窗口 = BrowserWindow.getFocusedWindow() ?? undefined
  const 结果 = await dialog.showOpenDialog(父窗口, { title: '选择导出位置', properties: ['openDirectory', 'createDirectory'] })
  if (结果.canceled || !结果.filePaths?.length) return null
  return 结果.filePaths[0]
}
/**
 * 逐页栅格化导出 HTML：隐藏窗口按页面尺寸乘分辨率打开，滚动到每一页后截取整页。
 * @param html 渲染端生成的导出文档
 * @param 页面尺寸 画布尺寸（像素，等于 PDF 点）
 * @param 选项 { 倍数, 格式, JPEG质量, 条目 }
 */
async function 捕获页面图片(html, 页面尺寸, 选项 = {}) {
  const { BrowserWindow } = require('electron')
  const 倍数 = 选项.倍数 ?? 1
  const 页宽 = Math.round(页面尺寸.宽 * 倍数)
  const 页高 = Math.round(页面尺寸.高 * 倍数)
  let 窗口 = null
  let 临时文件 = ''
  try {
    窗口 = new BrowserWindow({
      show: false,
      width: 页宽,
      height: 页高,
      useContentSize: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, zoomFactor: 倍数 },
    })
    临时文件 = path.join(os.tmpdir(), `seal-ppt-export-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.html`)
    fs.writeFileSync(临时文件, html, 'utf-8')
    await 窗口.loadFile(临时文件)
    await 窗口.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true')
    await 窗口.webContents.executeJavaScript('Promise.all([...document.images].map(图 => (图.decode ? 图.decode().catch(() => true) : true))).then(() => true)')
    await new Promise(完成 => setTimeout(完成, 150))
    const 区块数 = await 窗口.webContents.executeJavaScript("document.querySelectorAll('.seal-export-page').length")
    if (!区块数) throw new Error('导出页面渲染失败：未找到可导出的页面区块')
    const 类型 = 选项.格式 === 'JPEG' ? 'image/jpeg' : 'image/png'
    const 结果 = []
    for (let i = 0; i < 区块数; i++) {
      await 窗口.webContents.executeJavaScript(`window.scrollTo(0, ${i * Math.round(页面尺寸.高)}); true`)
      await new Promise(完成 => setTimeout(完成, 60))
      const 图像 = await 窗口.webContents.capturePage({ x: 0, y: 0, width: 页宽, height: 页高 })
      const 规整 = 图像.resize({ width: 页宽, height: 页高, quality: 'best' })
      const 数据 = 类型 === 'image/jpeg' ? 规整.toJPEG(Math.round((选项.JPEG质量 ?? 0.92) * 100)) : 规整.toPNG()
      if (!数据 || 数据.length === 0) throw new Error(`第 ${i + 1} 页栅格化失败，未获得图像数据`)
      结果.push({ 序号: Number.isInteger(选项.条目?.[i]?.序号) ? 选项.条目[i].序号 : i, 类型, 数据, 宽: 页宽, 高: 页高 })
    }
    return 结果
  } finally {
    if (窗口 && !窗口.isDestroyed()) 窗口.destroy()
    if (临时文件) { try { fs.unlinkSync(临时文件) } catch { /* 清理失败不影响导出结果 */ } }
  }
}

/**
 * 完整导出流程：写盘完成后才报告成功，失败返回真实原因，取消不产生文件。
 * @param 请求 { html, 格式, 页面尺寸, 条目, 基础名, 目录?, 分辨率倍数, JPEG质量, 讲义每页张数, 输出备注 }
 * @param 依赖 { 捕获页, 选择目录, 文件系统 } 供测试注入
 */
async function 导出演示(请求, 依赖 = {}) {
  try {
    校验导出请求(请求)
    const 文件系统 = 依赖.文件系统 ?? fs
    const 选择目录 = 依赖.选择目录 ?? 默认选择目录
    const 基础名 = String(请求.基础名 ?? '').trim()

    if (请求.格式 === 'HTML') {
      const 目录 = 请求.目录 ?? await 选择目录()
      if (!目录) return { 成功: false, 已取消: true }
      const 文件列表 = 写入导出文件(目录, 基础名, 'HTML', [{ 序号: 0, 数据: Buffer.from(请求.html ?? '', 'utf8') }], 文件系统)
      return { 成功: true, 文件列表 }
    }

    const 捕获 = 依赖.捕获页 ?? 捕获页面图片
    const 页图片列表 = await 捕获(请求.html, 请求.页面尺寸, {
      倍数: 请求.分辨率倍数 ?? 1,
      格式: 请求.格式,
      JPEG质量: 请求.JPEG质量 ?? 0.92,
      条目: 请求.条目,
      讲义每页张数: 请求.讲义每页张数 ?? 1,
      输出备注: Boolean(请求.输出备注),
    })
    if (!Array.isArray(页图片列表) || 页图片列表.length === 0) throw new Error('导出未获得任何页面图像')

    const 目录 = 请求.目录 ?? await 选择目录()
    if (!目录) return { 成功: false, 已取消: true }

    let 文件列表
    if (请求.格式 === 'PNG' || 请求.格式 === 'JPEG') {
      文件列表 = 写入导出文件(目录, 基础名, 请求.格式, 页图片列表, 文件系统)
    } else if (请求.格式 === 'PDF' || 请求.格式 === '扫描件PDF') {
      文件列表 = 写入导出文件(目录, 基础名, 请求.格式, [{ 序号: 0, 类型: 'application/pdf', 数据: await 生成PDF(页图片列表, 请求.页面尺寸) }], 文件系统)
    } else {
      文件列表 = 写入导出文件(目录, 基础名, '图片型PPTX', [{ 序号: 0, 数据: await 生成图片型PPTX(页图片列表, 请求.页面尺寸) }], 文件系统)
    }
    return { 成功: true, 文件列表, 页数: 页图片列表.length }
  } catch (错误) {
    return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '导出失败' }
  }
}

module.exports = { 校验导出请求, 生成PDF, 生成图片型PPTX, 写入导出文件, 导出演示, 捕获页面图片, 选择导出目录: 默认选择目录, 唯一路径, 原子写入 }
