const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib')
const fs = require('fs')
const path = require('path')

function 校验页码(总数, 页码列表) {
  const 结果 = [...new Set(页码列表.map(Number))]
  if (结果.some((页码) => !Number.isInteger(页码) || 页码 < 1 || 页码 > 总数)) throw new Error('页码超出文档范围')
  return 结果
}

async function 提取页面(数据, 页码列表) {
  try {
    const 来源 = await PDFDocument.load(Buffer.from(数据))
    const 页码 = 校验页码(来源.getPageCount(), 页码列表)
    const 目标 = await PDFDocument.create()
    const 页面 = await 目标.copyPages(来源, 页码.map((项) => 项 - 1))
    页面.forEach((项) => 目标.addPage(项))
    return Buffer.from(await 目标.save())
  } catch (错误) {
    throw new Error(`提取页面失败：${错误.message}`)
  }
}

async function 合并文档(文档列表) {
  if (!Array.isArray(文档列表) || 文档列表.length < 2) throw new Error('至少需要选择两个 PDF 文件')
  try {
    const 目标 = await PDFDocument.create()
    for (const 数据 of 文档列表) {
      const 来源 = await PDFDocument.load(Buffer.from(数据))
      const 页面 = await 目标.copyPages(来源, 来源.getPageIndices())
      页面.forEach((项) => 目标.addPage(项))
    }
    return Buffer.from(await 目标.save())
  } catch (错误) {
    throw new Error(`合并文档失败：${错误.message}`)
  }
}

async function 删除页面(数据, 页码列表) {
  try {
    const 来源 = await PDFDocument.load(Buffer.from(数据))
    const 删除 = new Set(校验页码(来源.getPageCount(), 页码列表))
    const 保留 = Array.from({ length: 来源.getPageCount() }, (_, 索引) => 索引 + 1).filter((页码) => !删除.has(页码))
    if (保留.length === 0) throw new Error('不能删除文档中的全部页面')
    return 提取页面(数据, 保留)
  } catch (错误) {
    throw new Error(`删除页面失败：${错误.message}`)
  }
}

async function 旋转页面(数据, 页码列表, 角度) {
  if (![90, 180, 270].includes(Number(角度))) throw new Error('旋转角度只支持 90、180 或 270 度')
  try {
    const 文档 = await PDFDocument.load(Buffer.from(数据))
    const 页码 = 校验页码(文档.getPageCount(), 页码列表)
    页码.forEach((页号) => {
      const 页面 = 文档.getPage(页号 - 1)
      页面.setRotation(degrees((页面.getRotation().angle + Number(角度)) % 360))
    })
    return Buffer.from(await 文档.save())
  } catch (错误) {
    throw new Error(`旋转页面失败：${错误.message}`)
  }
}

async function 插入空白页(数据, 位置) {
  const 文档 = await PDFDocument.load(Buffer.from(数据))
  const 页数 = 文档.getPageCount()
  if (!Number.isInteger(位置) || 位置 < 1 || 位置 > 页数 + 1) throw new Error('插入位置超出文档范围')
  const 参照 = 文档.getPage(Math.min(位置 - 1, 页数 - 1))
  const { width, height } = 参照.getSize()
  文档.insertPage(位置 - 1, [width, height])
  return Buffer.from(await 文档.save())
}

async function 插入文件页(数据, 插入数据, 来源页码, 位置) {
  const 文档 = await PDFDocument.load(Buffer.from(数据))
  const 来源 = await PDFDocument.load(Buffer.from(插入数据))
  if (!Number.isInteger(位置) || 位置 < 1 || 位置 > 文档.getPageCount() + 1) throw new Error('插入位置超出文档范围')
  const 页码 = 校验页码(来源.getPageCount(), 来源页码)
  if (!页码.length) throw new Error('请选择要插入的页面')
  const 页面 = await 文档.copyPages(来源, 页码.map((项) => 项 - 1))
  页面.forEach((页, 索引) => 文档.insertPage(位置 - 1 + 索引, 页))
  return Buffer.from(await 文档.save())
}

