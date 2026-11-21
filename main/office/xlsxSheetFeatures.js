const sax = require('sax')
const { 解析筛选范围 } = require('./xlsxFilter')

const 表格属性 = {
  table: ['id', 'name', 'displayName', 'ref', 'headerRowCount', 'totalsRowCount', 'totalsRowShown', 'mc:Ignorable'],
  tableColumns: ['count'],
  tableColumn: ['id', 'name'],
  tableStyleInfo: ['name', 'showFirstColumn', 'showLastColumn', 'showRowStripes', 'showColumnStripes'],
}
const 表格名称 = /^[\p{L}_][\p{L}\p{N}_.]{0,254}$/u
const 颜色格式 = /^FF[0-9A-F]{6}$/i
const 条件表达式 = /^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}\s*(?:=|<>)\s*"(?:[^"]|"")*"$/i

function 范围(引用) {
  if (typeof 引用 !== 'string' || !/^[A-Z]{1,3}[1-9]\d{0,6}(?::[A-Z]{1,3}[1-9]\d{0,6})?$/.test(引用)) return null
  return 解析筛选范围(引用)
}

function 表格有效(表格) {
  const 位置 = 范围(表格?.范围)
  return 位置 && (位置.止行 - 位置.起行 + 1) * (位置.止列 - 位置.起列 + 1) <= 100000 &&
    位置.止行 > 位置.起行 && 表格名称.test(表格.名称) &&
    表格.样式 === 'TableStyleLight1' && typeof 表格.带状行 === 'boolean' &&
    Array.isArray(表格.列) && 表格.列.length === 位置.止列 - 位置.起列 + 1 &&
    表格.列.every(列 => typeof 列 === 'string' && 列.trim() && 列.length <= 255) &&
    new Set(表格.列.map(列 => 列.toUpperCase())).size === 表格.列.length
}

function 解析表格(xml) {
  const 解析器 = sax.parser(true)
  let 无法保留 = false, 根属性, 样式
  const 列 = []
  解析器.onopentag = ({ name, attributes }) => {
    if (!Object.hasOwn(表格属性, name) || Object.keys(attributes).some(键 => 键 !== 'xmlns' && !键.startsWith('xmlns:') && !表格属性[name].includes(键))) {
      无法保留 = true
      return
    }
    if (name === 'table') 根属性 = attributes
    if (name === 'tableColumn') 列.push(attributes.name)
    if (name === 'tableStyleInfo') 样式 = attributes
  }
  解析器.ondoctype = () => { 无法保留 = true }
  解析器.write(xml).close()
  if (无法保留 || 根属性?.headerRowCount !== '1' || 根属性.totalsRowCount && 根属性.totalsRowCount !== '0' ||
      根属性.name !== 根属性.displayName || !样式 ||
      ['showFirstColumn','showLastColumn','showColumnStripes'].some(键 => 样式[键] !== undefined && !['0','false'].includes(样式[键]))) return null
  const 模型 = { 名称: 根属性.name, 范围: 根属性.ref, 列, 样式: 样式.name, 带状行: ['1','true'].includes(样式.showRowStripes) }
  return 表格有效(模型) ? 模型 : null
}

function 规则有效(规则) {
  return 范围(规则?.范围) && typeof 规则.公式 === 'string' && 规则.公式.length <= 1024 && 条件表达式.test(规则.公式) &&
    Number.isSafeInteger(规则.优先级) && 规则.优先级 > 0 && (规则.字体颜色 || 规则.填充颜色) &&
    (规则.字体颜色 === undefined || 颜色格式.test(规则.字体颜色)) &&
    (规则.填充颜色 === undefined || 颜色格式.test(规则.填充颜色)) &&
    (规则.填充方式 === undefined || ['背景色', '纯色'].includes(规则.填充方式))
}

function 读取规则(ref, rule) {
  const style = rule.style
  if (rule.type !== 'expression' || rule.formulae?.length !== 1 || !style ||
      Object.entries(style).some(([键, 值]) => 值 != null && !['font','fill'].includes(键)) ||
      Object.keys(style.font ?? {}).some(键 => 键 !== 'color')) return null
  const fill = style.fill
  if (fill && (fill.type !== 'pattern' || (fill.pattern === 'solid' ? (!fill.fgColor?.argb || fill.bgColor) : (fill.pattern || fill.fgColor || !fill.bgColor?.argb)))) return null
  if (style.font && !style.font.color?.argb) return null
  const 规则 = {
    范围: ref, 公式: rule.formulae[0], 优先级: rule.priority,
    ...(style.font ? { 字体颜色: style.font.color.argb.toUpperCase() } : {}),
    ...(fill ? { 填充颜色: (fill.fgColor ?? fill.bgColor).argb.toUpperCase(), 填充方式: fill.pattern === 'solid' ? '纯色' : '背景色' } : {}),
  }
  return 规则有效(规则) ? 规则 : null
}

