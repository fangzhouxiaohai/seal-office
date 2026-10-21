const sax = require('sax')
const path = require('path')
const JSZip = require('jszip')

const 主空间 = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const 动态空间 = 'http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray'
// WPS 12.1 matches this extension URI literally. Its native output and the
// standard dynamic-array example use lowercase; uppercase silently downgrades
// a recalculated workbook to legacy fixed arrays in that application.
const 扩展标识 = '{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}'
const 未导入警告 = '动态数组或其他单元格元数据未导入，已保留可读取的公式及缓存'

function 解析树(xml) {
  const 解析器 = sax.parser(true, { xmlns: true }), 栈 = []
  let 根
  解析器.onopentag = 节点 => {
    const 新节点 = { 名称: 节点.local, 空间: 节点.uri, 属性: Object.fromEntries(Object.values(节点.attributes).filter(a => !a.prefix).map(a => [a.local, a.value])), 子: [] }
    if (栈.length) 栈.at(-1).子.push(新节点)
    else if (根) throw new Error('表格元数据必须包含一个根节点')
    else 根 = 新节点
    栈.push(新节点)
  }
  解析器.onclosetag = () => 栈.pop()
  解析器.ondoctype = () => { throw new Error('表格 XML 不支持文档类型声明') }
  解析器.write(xml).close()
  return 根
}
const 子列表 = (节点, 名称) => 节点?.子.filter(n => n.空间 === 主空间 && n.名称 === 名称) ?? []
const 非负整数 = 文本 => /^\d+$/.test(文本 ?? '') && Number.isSafeInteger(Number(文本)) ? Number(文本) : -1

/** Office 的 cm 为一基索引，rc.t 为一基类型索引，rc.v 为零基 futureMetadata 索引。 */
function 读取动态元数据(xml) {
  const 根 = 解析树(xml), 记录 = new Map()
  let 未支持 = !根 || 根.空间 !== 主空间 || 根.名称 !== 'metadata'
  const 类型 = 子列表(子列表(根, 'metadataTypes')[0], 'metadataType')
  const 未来 = 子列表(根, 'futureMetadata')
  const 单元记录 = 子列表(子列表(根, 'cellMetadata')[0], 'bk')
  if (!类型.length || !单元记录.length) 未支持 = true
  if (根?.子.some(n => n.空间 !== 主空间 || !['metadataTypes', 'futureMetadata', 'cellMetadata'].includes(n.名称))) 未支持 = true
  if (类型.some(n => n.属性.name !== 'XLDAPR') || 未来.some(n => n.属性.name !== 'XLDAPR')) 未支持 = true
  单元记录.forEach((块, 索引) => {
    const 引用 = 子列表(块, 'rc')
    if (引用.length !== 1 || 块.子.length !== 1) { 未支持 = true; return }
    const 类型号 = 非负整数(引用[0].属性.t), 值号 = 非负整数(引用[0].属性.v)
    if (类型号 < 1 || 类型[类型号 - 1]?.属性.name !== 'XLDAPR' || 值号 < 0) { 未支持 = true; return }
    const 数据块 = 子列表(未来.find(n => n.属性.name === 'XLDAPR'), 'bk')[值号]
    const 扩展列表 = 子列表(数据块, 'extLst'), 扩展 = 子列表(扩展列表[0], 'ext')
    const 属性 = 扩展[0]?.子[0]
    if (扩展列表.length !== 1 || 数据块?.子.length !== 1 || 扩展.length !== 1 || 扩展[0].属性.uri?.toUpperCase() !== 扩展标识.toUpperCase() ||
      扩展[0].子.length !== 1 || 属性?.空间 !== 动态空间 || 属性?.名称 !== 'dynamicArrayProperties' || 属性.子.length ||
      !['0', '1', 'true', 'false'].includes(属性.属性.fDynamic)) { 未支持 = true; return }
    记录.set(索引 + 1, ['1', 'true'].includes(属性.属性.fDynamic))
  })
  return { 记录, 未支持 }
}

