// 工作簿定义名：按原始 workbook.xml 判断，区分用户定义名与 Excel 内部保留名（_xlnm.*）。
// 打印区域与打印标题按工作表还原并写回；筛选数据库名由 Excel 按筛选自动重建，不必保存。
const { 解码Xml实体 } = require('./xmlEntities')

const 区域正则 = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}:\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/
const 行区间正则 = /^\$?[1-9]\d{0,6}:\$?[1-9]\d{0,6}$/
const 列区间正则 = /^\$?[A-Z]{1,3}:\$?[A-Z]{1,3}$/

/** 拆分以逗号分隔的引用，忽略带引号工作表名中的逗号。 */
function 拆分引用(文本) {
  const 结果 = []
  let 当前 = ''
  let 引号内 = false
  for (const 字符 of 文本) {
    if (字符 === "'") 引号内 = !引号内
    if (字符 === ',' && !引号内) { 结果.push(当前.trim()); 当前 = ''; continue }
    当前 += 字符
  }
  if (当前.trim()) 结果.push(当前.trim())
  return 结果
}

/** 去掉工作表前缀（Sheet1! 或 'Sheet 1'!）并去除 $ 符号；无法识别返回 null。 */
function 去工作表前缀(引用) {
  const 匹配 = 引用.match(/^(?:'(?:[^']|'')+'|[^'!]+)!(.+)$/)
  return 匹配 ? 匹配[1].trim() : null
}

/**
 * 解析工作簿定义名。返回
 * { 用户名称: string[], 未保留内部名: string[], 打印设置: Array<{ 打印区域?, 打印标题行?, 打印标题列? }> }
 */
async function 读取工作簿定义名(压缩包) {
  const 部件 = 压缩包.file('xl/workbook.xml')
  const 结果 = { 用户名称: [], 未保留内部名: [], 打印设置: [] }
  if (!部件) return 结果
  const xml = await 部件.async('string')
  for (const 匹配 of xml.matchAll(/<(?:[\w.-]+:)?definedName\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?definedName\s*>)/g)) {
    const 名称 = 解码Xml实体(匹配[1].match(/\bname\s*=\s*"([^"]*)"/)?.[1] ?? '', '电子表格')
    const 表索引文本 = 匹配[1].match(/\blocalSheetId\s*=\s*"(\d+)"/)?.[1]
    const 表索引 = 表索引文本 === undefined ? undefined : Number(表索引文本)
    const 内容 = 解码Xml实体(匹配[2] ?? '', '电子表格').trim()
    if (!/^_xlnm\./i.test(名称)) { 结果.用户名称.push(名称); continue }
    const 内部名 = 名称.slice(6).toLowerCase()
    if (内部名 === '_filterdatabase') continue
    if (表索引 === undefined || !['print_area', 'print_titles'].includes(内部名)) { 结果.未保留内部名.push(名称); continue }
    const 引用列表 = 拆分引用(内容).map(去工作表前缀)
    if (!引用列表.length || 引用列表.includes(null)) { 结果.未保留内部名.push(名称); continue }
    const 设置 = 结果.打印设置[表索引] ?? (结果.打印设置[表索引] = {})
    if (内部名 === 'print_area') {
      if (!引用列表.every((项) => 区域正则.test(项))) { 结果.未保留内部名.push(名称); continue }
      设置.打印区域 = 引用列表.map((项) => 项.replace(/\$/g, '')).join(',')
      continue
    }
    const 行 = 引用列表.filter((项) => 行区间正则.test(项))
    const 列 = 引用列表.filter((项) => 列区间正则.test(项))
    if (行.length > 1 || 列.length > 1 || 行.length + 列.length !== 引用列表.length) { 结果.未保留内部名.push(名称); continue }
    if (行[0]) 设置.打印标题行 = 行[0].replace(/\$/g, '')
    if (列[0]) 设置.打印标题列 = 列[0].replace(/\$/g, '')
  }
  return 结果
}

/** 校验页面设置中的打印字段，非法时抛错。 */
function 校验打印设置(页面) {
  if (!页面) return
  if (页面.打印区域 !== undefined && (typeof 页面.打印区域 !== 'string' || !页面.打印区域.split(',').every((项) => 区域正则.test(项.trim())))) throw new Error('打印区域无效')
  if (页面.打印标题行 !== undefined && (typeof 页面.打印标题行 !== 'string' || !行区间正则.test(页面.打印标题行))) throw new Error('打印标题行无效')
  if (页面.打印标题列 !== undefined && (typeof 页面.打印标题列 !== 'string' || !列区间正则.test(页面.打印标题列))) throw new Error('打印标题列无效')
}

/** 把打印区域与打印标题交给 ExcelJS 写为 _xlnm.Print_Area / _xlnm.Print_Titles。 */
function 写入打印定义名(工作表, 页面) {
  if (!页面) return
  校验打印设置(页面)
  if (页面.打印区域) 工作表.pageSetup.printArea = 页面.打印区域.split(',').map((项) => 项.trim()).join('&&')
  if (页面.打印标题行) 工作表.pageSetup.printTitlesRow = 页面.打印标题行
  if (页面.打印标题列) 工作表.pageSetup.printTitlesColumn = 页面.打印标题列
}

/** ExcelJS 写出的打印区域只锁定列（$A1:$C10），这里改为 Excel 标准的绝对引用 $A$1:$C$10。 */
async function 规范打印定义名(数据) {
  const JSZip = require('jszip')
  const 压缩包 = await JSZip.loadAsync(数据)
  const 部件 = 压缩包.file('xl/workbook.xml')
  if (!部件) return 数据
  const 原Xml = await 部件.async('string')
  const 新Xml = 原Xml.replace(/(<definedName\b[^>]*\bname="_xlnm\.Print_Area"[^>]*>)([\s\S]*?)(<\/definedName>)/g, (_全部, 开始, 内容, 结束) =>
    开始 + 内容.replace(/\$?([A-Z]{1,3})\$?([1-9]\d{0,6})/g, (_单元, 列, 行) => `$${列}$${行}`) + 结束)
  if (新Xml === 原Xml) return 数据
  压缩包.file('xl/workbook.xml', 新Xml)
  return 压缩包.generateAsync({ type: 'nodebuffer' })
}

module.exports = { 读取工作簿定义名, 写入打印定义名, 校验打印设置, 规范打印定义名 }