async function 读取表格功能(工作簿, 压缩包, 工作表路径) {
  const 定义 = new Map()
  let 有表格损失 = false, 有规则损失 = false
  for (const 部件 of 压缩包.file(/^xl\/tables\/[^/]+\.xml$/i)) {
    const 表 = 解析表格(await 部件.async('string'))
    if (表 && !定义.has(表.名称)) 定义.set(表.名称, 表)
    else 有表格损失 = true
  }
  const 数据 = await Promise.all(工作簿.worksheets.map(async (工作表, 索引) => {
    const 结构化表格 = []
    for (const 项 of 工作表.getTables()) {
      const 表 = 定义.get(项.table?.name)
      if (表) {
        const 起 = 范围(表.范围)
        if (表.列.every((名称, 列) => 工作表.getCell(起.起行 + 1, 起.起列 + 列 + 1).text === 名称)) {
          结构化表格.push(表)
          定义.delete(表.名称)
          continue
        }
      }
      有表格损失 = true
    }
    const xml = await 压缩包.file(工作表路径[索引] ?? '')?.async('string') ?? ''
    const 条件格式 = (工作表.conditionalFormattings ?? []).flatMap(组 => 组.rules.map(规则 => 读取规则(组.ref, 规则))).filter(Boolean)
    const 规则节点 = [...xml.matchAll(/<cfRule\b([^>]*)>/g)]
    if (规则节点.length !== 条件格式.length || /<(?:\w+:)?conditionalFormattings\b/.test(xml) ||
        规则节点.some(节点 => /\bstopIfTrue\s*=\s*["'](?:1|true)["']/.test(节点[1]))) {
      有规则损失 = true
      return { 结构化表格, 条件格式: [] }
    }
    return { 结构化表格, 条件格式 }
  }))
  return { 数据, 警告: [...(有表格损失 || 定义.size ? ['结构化表格未导入'] : []), ...(有规则损失 ? ['条件格式未导入'] : [])] }
}

function 写入表格功能(工作表, 模型, 无筛选表格) {
  const tables = 模型.结构化表格 ?? [], rules = 模型.条件格式 ?? []
  if (!Array.isArray(tables) || tables.length > 1000 || !tables.every(表格有效)) throw new Error('结构化表格数据无效')
  if (!Array.isArray(rules) || rules.length > 1000 || !rules.every(规则有效)) throw new Error('条件格式数据无效')
  for (const 表 of tables) {
    const 起 = 范围(表.范围)
    const 列名 = 表.列.map((_, 索引) => 工作表.getCell(起.起行 + 1, 起.起列 + 索引 + 1).value)
    if (!列名.every(名 => typeof 名 === 'string' && 名.trim() && 名.length <= 255) ||
        new Set(列名.map(名 => 名.toUpperCase())).size !== 列名.length || 无筛选表格.has(表.名称.toUpperCase())) throw new Error('结构化表格名称和表头必须有效且唯一')
    const 行 = []
    for (let i = 起.起行 + 1; i <= 起.止行; i++) {
      行.push(列名.map((_, 列) => 工作表.getCell(i + 1, 起.起列 + 列 + 1).value))
    }
    工作表.addTable({
      name: 表.名称, ref: 表.范围.split(':')[0], headerRow: true, totalsRow: false,
      style: { theme: 表.样式, showRowStripes: 表.带状行 },
      columns: 列名.map(name => ({ name, filterButton: false })),
      rows: 行,
    })
    无筛选表格.add(表.名称.toUpperCase())
  }
  for (const 规则 of rules) {
    const style = {}
    if (规则.字体颜色) style.font = { color: { argb: 规则.字体颜色 } }
    if (规则.填充颜色) style.fill = 规则.填充方式 === '纯色'
      ? { type:'pattern', pattern:'solid', fgColor:{ argb:规则.填充颜色 } }
      : { type:'pattern', bgColor:{ argb:规则.填充颜色 } }
    工作表.addConditionalFormatting({ ref: 规则.范围, rules: [{ type:'expression', formulae:[规则.公式], priority:规则.优先级, style }] })
  }
}

async function 移除生成表格的筛选(数据, JSZip, 无筛选表格) {
  if (!无筛选表格.size) return 数据
  const 包 = await JSZip.loadAsync(数据)
  for (const 部件 of 包.file(/^xl\/tables\/[^/]+\.xml$/i)) {
    const xml = await 部件.async('string')
    const 表格 = /<table\b[^>]*\bname="([^"]+)"/.exec(xml)?.[1]
    if (表格 && 无筛选表格.has(表格.toUpperCase())) {
      const 正文 = xml.replace(/<autoFilter\b[^>]*(?:\/>|>[\s\S]*?<\/autoFilter>)/, '')
        .replace(/(<table\b[^>]*?)\btotalsRowShown="1"/, '$1totalsRowShown="0"')
        .replace(/<tableColumn\b[^>]*>/g, 标签 => 标签.replace(/\s+totalsRow(?:Label|Function)="[^"]*"/g, ''))
      包.file(部件.name, 正文)
    }
  }
  return 包.generateAsync({ type:'nodebuffer', compression:'DEFLATE' })
}

module.exports = { 读取表格功能, 写入表格功能, 移除生成表格的筛选 }