function 颜色(值) {
  if (typeof 值 !== 'string' || !/^#[0-9a-f]{6}$/i.test(值)) throw new Error('颜色格式无效')
  return rgb(...[1, 3, 5].map((索引) => parseInt(值.slice(索引, 索引 + 2), 16) / 255))
}

async function 字体(文档, 内容) {
  if (/^[\x00-\x7f]*$/.test(内容)) return 文档.embedFont(StandardFonts.Helvetica)
  const fontkit = require('@pdf-lib/fontkit')
  const 目录 = process.platform === 'win32' ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts') : '/usr/share/fonts'
  const 候选 = process.platform === 'win32' ? ['simhei.ttf', 'simsunb.ttf', 'simfang.ttf'] : ['truetype/noto/NotoSansCJK-Regular.ttc', 'truetype/dejavu/DejaVuSans.ttf']
  const 路径 = 候选.map((名字) => path.join(目录, 名字)).find((名字) => fs.existsSync(名字))
  if (!路径) throw new Error('系统未安装可用于 PDF 中文编辑的字体')
  文档.registerFontkit(fontkit)
  return 文档.embedFont(fs.readFileSync(路径), { subset: true })
}

/** 页面坐标从左上角起，单位为 PDF 点。遮盖仅改变视觉效果，不删除原内容。 */
async function 编辑页面(数据, 操作) {
  const 文档 = await PDFDocument.load(Buffer.from(数据))
  const 页码 = 校验页码(文档.getPageCount(), [操作.页码])[0]
  const 页 = 文档.getPage(页码 - 1)
  const x = Number(操作.x), y = Number(操作.y)
  if (![x, y].every((值) => Number.isFinite(值) && 值 >= 0) || x > 页.getWidth() || y > 页.getHeight()) throw new Error('页面位置超出范围')
  const 宽 = Number(操作.宽), 高 = Number(操作.高)
  if (操作.类型 === 'image') {
    if (!Number.isFinite(宽) || !Number.isFinite(高) || 宽 <= 0 || 高 <= 0 || x + 宽 > 页.getWidth() || y + 高 > 页.getHeight()) throw new Error('图片尺寸超出页面范围')
    const 图片 = Buffer.from(操作.图片 || '', 'base64')
    const 嵌入 = 图片.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? await 文档.embedPng(图片)
      : 图片.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? await 文档.embedJpg(图片) : null
    if (!嵌入) throw new Error('只支持 PNG 或 JPEG 图片')
    页.drawImage(嵌入, { x, y: 页.getHeight() - y - 高, width: 宽, height: 高 })
  } else if (操作.类型 === 'cover') {
    if (!Number.isFinite(宽) || !Number.isFinite(高) || 宽 <= 0 || 高 <= 0 || x + 宽 > 页.getWidth() || y + 高 > 页.getHeight()) throw new Error('遮盖区域超出页面范围')
    页.drawRectangle({ x, y: 页.getHeight() - y - 高, width: 宽, height: 高, color: 颜色(操作.颜色 || '#ffffff') })
  } else if (['text', 'note', 'replace'].includes(操作.类型)) {
    const 内容 = String(操作.文字 || '').trim()
    const 字号 = Number(操作.字号 || 12)
    if (!内容 || !Number.isFinite(字号) || 字号 < 4 || 字号 > 72) throw new Error('文字内容或字号无效')
    const 嵌入字体 = await 字体(文档, 内容)
    if (操作.类型 === 'replace') {
      if (!Number.isFinite(宽) || !Number.isFinite(高) || 宽 <= 0 || 高 <= 0 || x + 宽 > 页.getWidth() || y + 高 > 页.getHeight()) throw new Error('替换区域超出页面范围')
      页.drawRectangle({ x, y: 页.getHeight() - y - 高, width: 宽, height: 高, color: rgb(1, 1, 1) })
    }
    if (操作.类型 === 'note') 页.drawRectangle({ x: x - 3, y: 页.getHeight() - y - 字号 - 4, width: Math.min(页.getWidth() - x + 3, 嵌入字体.widthOfTextAtSize(内容, 字号) + 6), height: 字号 + 7, color: rgb(1, .96, .72) })
    页.drawText(内容, { x, y: 页.getHeight() - y - 字号, size: 字号, font: 嵌入字体, color: 颜色(操作.颜色 || '#111111') })
  } else throw new Error('不支持的 PDF 编辑操作')
  return Buffer.from(await 文档.save())
}

module.exports = { 提取页面, 合并文档, 删除页面, 旋转页面, 插入空白页, 插入文件页, 编辑页面 }
