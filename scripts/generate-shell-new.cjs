const fs = require('fs')
const path = require('path')
const { 生成docx } = require('../main/office/docxWriter')
const { 写入xlsx } = require('../main/office/xlsxCodec')
const { 写入pptx } = require('../main/office/pptxCodec')
const { PDFDocument } = require('pdf-lib')
const { writeSeal } = require('../main/office/sealFormat')

// Native ShellNew entries copy a complete editable container, never a NullFile.
// Stable blank IDs are scoped to each separately opened document.
async function 生成专属模板(目录) {
  fs.mkdirSync(目录, { recursive: true })
  const 表格 = {
    id: 'seal-shell-new-sheet', name: '工作表1', 单元格: {}, 行数: 100, 列数: 26,
    列宽: Array(26).fill(88), 行高: Array(100).fill(24), 合并区域: [], 图片: [],
    页面设置: { 页边距: '常规', 方向: '纵向', 纸张大小: 'A4' },
  }
  const 演示文稿 = {
    模型版本: 2, id: 'seal-shell-new-deck', name: '未命名演示.slppt', 当前索引: 0, 资源索引: {},
    幻灯片列表: [{ id: 'seal-shell-new-slide', title: '幻灯片 1', 版式: '空白', 背景色: '#FFFFFF', 文本框列表: [], 对象列表: [] }],
  }
  const pdf = await PDFDocument.create()
  pdf.addPage([595.28, 841.89])
  const PDF数据 = Buffer.from(await pdf.save()).toString('base64')
  const 模板 = [
    ['sldoc', 'word', { html: '<p><br></p>' }],
    ['slxls', 'table', { 工作表列表: [表格] }],
    ['slppt', 'ppt', { 演示文稿, 资源条目: [] }],
    ['spdf', 'pdf', { PDF数据 }],
  ]
  for (const [扩展, 类型, 内容] of 模板) {
    const 数据 = await writeSeal(类型, 内容)
    fs.writeFileSync(path.join(目录, `blank.${扩展}`), 数据)
  }
}

async function 生成({ 目录 = path.resolve(__dirname, '../build/shell-new'), 仅专属 = false } = {}) {
  fs.mkdirSync(目录, { recursive: true })
  if (!仅专属) {
    fs.writeFileSync(path.join(目录, 'blank.docx'), await 生成docx({ 段落: [] }))
    fs.writeFileSync(path.join(目录, 'blank.xlsx'), await 写入xlsx({ 工作表: [{ 名称: '工作表1', 数据: [['']] }] }))
    fs.writeFileSync(path.join(目录, 'blank.pptx'), await 写入pptx({ 幻灯片: [{ 背景色: '#FFFFFF', 文本框: [] }] }))
    const pdf = await PDFDocument.create()
    pdf.addPage([595.28, 841.89])
    fs.writeFileSync(path.join(目录, 'blank.pdf'), await pdf.save())
  }
  await 生成专属模板(目录)
}

module.exports = { 生成, 生成专属模板 }
if (require.main === module) 生成({ 仅专属: process.argv.includes('--native-only') })
  .then(() => console.log('海豹专属格式空白模板已生成'))
  .catch(错误 => { console.error(错误); process.exitCode = 1 })
