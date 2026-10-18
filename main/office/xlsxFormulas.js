const sax = require('sax')

const 主命名空间 = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

function 地址位置(地址) {
  const 匹配 = /^([A-Z]{1,3})([1-9]\d{0,6})$/i.exec(地址)
  if (!匹配) return null
  const 列 = [...匹配[1].toUpperCase()].reduce((值, 字符) => 值 * 26 + 字符.charCodeAt(0) - 64, 0)
  const 行 = Number(匹配[2])
  return 列 <= 16384 && 行 <= 1048576 ? { 行, 列 } : null
}

/** 共享公式只平移引用，不改字符串、工作表名称、绝对坐标或结构化引用。 */
function 平移共享公式(公式, 来源地址, 目标地址) {
  const 来源 = 地址位置(来源地址), 目标 = 地址位置(目标地址)
  if (!来源 || !目标) throw new Error('共享公式地址无效')
  let 输出 = '', 位置 = 0
  while (位置 < 公式.length) {
    const 字符 = 公式[位置]
    if (字符 === '"' || 字符 === "'") {
      const 引号 = 字符, 开始 = 位置++
      while (位置 < 公式.length) {
        if (公式[位置++] === 引号) {
          if (公式[位置] === 引号) { 位置 += 1; continue }
          break
        }
      }
      输出 += 公式.slice(开始, 位置)
      continue
    }
    if (字符 === '[') {
      const 开始 = 位置++
      let 深度 = 1
      while (位置 < 公式.length && 深度) {
        if (公式[位置] === '[') 深度 += 1
        if (公式[位置] === ']') 深度 -= 1
        位置 += 1
      }
      输出 += 公式.slice(开始, 位置)
      continue
    }
    const 余下 = 公式.slice(位置)
    const 表名前缀 = /^[\p{L}_\\][\p{L}\p{N}_.\\]*!/u.exec(余下)
    if (表名前缀) { 输出 += 表名前缀[0]; 位置 += 表名前缀[0].length; continue }
    const 匹配 = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})(?![\p{L}\p{N}_.(!])/u.exec(余下)
    const 前字符 = 公式[位置 - 1] ?? ''
    const 原位置 = 匹配 ? 地址位置(`${匹配[2]}${匹配[4]}`) : null
    if (匹配 && 原位置 && !/[\p{L}\p{N}_.]/u.test(前字符)) {
      const 列 = 原位置.列 + (匹配[1] ? 0 : 目标.列 - 来源.列)
      const 行 = 原位置.行 + (匹配[3] ? 0 : 目标.行 - 来源.行)
      if (列 < 1 || 列 > 16384 || 行 < 1 || 行 > 1048576) 输出 += '#REF!'
      else {
        let 列名 = ''
        for (let 数 = 列; 数 > 0; 数 = Math.floor((数 - 1) / 26)) 列名 = String.fromCharCode(65 + (数 - 1) % 26) + 列名
        输出 += `${匹配[1]}${列名}${匹配[3]}${行}`
      }
      位置 += 匹配[0].length
    } else { 输出 += 字符; 位置 += 1 }
  }
  return 输出
}

