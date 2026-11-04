const fs = require('node:fs')
const path = require('node:path')
const { PDFDocument, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const version = require('../../package.json').version
  const work = path.join(root, 'release/promo', `work-${version}-tutorial`)
  fs.mkdirSync(work, { recursive: true })
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fs.readFileSync(path.join(root, 'mobile/web/public/fonts/NotoSansSC.ttf')))
  const pages = [
    { title: '项目计划：需求与准备', rows: ['项目计划从需求梳理开始。', '第一步，整理当前文档与参考资料。', '第二步，核对关键时间与负责人。', '本页记录初步安排，后续内容见第二页。'] },
    { title: '项目计划：执行与复核', rows: ['项目计划进入执行阶段。', '第三步，完成内容编辑与交叉复核。', '第四步，保存成品并检查实际结果。', '本页用于演示跨页检索和可见批注。'] },
  ]
  for (const [index, item] of pages.entries()) {
    const page = doc.addPage([595, 842])
    page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: rgb(0.31, 0.2, 0.58) })
    page.drawText('海豹办公 2.6.0  演示资料', { x: 36, y: 814, size: 12, font, color: rgb(1, 1, 1) })
    page.drawText(item.title, { x: 50, y: 728, size: 24, font, color: rgb(0.12, 0.15, 0.25) })
    item.rows.forEach((row, n) => page.drawText(row, { x: 52, y: 652 - n * 57, size: 15, font, color: rgb(0.2, 0.23, 0.3) }))
    page.drawText(`第 ${index + 1} 页 / 共 2 页`, { x: 50, y: 40, size: 11, font, color: rgb(0.48, 0.5, 0.55) })
  }
  const target = path.join(work, '项目计划-演示.pdf')
  fs.writeFileSync(target, await doc.save())
  process.stdout.write(`${target}\n`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
