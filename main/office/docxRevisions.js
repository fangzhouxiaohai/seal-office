const sax = require('sax')
const { XmlComponent, XmlAttributeComponent, ImportedXmlComponent } = require('docx')
const 类型 = new Set(['ins', 'del', 'moveFrom', 'moveTo'])
const 转义 = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** XML offsets are local to this fragment; no document text is evaluated as HTML. */
function 修订范围(xml) {
  const parser = sax.parser(true), stack = [], result = [], prefix = '<seal>'
  parser.onopentag = node => stack.push({ name: node.name, attributes: node.attributes, start: parser.startTagPosition - 1 - prefix.length })
  parser.onclosetag = () => {
    const node = stack.pop(), type = node.name.replace(/^w:/, '')
    if (!类型.has(type) && !['rPrChange', 'pPrChange'].includes(type)) return
    const end = parser.position - prefix.length
    result.push({ start: node.start, end, type, id: String(node.attributes['w:id'] ?? ''), author: String(node.attributes['w:author'] ?? ''), date: node.attributes['w:date'], raw: xml.slice(node.start, end) })
  }
  parser.ondoctype = () => { throw new Error('修订 XML 不支持文档类型声明') }
  parser.write(prefix + xml + '</seal>').close()
  return result.sort((a, b) => a.start - b.start || b.end - a.end)
}

function 修订Html(html, start, end, ranges, tag = 'span') {
  const parents = ranges.filter(r => 类型.has(r.type) && r.start <= start && r.end >= end)
  for (const revision of parents.reverse()) {
    const deleted = revision.type === 'del' || revision.type === 'moveFrom'
    html = `<${tag} class="${deleted ? 'wps-delete' : 'wps-insert'}" data-seal-revision-type="${revision.type}" data-seal-revision-id="${转义(revision.id)}" data-seal-revision-author="${转义(revision.author)}"${revision.date ? ` data-seal-revision-date="${转义(revision.date)}"` : ''}${deleted ? ' contenteditable="false"' : ''} title="${转义(revision.author)}${revision.date ? ` · ${转义(revision.date)}` : ''}">${html}</${tag}>`
  }
  return html
}

function 验证修订(revision) {
  if (!revision || !类型.has(revision.类型) || !/^\d{1,10}$/.test(String(revision.标识)) || Number(revision.标识) > 2147483647 || typeof revision.作者 !== 'string' || revision.作者.length > 512 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(revision.作者) || revision.时间 !== undefined && (typeof revision.时间 !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(revision.时间) || !Number.isFinite(Date.parse(revision.时间)))) throw new Error('修订标识、作者或时间无效')
  return revision
}
class 修订属性 extends XmlAttributeComponent {
  constructor(revision) { super({ id: revision.标识, author: revision.作者, ...(revision.时间 ? { date: revision.时间 } : {}) }); this.xmlKeys = { id: 'w:id', author: 'w:author', date: 'w:date' } }
}
class 原生修订 extends XmlComponent {
  constructor(revision, child) { super('w:' + 验证修订(revision).类型); this.root.push(new 修订属性(revision)); if (child) this.root.push(child) }
}
class 原生格式修订 extends XmlComponent {
  constructor(revision, previous) { super('w:rPrChange'); 验证修订({ ...revision, 类型: 'ins' }); this.root.push(new 修订属性(revision), previous) }
}
function 导入原生Xml(xml, allowed) {
  if (typeof xml !== 'string' || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY|<\?xml/i.test(xml)) throw new Error('保留的 OOXML 节点无效或过大')
  const parser = sax.parser(true); let root
  parser.onopentag = node => { root ??= node.name }
  parser.write(xml).close()
  if (!allowed.includes(root)) throw new Error('保留的 OOXML 节点类型无效')
  const imported = ImportedXmlComponent.fromXmlString(xml)
  return imported.rootKey ? imported : imported.root?.[0] ?? imported
}

/** Native deleted text has a different element name; consolidate one revision's adjacent runs. */
function 规范修订Xml(xml) {
  for (const type of ['del', 'moveFrom']) xml = xml.replace(new RegExp(`<w:${type}(?=[\\s>])[^>]*>[\\s\\S]*?<\\/w:${type}>`, 'g'), block => block.replace(/<(\/?w:)t(?=[\s>])/g, '<$1delText').replace(/<(\/?w:)instrText(?=[\s>])/g, '<$1delInstrText'))
  let previous
  do {
    previous = xml
    xml = xml.replace(/<w:(ins|del|moveFrom|moveTo)(\s[^>]*)>([\s\S]*?)<\/w:\1><w:\1\2>([\s\S]*?)<\/w:\1>/g, '<w:$1$2>$3$4</w:$1>')
  } while (xml !== previous)
  return xml
}
module.exports = { 修订范围, 修订Html, 原生修订, 原生格式修订, 验证修订, 规范修订Xml, 导入原生Xml }
