const sax = require('sax')

// XML 前缀是别名，不是文件格式的一部分。只按已知 URI 识别标准节点，
// 为现有读取器提供统一拼写；保留第三方扩展，绝不全局替换正文字符串。
const 标准名称 = new Map([
  ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w'],
  ['http://schemas.openxmlformats.org/presentationml/2006/main', 'p'],
  ['http://schemas.openxmlformats.org/drawingml/2006/main', 'a'],
  ['http://schemas.openxmlformats.org/drawingml/2006/picture', 'pic'],
  ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'wp'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'r'],
  ['http://schemas.openxmlformats.org/officeDocument/2006/math', 'm'],
  ['http://schemas.openxmlformats.org/markup-compatibility/2006', 'mc'],
  ['http://schemas.openxmlformats.org/package/2006/relationships', ''],
  ['http://schemas.openxmlformats.org/package/2006/content-types', ''],
])
const 严格名称 = new Map([
  ['wordprocessingml/main', 'wordprocessingml/2006/main'],
  ['presentationml/main', 'presentationml/2006/main'],
  ['drawingml/main', 'drawingml/2006/main'],
  ['drawingml/picture', 'drawingml/2006/picture'],
  ['drawingml/wordprocessingDrawing', 'drawingml/2006/wordprocessingDrawing'],
  ['officeDocument/relationships', 'officeDocument/2006/relationships'],
  ['officeDocument/math', 'officeDocument/2006/math'],
].map(([源, 目标]) => [`http://purl.oclc.org/ooxml/${源}`, `http://schemas.openxmlformats.org/${目标}`]))
const 声明空间 = 'http://www.w3.org/2000/xmlns/'
const 关系空间 = 'http://schemas.openxmlformats.org/package/2006/relationships'
const 兼容空间 = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const 标准Uri = uri => 严格名称.get(uri) ?? uri
const 转义 = value => String(value).replace(/[&<>"'\r\n\t]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  '\r': '&#13;', '\n': '&#10;', '\t': '&#9;',
})[char])

