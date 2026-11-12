// 工作表自动筛选的完整读写：多列、多值（含空白）、自定义条件、排序状态与绝对引用范围。
// 无法解析的子元素降级为“原始 XML 原样写回”，不再整体丢弃并阻断编辑。
const { 解码Xml实体 } = require('./xmlEntities')

const 运算符集合 = new Set(['equal', 'notEqual', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'])
const 筛选块正则 = /<autoFilter\b([^>]*?)(?:\/>|>([\s\S]*?)<\/autoFilter\s*>)/

function 读取属性(标记, 名称) {
  const 匹配 = 标记.match(new RegExp(`(?:^|\\s)${名称}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))
  return 匹配 ? 匹配[1] ?? 匹配[2] : undefined
}

function 属性名列表(属性文本) {
  return [...属性文本.matchAll(/([\w:.-]+)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map((匹配) => 匹配[1])
}

function 转义属性(文本) {
  return String(文本).replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[字符]))
}

function 列号(字母) {
  return [...字母].reduce((值, 字符) => 值 * 26 + 字符.charCodeAt(0) - 64, 0) - 1
}

function 列名(序号) {
  let 结果 = ''
  for (let 当前 = 序号 + 1; 当前 > 0; 当前 = Math.floor((当前 - 1) / 26)) 结果 = String.fromCharCode(65 + (当前 - 1) % 26) + 结果
  return 结果
}

/** 解析筛选范围，接受 A1:B10、$A$1:$B$10 与单格形式；返回 0 起始的行列边界。 */
function 解析筛选范围(范围) {
  const 匹配 = typeof 范围 === 'string' && 范围.trim().match(/^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})(?::\$?([A-Z]{1,3})\$?([1-9]\d{0,6}))?$/i)
  if (!匹配) return null
  const 起列 = 列号(匹配[1].toUpperCase()), 起行 = Number(匹配[2]) - 1
  const 止列 = 匹配[3] ? 列号(匹配[3].toUpperCase()) : 起列, 止行 = 匹配[4] ? Number(匹配[4]) - 1 : 起行
  if (止列 < 起列 || 止行 < 起行 || 止列 >= 16384 || 止行 >= 1048576) return null
  return { 起列, 起行, 止列, 止行, 文本: `${列名(起列)}${起行 + 1}:${列名(止列)}${止行 + 1}` }
}

/** 解析单个 filterColumn 的内容；无法完整表达时返回 null，由调用方保留原始 XML。 */
function 解析列内容(属性文本, 内容) {
  if (属性名列表(属性文本).some((名称) => 名称 !== 'colId')) return null
  const 正文 = (内容 ?? '').trim()
  const 值筛选 = 正文.match(/^<filters\b([^>]*?)(?:\/>|>([\s\S]*?)<\/filters\s*>)$/)
  if (值筛选) {
    if (属性名列表(值筛选[1]).some((名称) => 名称 !== 'blank')) return null
    const 子项 = (值筛选[2] ?? '').trim()
    const 值列表 = []
    const 剩余 = 子项.replace(/<filter\b([^>]*?)\/>/g, (_全部, 属性) => {
      const 值 = 读取属性(属性, 'val')
      if (值 !== undefined && 属性名列表(属性).every((名称) => 名称 === 'val')) 值列表.push(解码Xml实体(值, '电子表格'))
      else 值列表.push(null)
      return ''
    }).trim()
    if (剩余 !== '' || 值列表.includes(null)) return null
    const 空白 = ['1', 'true'].includes(读取属性(值筛选[1], 'blank') ?? '')
    if (!空白 && 值列表.length === 0) return null
    return { ...(值列表.length ? { 值列表 } : {}), ...(空白 ? { 空白: true } : {}) }
  }
  const 自定义 = 正文.match(/^<customFilters\b([^>]*?)(?:\/>|>([\s\S]*?)<\/customFilters\s*>)$/)
  if (自定义) {
    if (属性名列表(自定义[1]).some((名称) => 名称 !== 'and')) return null
    const 条件 = []
    const 剩余 = (自定义[2] ?? '').trim().replace(/<customFilter\b([^>]*?)\/>/g, (_全部, 属性) => {
      const 运算符 = 读取属性(属性, 'operator') ?? 'equal'
      const 值 = 读取属性(属性, 'val')
      条件.push(运算符集合.has(运算符) && 值 !== undefined && 属性名列表(属性).every((名称) => ['operator', 'val'].includes(名称))
        ? { 运算符, 值: 解码Xml实体(值, '电子表格') } : null)
      return ''
    }).trim()
    if (剩余 !== '' || 条件.length === 0 || 条件.length > 2 || 条件.includes(null)) return null
    return { 自定义: { 且: ['1', 'true'].includes(读取属性(自定义[1], 'and') ?? ''), 条件 } }
  }
  return null
}

/**
 * 从工作表 XML 读取筛选。返回值：
 * - undefined：没有自动筛选；
 * - null：自动筛选范围本身无效，无法保留；
 * - 筛选模型：{ 范围, 列条件, 排序状态Xml?, 扩展Xml? }，列号为工作表绝对列（0 起始）。
 */
function 从Xml读取筛选(工作表Xml) {
  const 匹配 = 工作表Xml.match(筛选块正则)
  if (!匹配) return undefined
  const 范围 = 解析筛选范围(读取属性(匹配[1], 'ref'))
  if (!范围) return null
  const 列条件 = []
  let 排序状态Xml
  const 扩展 = []
  const 内容 = 匹配[2] ?? ''
  const 子元素正则 = /<(filterColumn|sortState|extLst)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/g
  let 上次位置 = 0
  for (const 子项 of 内容.matchAll(子元素正则)) {
    if (内容.slice(上次位置, 子项.index).trim() !== '') return null
    上次位置 = 子项.index + 子项[0].length
    if (子项[1] === 'sortState') { 排序状态Xml = 子项[0]; continue }
    if (子项[1] === 'extLst') { 扩展.push(子项[0]); continue }
    const 相对列 = Number(读取属性(子项[2], 'colId'))
    if (!Number.isInteger(相对列) || 相对列 < 0 || 范围.起列 + 相对列 > 范围.止列) return null
    const 列 = 范围.起列 + 相对列
    if (列条件.some((项) => 项.列 === 列)) return null
    const 解析 = 解析列内容(子项[2], 子项[3])
    列条件.push(解析 ? { 列, ...解析 } : { 列, 原始Xml: 子项[0] })
  }
  if (内容.slice(上次位置).trim() !== '') return null
  列条件.sort((左, 右) => 左.列 - 右.列)
  return { 范围: 范围.文本, 列条件, ...(排序状态Xml ? { 排序状态Xml } : {}), ...(扩展.length ? { 扩展Xml: 扩展.join('') } : {}) }
}

/** 筛选中是否含有本机无法解释、仅原样保留的部分。 */
function 含降级条件(筛选) {
  return !!筛选 && (筛选.列条件 ?? []).some((项) => typeof 项.原始Xml === 'string')
}

/**
 * 把旧版 { 列, 值 } 或新模型统一为新模型，并校验字段。
 * 旧版没有范围时以 A1 起，覆盖到数据的最后一行与最后一列（与旧版写入行为一致）。
 */
function 规范筛选(筛选, 数据 = []) {
  if (!筛选 || typeof 筛选 !== 'object') return undefined
  if (!Array.isArray(筛选.列条件)) {
    const { 列, 值 } = 筛选
    if (!Number.isInteger(列) || 列 < 0 || typeof 值 !== 'string') throw new Error('工作表筛选条件无效')
    const 最后行 = Math.max(2, 数据.length)
    const 最后列 = Math.max(列 + 1, ...数据.map((行) => Array.isArray(行) ? 行.length : 1))
    return { 范围: `A1:${列名(最后列 - 1)}${最后行}`, 列条件: [值 === '' ? { 列, 空白: true } : { 列, 值列表: [值] }] }
  }
  const 范围 = 解析筛选范围(筛选.范围)
  if (!范围) throw new Error('工作表筛选范围无效')
  const 已用列 = new Set()
  const 列条件 = 筛选.列条件.map((条件) => {
    if (!条件 || !Number.isInteger(条件.列) || 条件.列 < 范围.起列 || 条件.列 > 范围.止列 || 已用列.has(条件.列)) throw new Error('工作表筛选列无效')
    已用列.add(条件.列)
    if (typeof 条件.原始Xml === 'string') {
      if (!/^<filterColumn\b[\s\S]*(?:\/>|<\/filterColumn\s*>)$/.test(条件.原始Xml.trim())) throw new Error('工作表筛选原始条件无效')
      // 列号以模型为准，原始片段中的相对列号随范围起点同步，保证写后自校验一致。
      return { 列: 条件.列, 原始Xml: 条件.原始Xml.replace(/(<filterColumn\b[^>]*?\bcolId\s*=\s*)(?:"[^"]*"|'[^']*')/, `$1"${条件.列 - 范围.起列}"`) }
    }
    const 结果 = { 列: 条件.列 }
    if (条件.自定义 !== undefined) {
      const 列表 = 条件.自定义?.条件
      if (!Array.isArray(列表) || 列表.length === 0 || 列表.length > 2 || 列表.some((项) => !运算符集合.has(项?.运算符) || typeof 项.值 !== 'string')) throw new Error('工作表自定义筛选条件无效')
      结果.自定义 = { 且: 条件.自定义.且 === true, 条件: 列表.map((项) => ({ 运算符: 项.运算符, 值: 项.值 })) }
      return 结果
    }
    if (条件.值列表 !== undefined && (!Array.isArray(条件.值列表) || 条件.值列表.some((值) => typeof 值 !== 'string'))) throw new Error('工作表筛选值无效')
    if (条件.值列表?.length) 结果.值列表 = [...条件.值列表]
    if (条件.空白 === true) 结果.空白 = true
    if (!结果.值列表 && !结果.空白) throw new Error('工作表筛选条件为空')
    return 结果
  }).sort((左, 右) => 左.列 - 右.列)
  if (筛选.排序状态Xml !== undefined && (typeof 筛选.排序状态Xml !== 'string' || !/^<sortState\b[\s\S]*(?:\/>|<\/sortState\s*>)$/.test(筛选.排序状态Xml.trim()))) throw new Error('工作表排序状态无效')
  if (筛选.扩展Xml !== undefined && (typeof 筛选.扩展Xml !== 'string' || !/^<extLst\b[\s\S]*<\/extLst\s*>$/.test(筛选.扩展Xml.trim()))) throw new Error('工作表筛选扩展数据无效')
  return { 范围: 范围.文本, 列条件, ...(筛选.排序状态Xml ? { 排序状态Xml: 筛选.排序状态Xml } : {}), ...(筛选.扩展Xml ? { 扩展Xml: 筛选.扩展Xml } : {}) }
}

/** 由规范后的模型生成 autoFilter XML。 */
function 生成筛选Xml(筛选) {
  const 范围 = 解析筛选范围(筛选.范围)
  const 列Xml = 筛选.列条件.map((条件) => {
    if (条件.原始Xml) return 条件.原始Xml.replace(/(<filterColumn\b[^>]*?\bcolId\s*=\s*)(?:"[^"]*"|'[^']*')/, `$1"${条件.列 - 范围.起列}"`)
    const 列 = 条件.列 - 范围.起列
    if (条件.自定义) {
      const 子项 = 条件.自定义.条件.map((项) => `<customFilter${项.运算符 === 'equal' ? '' : ` operator="${项.运算符}"`} val="${转义属性(项.值)}"/>`).join('')
      return `<filterColumn colId="${列}"><customFilters${条件.自定义.且 ? ' and="1"' : ''}>${子项}</customFilters></filterColumn>`
    }
    const 值 = (条件.值列表 ?? []).map((项) => `<filter val="${转义属性(项)}"/>`).join('')
    const 空白 = 条件.空白 ? ' blank="1"' : ''
    return `<filterColumn colId="${列}">${值 ? `<filters${空白}>${值}</filters>` : `<filters${空白}/>`}</filterColumn>`
  }).join('')
  const 内容 = `${列Xml}${筛选.排序状态Xml ?? ''}${筛选.扩展Xml ?? ''}`
  return 内容 ? `<autoFilter ref="${范围.文本}">${内容}</autoFilter>` : `<autoFilter ref="${范围.文本}"/>`
}

/** 在工作表 XML 中替换（自闭合或非自闭合的）autoFilter，并重新解析自校验。 */
function 替换工作表筛选Xml(原Xml, 筛选) {
  const 规范 = 规范筛选(筛选)
  if (!筛选块正则.test(原Xml)) throw new Error('无法写入工作表筛选条件')
  const 新筛选 = 生成筛选Xml(规范)
  // 用函数替换，避免值中的 $& 等被当作替换模式。
  const 新Xml = 原Xml.replace(筛选块正则, () => 新筛选)
  if (JSON.stringify(从Xml读取筛选(新Xml)) !== JSON.stringify(规范)) throw new Error('筛选条件写入后校验不一致，已阻止保存')
  return 新Xml
}

function 是数值(文本) {
  return typeof 文本 === 'string' && 文本.trim() !== '' && Number.isFinite(Number(文本.trim()))
}

/** Excel 通配符：* 任意多字符、? 单字符、~ 转义。 */
function 通配符正则(模式) {
  let 结果 = ''
  for (let 位置 = 0; 位置 < 模式.length; 位置 += 1) {
    const 字符 = 模式[位置]
    if (字符 === '~' && 位置 + 1 < 模式.length) { 结果 += 模式[++位置].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    结果 += 字符 === '*' ? '[\\s\\S]*' : 字符 === '?' ? '[\\s\\S]' : 字符.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${结果}$`, 'i')
}

function 满足单条(文本, { 运算符, 值 }) {
  if (是数值(文本) && 是数值(值)) {
    const 左 = Number(文本), 右 = Number(值)
    return { equal: 左 === 右, notEqual: 左 !== 右, greaterThan: 左 > 右, greaterThanOrEqual: 左 >= 右, lessThan: 左 < 右, lessThanOrEqual: 左 <= 右 }[运算符]
  }
  if (运算符 === 'equal' || 运算符 === 'notEqual') {
    const 相等 = /[*?~]/.test(值) ? 通配符正则(值).test(文本) : 文本.toLowerCase() === 值.toLowerCase()
    return 运算符 === 'equal' ? 相等 : !相等
  }
  // 数值比较遇到空白或文本时不满足，与 Excel 行为一致。
  if (文本 === '' || 是数值(值)) return false
  const 比较 = 文本.toLowerCase().localeCompare(值.toLowerCase())
  return { greaterThan: 比较 > 0, greaterThanOrEqual: 比较 >= 0, lessThan: 比较 < 0, lessThanOrEqual: 比较 <= 0 }[运算符]
}

/** 单列条件判断；原样保留的条件无法解释，视为满足（不据此隐藏行）。 */
function 满足列条件(文本, 条件) {
  const 值 = 文本 ?? ''
  if (条件.原始Xml) return true
  if (条件.自定义) {
    const 结果 = 条件.自定义.条件.map((项) => 满足单条(值, 项))
    return 条件.自定义.且 ? 结果.every(Boolean) : 结果.some(Boolean)
  }
  if (值 === '') return 条件.空白 === true
  const 小写 = 值.toLowerCase()
  return (条件.值列表 ?? []).some((项) => 项.toLowerCase() === 小写)
}

/**
 * 按 AND 组合各列条件判断某一数据行是否显示。
 * 取文本(行, 列) 使用 0 起始行列号，返回单元格显示文本。
 */
function 行满足筛选(筛选, 行, 取文本) {
  return 筛选.列条件.every((条件) => 满足列条件(取文本(行, 条件.列), 条件))
}

/** 返回筛选应隐藏的数据行（0 起始，不含表头行）。 */
function 计算隐藏行(筛选, 取文本) {
  const 范围 = 解析筛选范围(筛选?.范围)
  const 隐藏 = []
  if (!范围) return 隐藏
  for (let 行 = 范围.起行 + 1; 行 <= 范围.止行; 行 += 1) if (!行满足筛选(筛选, 行, 取文本)) 隐藏.push(行)
  return 隐藏
}

module.exports = { 从Xml读取筛选, 规范筛选, 生成筛选Xml, 替换工作表筛选Xml, 解析筛选范围, 含降级条件, 行满足筛选, 计算隐藏行, 满足列条件 }