/** 直接读取 OOXML 缓存，避免 ExcelJS 丢空字符串及共享公式中的文本引用。 */
function 读取原始公式(xml, 警告 = new Set(), 单元元数据, 原始数字) {
  const 解析器 = sax.parser(true, { xmlns: true })
  const 单元列表 = [], 主公式 = new Map()
  const 标签栈 = []
  let 单元, 字段
  解析器.onopentag = 节点 => {
    const 父节点 = 标签栈.at(-1)
    标签栈.push(节点)
    if (节点.uri !== 主命名空间) return
    if (节点.local === 'c' && 父节点?.local === 'row' && 父节点.uri === 主命名空间) 单元 = { 地址: 节点.attributes.r?.value, 类型: 节点.attributes.t?.value, 元数据索引: 节点.attributes.cm?.value }
    else if (单元 && 父节点?.local === 'c' && 父节点.uri === 主命名空间 && 节点.local === 'f') {
      单元.公式 = ''; 单元.属性 = Object.fromEntries(Object.values(节点.attributes).map(属性 => [属性.local, 属性.value])); 字段 = '公式'
    } else if (单元 && 父节点?.local === 'c' && 父节点.uri === 主命名空间 && 节点.local === 'v') { 单元.缓存 = ''; 字段 = '缓存' }
  }
  解析器.ontext = 文本 => { if (单元 && 字段) 单元[字段] += 文本 }
  解析器.oncdata = 解析器.ontext
  解析器.onclosetag = () => {
    const 节点 = 标签栈.pop()
    if (节点.uri !== 主命名空间) return
    const 名称 = 节点.local
    if (名称 === 'f' || 名称 === 'v') 字段 = undefined
    if (名称 === 'c' && 单元) {
      if (原始数字 && 地址位置(单元.地址 ?? '') && (单元.类型 === undefined || 单元.类型 === 'n') &&
        typeof 单元.缓存 === 'string' && 单元.缓存.trim() !== '' && Number.isFinite(Number(单元.缓存))) 原始数字[单元.地址] = Number(单元.缓存)
      if (单元.公式 !== undefined && 地址位置(单元.地址 ?? '')) {
        单元列表.push(单元)
        if (单元.属性.t === 'shared' && 单元.公式) 主公式.set(单元.属性.si, 单元)
      }
      单元 = undefined
    }
  }
  解析器.ondoctype = () => { throw new Error('表格 XML 不支持文档类型声明') }
  解析器.write(xml).close()
  const 来源 = {}
  for (const 单元 of 单元列表) {
    if (单元.属性.t === 'dataTable') { 警告.add('模拟运算表公式未导入'); continue }
    let 公式 = 单元.公式
    if (!公式 && 单元.属性.t === 'shared') {
      const 主单元 = 主公式.get(单元.属性.si)
      if (!主单元) throw new Error(`共享公式 ${单元.地址} 缺少主公式，已阻止不完整导入`)
      公式 = 平移共享公式(主单元.公式, 主单元.地址, 单元.地址)
    }
    if (!公式) continue
    let 结果
    if (单元.缓存 !== undefined) {
      if (单元.类型 === 'str') 结果 = 单元.缓存
      else if (单元.类型 === 'b') 结果 = 单元.缓存 === '1' || 单元.缓存 === 'true'
      else if (单元.类型 === 'e') 结果 = { error: 单元.缓存 }
      else if (单元.缓存.trim() !== '' && Number.isFinite(Number(单元.缓存))) 结果 = Number(单元.缓存)
    }
    const 有元数据 = 单元.元数据索引 !== undefined && 单元.元数据索引 !== '0'
    if (有元数据 && !单元元数据?.has(Number(单元.元数据索引))) 警告.add('动态数组或其他单元格元数据未导入，已保留可读取的公式及缓存')
    来源[单元.地址] = { 原始值: `=${公式}`, ...(结果 !== undefined ? { 结果 } : {}),
      ...(有元数据 && 单元元数据?.get(Number(单元.元数据索引)) === true ? { 动态数组: true } : {}),
      ...(单元.属性.t === 'array' && 单元.属性.ref ? { 数组范围: 单元.属性.ref } : {}) }
  }
  return 来源
}

function 展开共享公式Xml(xml, 来源) {
  return xml.replace(/<c\b([^>]*?)>([\s\S]*?)<\/c>/g, (原文, 属性, 内容) => {
    const 地址 = /\br\s*=\s*(["'])(.*?)\1/.exec(属性)?.[2]
    if (!地址 || !来源[地址]) return 原文
    const 新内容 = 内容.replace(/<f\b([^>]*?)(?:\/>|>[\s\S]*?<\/f>)/g, (公式Xml, 公式属性) => {
      if (!/\bt\s*=\s*(["'])shared\1/.test(公式属性)) return 公式Xml
      const 文本 = 来源[地址].原始值.slice(1).replace(/[&<>"']/g, 字符 => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[字符])
      return `<f>${文本}</f>`
    })
    return 新内容 === 内容 ? 原文 : `<c${属性}>${新内容}</c>`
  })
}

module.exports = { 读取原始公式, 平移共享公式, 展开共享公式Xml }