async function 读取工作簿元数据(压缩包, 警告) {
  const 关系部件 = 压缩包.file('xl/_rels/workbook.xml.rels')
  const 关系根 = 关系部件 && 解析树(await 关系部件.async('string'))
  const 关系 = 关系根?.子.find(n => n.名称 === 'Relationship' && n.属性.Type?.endsWith('/sheetMetadata') && n.属性.TargetMode !== 'External')
  const 目标 = 关系?.属性.Target
  const 路径 = 目标 ? path.posix.normalize(目标.startsWith('/') ? 目标.slice(1) : `xl/${目标}`) : 'xl/metadata.xml'
  const 部件 = 压缩包.file(路径)
  if (!部件) return undefined
  const 结果 = 读取动态元数据(await 部件.async('string'))
  if (结果.未支持) 警告.add(未导入警告)
  return 结果.记录
}

/** ExcelJS 仅识别 date1904="1"；OOXML 也允许合法布尔文本 true/false。 */
async function 读取工作簿日期基准(压缩包) {
  const 部件 = 压缩包.file('xl/workbook.xml')
  if (!部件) return false
  const 根 = 解析树(await 部件.async('string')), 属性 = 子列表(根, 'workbookPr')
  if (属性.length > 1) throw new Error('工作簿日期基准重复')
  const 标记 = 属性[0]?.属性.date1904?.trim()
  if (标记 === undefined) return false
  if (!['0', '1', 'true', 'false'].includes(标记)) throw new Error('工作簿日期基准无效')
  return 标记 === '1' || 标记 === 'true'
}

/** ExcelJS gives an omitted orientation the constructor's portrait value.
 * Read the optional OOXML attribute before that normalization, preserving the
 * schema's default/printer choice rather than changing it during an edit.
 */
function 读取工作表打印方向(xml) {
  const 解析器 = sax.parser(true, { xmlns: true })
  let 深度 = 0, 方向 = 'default', 页设置数 = 0
  解析器.onopentag = 节点 => {
    深度 += 1
    if (深度 !== 2 || 节点.uri !== 主空间 || 节点.local !== 'pageSetup') return
    if (++页设置数 > 1) throw new Error('工作表页面设置重复')
    方向 = Object.values(节点.attributes).find(属性 => 属性.local === 'orientation' && !属性.prefix)?.value ?? 'default'
  }
  解析器.onclosetag = () => { 深度 -= 1 }
  解析器.ondoctype = () => { throw new Error('表格 XML 不支持文档类型声明') }
  解析器.write(xml).close()
  return 方向
}

function 动态元数据Xml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><metadata xmlns="${主空间}" xmlns:xda="${动态空间}"><metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes><futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="${扩展标识}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata><cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>`
}

async function 写入动态元数据(数据, 工作表地址列表) {
  if (!工作表地址列表.some(地址 => 地址.size)) return 数据
  const 压缩包 = await JSZip.loadAsync(数据)
  for (let 索引 = 0; 索引 < 工作表地址列表.length; 索引++) {
    if (!工作表地址列表[索引].size) continue
    const 路径 = `xl/worksheets/sheet${索引 + 1}.xml`
    const 部件 = 压缩包.file(路径)
    if (!部件) throw new Error('无法定位动态数组工作表')
    const 已写入 = new Set()
    压缩包.file(路径, (await 部件.async('string')).replace(/<c\b([^>]*?)>/g, (原文, 属性) => {
      const 地址 = /\br="([^"]*)"/.exec(属性)?.[1]
      if (!工作表地址列表[索引].has(地址)) return 原文
      已写入.add(地址)
      return `<c${属性.replace(/\s+cm="[^"]*"/g, '')} cm="1">`
    }))
    if (已写入.size !== 工作表地址列表[索引].size) throw new Error('动态数组单元格未能完整写入')
  }
  压缩包.file('xl/metadata.xml', 动态元数据Xml())
  const 关系路径 = 'xl/_rels/workbook.xml.rels'
  const 关系Xml = await 压缩包.file(关系路径).async('string')
  let 标识 = 'sealDynamicArrayMetadata', 序号 = 0
  while (关系Xml.includes(`Id="${标识}"`)) 标识 = `sealDynamicArrayMetadata${++序号}`
  压缩包.file(关系路径, 关系Xml.replace('</Relationships>', `<Relationship Id="${标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/></Relationships>`))
  const 类型路径 = '[Content_Types].xml'
  压缩包.file(类型路径, (await 压缩包.file(类型路径).async('string')).replace('</Types>', '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/></Types>'))
  return 压缩包.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

module.exports = { 读取动态元数据, 读取工作簿元数据, 读取工作簿日期基准, 读取工作表打印方向, 写入动态元数据, 动态元数据Xml, 未导入警告 }