function 规范OfficeXml(xml) {
  if (![...标准名称.keys(), ...严格名称.keys()].some(uri => xml.includes(uri))) return xml
  if (/<!DOCTYPE\b/i.test(xml)) throw new Error('Office XML 不支持文档类型声明')
  const 保留前缀 = new Set([...标准名称.values()].filter(Boolean))
  const declarations = [...xml.matchAll(/\bxmlns(?::([\w.-]+))?\s*=\s*(["'])(.*?)\2/g)]
  if (!xml.includes('http://purl.oclc.org/ooxml/officeDocument/relationships/') &&
      !declarations.some(([, prefix = '', , uri]) => 严格名称.has(uri) ||
      (标准名称.has(uri) ? 标准名称.get(uri) !== prefix : 保留前缀.has(prefix)))) return xml
  const parser = sax.parser(true, { xmlns: true })
  const output = [], stack = [], 外部别名 = new Map()
  let changed = false, roots = 0, cursor = 0
  parser.onopentag = node => {
    if (!stack.length) roots++
    const scope = { ...(stack.at(-1)?.scope ?? { xml: 'http://www.w3.org/XML/1998/namespace' }) }
    const declarations = new Map()
    for (const attr of Object.values(node.attributes)) {
      if (attr.uri !== 声明空间) continue
      const prefix = attr.name === 'xmlns' ? '' : attr.local
      const uri = 标准Uri(attr.value)
      if (uri !== attr.value) changed = true
      declarations.set(prefix, uri)
      scope[prefix] = uri
    }
    const bind = (prefix, uri) => {
      if ((scope[prefix] ?? '') !== uri) {
        declarations.set(prefix, uri)
        scope[prefix] = uri
      }
    }
    const 外部前缀 = uri => {
      let prefix = 外部别名.get(uri)
      if (!prefix) {
        let index = 外部别名.size + 1
        do { prefix = `sealExt${index++}` } while (prefix in node.ns || prefix in scope)
        外部别名.set(uri, prefix)
      }
      return prefix
    }
    // 先为声明分配稳定别名，避免 mc:Ignorable 等 QName 值取决于属性顺序，
    // 也避免在原生对象片段深处临时插入 xmlns，破坏其现有完整性核对。
    for (const [prefix, uri] of [...declarations]) {
      if (!标准名称.has(uri) && 保留前缀.has(prefix)) bind(外部前缀(uri), uri)
    }
    for (const uri of [...declarations.values()]) {
      if (标准名称.has(uri)) bind(标准名称.get(uri), uri)
    }
    const name = (item, attribute = false) => {
      const uri = 标准Uri(item.uri)
      let prefix = 标准名称.get(uri) ?? item.prefix
      if (!标准名称.has(uri) && 保留前缀.has(prefix)) {
        prefix = 外部前缀(uri)
      }
      if (!attribute || prefix) bind(prefix, uri)
      const result = prefix ? `${prefix}:${item.local}` : item.local
      if (result !== item.name) changed = true
      return result
    }
    const tag = name(node)
    const attrs = new Map(Object.values(node.attributes).filter(attr => attr.uri !== 声明空间).map(attr => {
      const key = name(attr, true)
      let value = attr.value
      if (标准Uri(node.uri) === 关系空间 && node.local === 'Relationship' && attr.name === 'Type' &&
          value.startsWith('http://purl.oclc.org/ooxml/officeDocument/relationships/')) {
        value = value.replace('http://purl.oclc.org/ooxml/officeDocument/relationships/', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/')
      }
      if ((标准Uri(attr.uri) === 兼容空间 && ['Ignorable', 'ProcessContent', 'PreserveElements', 'PreserveAttributes'].includes(attr.local)) ||
          (标准Uri(node.uri) === 兼容空间 && node.local === 'Choice' && attr.local === 'Requires' && !attr.prefix)) {
        value = value.split(/\s+/).map(token => {
          const [prefix, local] = token.split(':')
          const canonical = 标准名称.get(标准Uri(node.ns[prefix])) ?? 外部别名.get(node.ns[prefix]) ?? prefix
          return local ? `${canonical}:${local}` : canonical
        }).join(' ')
      }
      if (value !== attr.value) changed = true
      return [attr.name, { key, value, original: attr.value }]
    }))
    const start = parser.startTagPosition - 1
    const end = parser.position
    output.push(xml.slice(cursor, start))
    // 仅改标签/属性名称与必须转换的值，保留其它原始词法（引号、实体、空白）。
    // PPTX 原生对象使用现有字节校验，不能因等价的 &apos; 或换行转义而误判丢失。
    let opening = xml.slice(start, end).replace(/^<[^\s/>]+/, `<${tag}`)
    const remaining = new Map(declarations)
    opening = opening.replace(/([^\s=/>]+)(\s*=\s*)(["'])([\s\S]*?)\3/g, (raw, key, equals, quote, rawValue) => {
      if (key === 'xmlns' || key.startsWith('xmlns:')) {
        const prefix = key === 'xmlns' ? '' : key.slice(6)
        const uri = remaining.get(prefix)
        remaining.delete(prefix)
        return uri === node.attributes[key]?.value ? raw : `${key}${equals}${quote}${转义(uri)}${quote}`
      }
      const attr = attrs.get(key)
      if (!attr) return raw
      return `${attr.key}${equals}${quote}${attr.value === attr.original ? rawValue : 转义(attr.value)}${quote}`
    })
    const additions = [...remaining].map(([prefix, uri]) => ` ${prefix ? `xmlns:${prefix}` : 'xmlns'}="${转义(uri)}"`).join('')
    if (additions) opening = opening.replace(/\/?>(?=$)/, end => additions + end)
    output.push(opening)
    cursor = end
    stack.push({ tag, scope, selfClosing: node.isSelfClosing })
  }
  parser.onclosetag = () => {
    const node = stack.pop()
    if (!node.selfClosing) {
      const end = parser.position
      const start = xml.lastIndexOf('</', end - 1)
      output.push(xml.slice(cursor, start), `</${node.tag}>`)
      cursor = end
    }
  }
  parser.ondoctype = () => { throw new Error('Office XML 不支持文档类型声明') }
  parser.write(xml).close()
  if (roots !== 1) throw new Error('Office XML 必须包含一个根节点')
  output.push(xml.slice(cursor))
  return changed ? output.join('') : xml
}

/** 只更新内存中的文本部件，图片、宏与其他二进制部件不参与转换。 */
async function 规范Office命名空间(zip, type) {
  const root = type === 'word' ? 'word/' : 'ppt/'
  for (const part of Object.values(zip.files)) {
    if (part.dir || !(part.name === '[Content_Types].xml' || part.name === '_rels/.rels' ||
      (part.name.startsWith(root) && /\.(?:xml|rels)$/.test(part.name)))) continue
    const original = await part.async('string')
    let normalized
    try { normalized = 规范OfficeXml(original) } catch (error) {
      const kind = type === 'word' ? '文字文档无效' : '演示文件无效'
      throw new Error(`${kind}：XML 部件损坏（${part.name}）：${error.message}`)
    }
    if (normalized !== original) zip.file(part.name, normalized)
  }
}

module.exports = { 规范OfficeXml, 规范Office命名空间 }
