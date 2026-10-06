// 任务 10 打包与核对：把 Electron 真实栅格化的页面图片生成 PDF、图片型 PPTX 与图片文件，并独立核对结果。
// 运行：node scripts/ppt-export-package.cjs <capture 输出目录>
const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const { PDFDocument } = require('pdf-lib')
const { 生成PDF, 生成图片型PPTX, 写入导出文件 } = require('../main/ppt/export')
const { 读取pptx } = require('../main/office/pptxCodec')

const 目录 = process.argv[2]
if (!目录) { console.error('缺少 capture 输出目录'); process.exit(1) }

/** 读取 PNG IHDR 中的像素尺寸 */
function 读取Png尺寸(数据) {
  if (数据.toString('ascii', 1, 4) !== 'PNG') throw new Error('不是 PNG 数据')
  return { 宽: 数据.readUInt32BE(16), 高: 数据.readUInt32BE(20) }
}

;(async () => {
  const 清单 = JSON.parse(fs.readFileSync(path.join(目录, 'capture-result.json'), 'utf8'))
  const 页面尺寸 = 清单.页面尺寸
  const 页图片 = 清单.图片.map(项 => {
    const 数据 = fs.readFileSync(path.join(目录, 项.文件))
    return { 序号: 项.序号, 类型: 项.类型, 数据, 宽: 项.宽, 高: 项.高, 像素: 读取Png尺寸(数据) }
  })

  // 真实写出：图片（含单页与多页命名规则）、PDF、图片型 PPTX
  const 单页输出 = 写入导出文件(path.join(目录, '输出'), '导出样例', 'PNG', [页图片[0]])
  const 多页输出 = 写入导出文件(path.join(目录, '输出'), '导出样例', 'PNG', 页图片)
  const pdf = await 生成PDF(页图片, 页面尺寸)
  const pdf路径 = path.join(目录, '输出', '导出样例.pdf')
  fs.mkdirSync(path.dirname(pdf路径), { recursive: true })
  fs.writeFileSync(pdf路径, pdf)
  const pptx = await 生成图片型PPTX(页图片, 页面尺寸)
  const pptx路径 = path.join(目录, '输出', '导出样例-图片版.pptx')
  fs.writeFileSync(pptx路径, pptx)

  // 独立核对 PDF 页数与页面尺寸
  const 文档 = await PDFDocument.load(pdf)
  const PDF核对 = { 页数: 文档.getPageCount(), 尺寸: Array.from({ length: 文档.getPageCount() }, (_, i) => 文档.getPage(i).getSize()) }

  // 独立核对图片型 PPTX 的部件与读回结果
  const zip = await JSZip.loadAsync(pptx)
  const 幻灯片部件 = Object.keys(zip.files).filter(名称 => /^ppt\/slides\/slide\d+\.xml$/.test(名称)).sort()
  const 媒体部件 = Object.keys(zip.files).filter(名称 => /^ppt\/media\/.+/.test(名称) && !名称.endsWith('/'))
  const 读回 = await 读取pptx(pptx)
  const 第一页Xml = await zip.file('ppt/slides/slide1.xml').async('string')
  const 演示Xml = await zip.file('ppt/presentation.xml').async('string')

  const 结果 = {
    页面尺寸,
    图片: 页图片.map(项 => ({ 序号: 项.序号, 文件: 清单.图片[项.序号].文件, 字节数: 项.数据.length, 像素: 项.像素 })),
    单页图片输出: 单页输出.map(项 => ({ 路径: path.relative(目录, 项.路径), 字节数: 项.字节数 })),
    多页图片输出: 多页输出.map(项 => ({ 路径: path.relative(目录, 项.路径), 字节数: 项.字节数 })),
    PDF: { 字节数: pdf.length, ...PDF核对 },
    图片型PPTX: {
      字节数: pptx.length,
      幻灯片部件数: 幻灯片部件.length,
      媒体部件数: 媒体部件.length,
      含图片填充: 第一页Xml.includes('<a:blip'),
      演示尺寸: /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(演示Xml)?.slice(1) ?? null,
      读回页数: 读回.演示文稿.幻灯片列表.length,
    },
  }
  fs.writeFileSync(path.join(目录, 'package-verify.json'), JSON.stringify(结果, null, 2), 'utf8')
  console.log(JSON.stringify(结果, null, 2))
})().catch(错误 => { console.error('PACKAGE_FAIL', 错误.stack ?? 错误); process.exit(1) })
