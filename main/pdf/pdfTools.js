const { PDFDocument, degrees } = require('pdf-lib')

function 校验页码(总数, 页码列表) {
  const 结果 = [...new Set(页码列表.map(Number))]
  if (结果.some((页码) => !Number.isInteger(页码) || 页码 < 1 || 页码 > 总数)) throw new Error('页码超出文档范围')
  return 结果
}

async function 提取页面(数据, 页码列表) {
  const 来源 = await PDFDocument.load(Buffer.from(数据))
  const 页码 = 校验页码(来源.getPageCount(), 页码列表)
  const 目标 = await PDFDocument.create()
  const 页面 = await 目标.copyPages(来源, 页码.map((项) => 项 - 1))
  页面.forEach((项) => 目标.addPage(项))
  return Buffer.from(await 目标.save())
}

async function 合并文档(文档列表) {
  if (!Array.isArray(文档列表) || 文档列表.length < 2) throw new Error('至少需要选择两个 PDF 文件')
  const 目标 = await PDFDocument.create()
  for (const 数据 of 文档列表) {
    const 来源 = await PDFDocument.load(Buffer.from(数据))
    const 页面 = await 目标.copyPages(来源, 来源.getPageIndices())
    页面.forEach((项) => 目标.addPage(项))
  }
  return Buffer.from(await 目标.save())
}

async function 删除页面(数据, 页码列表) {
  const 来源 = await PDFDocument.load(Buffer.from(数据))
  const 删除 = new Set(校验页码(来源.getPageCount(), 页码列表))
  const 保留 = Array.from({ length: 来源.getPageCount() }, (_, 索引) => 索引 + 1).filter((页码) => !删除.has(页码))
  if (保留.length === 0) throw new Error('不能删除文档中的全部页面')
  return 提取页面(数据, 保留)
}

async function 旋转页面(数据, 页码列表, 角度) {
  if (![90, 180, 270].includes(Number(角度))) throw new Error('旋转角度只支持 90、180 或 270 度')
  const 文档 = await PDFDocument.load(Buffer.from(数据))
  const 页码 = 校验页码(文档.getPageCount(), 页码列表)
  页码.forEach((页号) => {
    const 页面 = 文档.getPage(页号 - 1)
    页面.setRotation(degrees((页面.getRotation().angle + Number(角度)) % 360))
  })
  return Buffer.from(await 文档.save())
}

module.exports = { 提取页面, 合并文档, 删除页面, 旋转页面 }
