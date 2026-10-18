const sax = require('sax')
const path = require('path')

const 表格命名空间 = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const 关系命名空间 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const 包关系命名空间 = 'http://schemas.openxmlformats.org/package/2006/relationships'
const 声明命名空间 = 'http://www.w3.org/2000/xmlns/'
const 严格表格命名空间 = 'http://purl.oclc.org/ooxml/spreadsheetml/main'
const 严格关系命名空间 = 'http://purl.oclc.org/ooxml/officeDocument/relationships'
const 规范Uri = uri => uri === 严格表格命名空间 ? 表格命名空间 : uri === 严格关系命名空间 ? 关系命名空间 : uri

function 转义Xml(文本) {
  return 文本.replace(/[&<>"'\r\n\t]/g, 字符 => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    '\r': '&#13;', '\n': '&#10;', '\t': '&#9;',
  })[字符])
}

/** ExcelJS 按标签拼写识别部件；只把已知命名空间转换为它识别的拼写。 */
function 规范表格Xml命名空间(xml, 关系目录) {
  const 解析器 = sax.parser(true, { xmlns: true })
  const 输出 = []
  const 栈 = []
  const 外部前缀 = new Map()
  let 已转换 = false
  let 根节点数 = 0

  解析器.onopentag = 节点 => {
    if (栈.length === 0) 根节点数 += 1
    const 父范围 = 栈.at(-1)?.范围 ?? { xml: 'http://www.w3.org/XML/1998/namespace' }
    const 范围 = { ...父范围 }
    const 声明 = new Map()
    for (const 属性 of Object.values(节点.attributes)) {
      if (属性.uri !== 声明命名空间) continue
      const 前缀 = 属性.name === 'xmlns' ? '' : 属性.local
      const uri = 规范Uri(属性.value)
      if (uri !== 属性.value) 已转换 = true
      声明.set(前缀, uri)
      范围[前缀] = uri
    }
    const 绑定 = (前缀, uri) => {
      if ((范围[前缀] ?? '') !== uri) {
        声明.set(前缀, uri)
        范围[前缀] = uri
      }
    }
    const 名称 = (对象, 是属性 = false) => {
      const uri = 规范Uri(对象.uri)
      let 前缀 = 对象.prefix
      if (!是属性 && [表格命名空间, 包关系命名空间].includes(uri)) 前缀 = ''
      else if (是属性 && uri === 关系命名空间) 前缀 = 'r'
      // 同一节点上保留外部 r: 属性，避免它与规范化后的关系属性冲突。
      else if (前缀 === 'r' && uri !== 关系命名空间) {
        前缀 = 外部前缀.get(对象.uri)
        if (!前缀) {
          let 序号 = 外部前缀.size + 1
          do { 前缀 = `sealNs${序号++}` } while (前缀 in 节点.ns || 前缀 in 范围)
          外部前缀.set(对象.uri, 前缀)
        }
      }
      if (!是属性 || 前缀) 绑定(前缀, uri)
      const 结果 = 前缀 ? `${前缀}:${对象.local}` : 对象.local
      if (结果 !== 对象.name) 已转换 = true
      return 结果
    }
    const 标签 = 名称(节点)
    const 属性列表 = Object.values(节点.attributes)
      .filter(属性 => 属性.uri !== 声明命名空间)
      .map(属性 => {
        let 值 = 属性.value
        if (节点.uri === 包关系命名空间 && 节点.local === 'Relationship' && 属性.name === 'Type' && 值.startsWith(`${严格关系命名空间}/`)) {
          值 = `${关系命名空间}${值.slice(严格关系命名空间.length)}`
          已转换 = true
        }
        if (关系目录 !== undefined && 节点.uri === 包关系命名空间 && 节点.local === 'Relationship' &&
          属性.name === 'Target' && 节点.attributes.TargetMode?.value !== 'External' &&
          !/^[a-z][a-z\d+.-]*:/i.test(值)) {
          // OPC 同时允许包内绝对路径和相对路径；ExcelJS 的表格关系只识别相对路径。
          const 目标 = path.posix.normalize(值.startsWith('/') ? 值.slice(1) : path.posix.join(关系目录, 值))
          值 = path.posix.relative(关系目录, 目标)
          if (值 !== 属性.value) 已转换 = true
        }
        return ` ${名称(属性, true)}="${转义Xml(值)}"`
      })
    const 声明列表 = [...声明].map(([前缀, uri]) => ` ${前缀 ? `xmlns:${前缀}` : 'xmlns'}="${转义Xml(uri)}"`)
    输出.push(`<${标签}${声明列表.join('')}${属性列表.join('')}${节点.isSelfClosing ? '/>' : '>'}`)
    栈.push({ 标签, 范围, 自闭合: 节点.isSelfClosing })
  }
  解析器.onclosetag = () => {
    const 节点 = 栈.pop()
    if (!节点.自闭合) 输出.push(`</${节点.标签}>`)
  }
  解析器.ontext = 文本 => 输出.push(栈.length ? 转义Xml(文本) : 文本)
  解析器.oncdata = 文本 => 输出.push(`<![CDATA[${文本}]]>`)
  解析器.oncomment = 文本 => 输出.push(`<!--${文本}-->`)
  解析器.onprocessinginstruction = 指令 => 输出.push(`<?${指令.name}${指令.body ? ` ${指令.body}` : ''}?>`)
  解析器.ondoctype = () => { throw new Error('表格 XML 不支持文档类型声明') }
  解析器.write(xml).close()
  if (根节点数 !== 1) throw new Error('表格 XML 必须包含一个根节点')
  return 已转换 ? 输出.join('') : xml
}

/** 仅修改内存中的解压副本；标准 XLSX 保持原始字节，不修改来源文件。 */
async function 规范Xlsx命名空间(压缩包, 原始数据) {
  let 已转换 = false
  for (const 部件 of Object.values(压缩包.files)) {
    if (部件.dir || !/^(?:xl\/.*\.(?:xml|rels)|_rels\/\.rels)$/.test(部件.name)) continue
    const xml = await 部件.async('string')
    // 绘图等部件的前缀由其解析器处理，不参与表格标签转换。
    if (![表格命名空间, 严格表格命名空间, 包关系命名空间].some(uri => xml.includes(uri))) continue
    const 关系匹配 = 部件.name.match(/^(.*\/)?_rels\/[^/]+\.rels$/)
    const 关系目录 = 部件.name === '_rels/.rels' ? '' : 关系匹配 ? (关系匹配[1] ?? '').replace(/\/$/, '') : undefined
    const 新Xml = 规范表格Xml命名空间(xml, 关系目录)
    if (新Xml !== xml) {
      压缩包.file(部件.name, 新Xml)
      已转换 = true
    }
  }
  return 已转换 ? 压缩包.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) : 原始数据
}

module.exports = { 规范表格Xml命名空间, 规范Xlsx命名空间 }
