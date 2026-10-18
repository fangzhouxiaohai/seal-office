const JSZip = require('jszip')
const sax = require('sax')
const path = require('path')
const { XmlAttributeComponent } = require('docx')
const { 规范Office命名空间 } = require('./ooxmlNamespaces')
const 转义 = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const MAX_ZIP = 20 * 1024 * 1024, MAX_EXPANDED = 100 * 1024 * 1024

function xmlNodes(xml) {
  const parser = sax.parser(true), stack = [], nodes = []
  parser.onopentag = node => { const item = { name: node.name, attrs: node.attributes, start: parser.startTagPosition - 1, openEnd: parser.position, selfClosing: node.isSelfClosing, parent: stack.at(-1) }; nodes.push(item); stack.push(item) }
  parser.onclosetag = () => { const node = stack.pop(); node.end = parser.position; node.closeStart = node.selfClosing ? node.openEnd : xml.lastIndexOf('</', node.end - 1) }
  parser.ondoctype = () => { throw new Error('源包 XML 不支持文档类型声明') }
  parser.write(xml).close()
  return nodes
}
function bodyBlocks(xml) { return xmlNodes(xml).filter(node => node.parent?.name === 'w:body').map((node, index) => ({ ...node, id: `b${index}`, xml: xml.slice(node.start, node.end) })) }
function advancedDrawing(xml) { return [...xml.matchAll(/<w:(drawing|pict)(?=[\s>])[^>]*>[\s\S]*?<\/w:\1>/g)].some(match => !/<a:blip(?=[\s/>])/.test(match[0]) || /<wp:anchor|<w:pict|<a:tile|<a:effectLst(?=[\s>])[^>]*>\s*<a:/.test(match[0]) || [...match[0].matchAll(/<a:srcRect(?=[\s/>])[^>]*>/g)].some(crop => /\b[trbl]=["'](?!0["'])/.test(crop[0]))) }
function lockedBlock(xml) { return advancedDrawing(xml) || /<w:(?:object|sectPr|\w*Change|\w*(?:Ins|Del|Merge)|customXml\w*|sdt|ruby|subDoc|moveFromRangeStart|moveToRangeStart)(?=[\s/>])/.test(xml) || /<w:(?:trPr|tcPr)(?=[\s>])[\s\S]*?<w:(?:ins|del)(?=[\s/>])/.test(xml) || /<w:instrText(?=[\s>])/.test(xml) || [...xml.matchAll(/<w:fldSimple(?=[\s>])[^>]*>/g)].some(match => !/w:instr=["']\s*(?:PAGE|NUMPAGES)\s*["']/.test(match[0])) }
const sourceBlockLocked = block => !['w:p', 'w:tbl'].includes(block.name) || lockedBlock(block.xml)

async function 读取安全源包(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_ZIP / 3) * 4) throw new Error('DOCX 源包超过20 MiB')
  const bytes = Buffer.from(data, 'base64')
  if (!bytes.length || bytes.length > MAX_ZIP || bytes.toString('base64') !== data) throw new Error('DOCX 源包数据无效')
  const zip = await JSZip.loadAsync(bytes), entries = Object.values(zip.files)
  if (entries.length > 2000) throw new Error('DOCX 源包部件超过2000项')
  let expanded = 0
  for (const entry of entries) {
    const name = entry.unsafeOriginalName || entry.name
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || /vbaProject|activeX\/|embeddings\/|\.bin$|\.exe$|\.dll$|\.js$|\.vbs$|\.cmd$|\.bat$|\.ps1$/i.test(name)) throw new Error('源包包含宏、活动内容或不安全部件，不能作为普通DOCX保留')
    if (entry.dir) continue
    const size = entry._data?.uncompressedSize ?? 0
    expanded += size
    if (size > 20 * 1024 * 1024 || expanded > MAX_EXPANDED) throw new Error('DOCX 源包展开体积超过限制')
    if (/\.(?:xml|rels)$/.test(name)) {
      const xml = await entry.async('string')
      if (/<!DOCTYPE|<!ENTITY|<(?:[\w.-]+:)?(?:altChunk|OLEObject|object)\b/i.test(xml) || name === '[Content_Types].xml' && /macroEnabled|vbaProject|activeX|oleObject/i.test(xml)) throw new Error('源包包含未允许的活动或嵌入对象')
      if (name.endsWith('.rels')) for (const node of xmlNodes(xml).filter(n => /(?:^|:)Relationship$/.test(n.name))) {
        if (/(?:vbaProject|activeX|oleObject|control|attachedTemplate|aFChunk|package)$/i.test(node.attrs.Type ?? '')) throw new Error('源包包含活动或嵌入对象关系，不能作为普通DOCX保留')
        if (/^external$/i.test(node.attrs.TargetMode ?? '') && (!node.attrs.Type?.endsWith('/hyperlink') || !/^(?:https?:|mailto:|tel:)/i.test(node.attrs.Target ?? ''))) throw new Error('源包包含外部资源或不安全关系，需先转换为嵌入内容')
        if (!/^external$/i.test(node.attrs.TargetMode ?? '')) {
          const target = node.attrs.Target ?? ''
          if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /[\\\u0000-\u001f]/.test(target)) throw new Error('源包内部关系目标无效')
          const owner = path.posix.join(path.posix.dirname(path.posix.dirname(name)), path.posix.basename(name, '.rels'))
          let decoded; try { decoded = decodeURIComponent(target.split('#')[0]) } catch { throw new Error('源包关系目标编码无效') }
          const resolved = resolvePart(owner, decoded)
          if (resolved.startsWith('../') || resolved.startsWith('/') || /[\u0000-\u001f]/.test(resolved) || !zip.file(resolved)) throw new Error('源包内部关系越界或部件缺失')
        }
      }
    }
  }
  if (!zip.file('word/document.xml') || !zip.file('[Content_Types].xml')) throw new Error('DOCX 源包核心部件缺失')
  await 规范Office命名空间(zip, 'word')
  return zip
}

function 应用原生修订动作(xml, actions, part = 'word/document.xml') {
  if (actions !== undefined && (!Array.isArray(actions) || actions.length > 10000)) throw new Error('修订操作记录无效或过多')
  for (const action of actions ?? []) if (!action || !['accept', 'reject'].includes(action.操作) || !/^\d{1,10}$/.test(action.标识 ?? '') || Number(action.标识) > 2147483647 || action.部件 && !/^word\/[\w/.-]+\.xml$/.test(action.部件)) throw new Error('修订操作记录无效')
  const initialNodes = xmlNodes(xml), moves = 移动关联(initialNodes), resolvedGroups = new Set(), operations = [...(actions ?? [])]
  for (const action of operations.slice()) if (!action.部件 || action.部件 === part) for (const move of moves.filter(move => move.revisions.some(node => String(node.attrs['w:id']) === action.标识))) {
    resolvedGroups.add(move.name)
    for (const linked of moves.filter(item => item.name === move.name)) for (const node of linked.revisions) if (!operations.some(item => item.标识 === String(node.attrs['w:id']) && item.操作 === action.操作 && (!item.部件 || item.部件 === part))) operations.push({ 标识: String(node.attrs['w:id']), 操作: action.操作, 部件: part })
  }
  for (const action of operations) {
    if (!action || !['accept', 'reject'].includes(action.操作) || !/^\d{1,10}$/.test(action.标识 ?? '') || Number(action.标识) > 2147483647 || action.部件 && !/^word\/[\w/.-]+\.xml$/.test(action.部件)) throw new Error('修订操作记录无效')
    if (action.部件 && action.部件 !== part) continue
    // Paragraph-mark revisions govern the boundary, rather than the visible
    // characters. Resolve boundaries from the end so consecutive deletions join.
    let paragraphs = xmlNodes(xml)
    const boundaries = paragraphs.filter(node => ['w:ins', 'w:del'].includes(node.name) && String(node.attrs['w:id']) === action.标识 && node.parent?.name === 'w:rPr' && node.parent.parent?.name === 'w:pPr' && node.parent.parent.parent?.name === 'w:p').reverse()
    for (const boundary of boundaries) {
      if (!(action.操作 === 'accept' && boundary.name === 'w:del' || action.操作 === 'reject' && boundary.name === 'w:ins')) continue
      paragraphs = xmlNodes(xml)
      const mark = paragraphs.find(node => node.name === boundary.name && String(node.attrs['w:id']) === action.标识 && node.parent?.parent?.parent?.start === boundary.parent.parent.parent.start)
      if (!mark) continue
      const paragraph = mark.parent.parent.parent, next = paragraphs.find(node => node.name === 'w:p' && node.parent === paragraph.parent && node.start >= paragraph.end)
      if (!next) throw new Error('修订段落边界缺少后续段落，无法完整审阅')
      const nextProperties = paragraphs.find(node => node.name === 'w:pPr' && node.parent === next)
      const nextBody = xml.slice(next.openEnd, next.closeStart).replace(nextProperties ? xml.slice(nextProperties.start, nextProperties.end) : /$^/, '')
      xml = xml.slice(0, paragraph.closeStart) + nextBody + '</w:p>' + xml.slice(next.end)
    }
    const nodes = xmlNodes(xml), edits = []
    for (const node of nodes.filter(n => String(n.attrs['w:id']) === action.标识)) {
      const type = node.name.slice(2)
      if (/^(?:\w*Change|cellIns|cellDel|cellMerge|customXml\w*(?:Start|End))$/.test(type) && !/^(?:rPr|pPr|sectPr|tblPr|tblPrEx|trPr|tcPr)Change$/.test(type)) throw new Error('此类原生结构修订已保留，但尚不支持完整接受或拒绝；原文未更改')
      if (['ins', 'del', 'moveFrom', 'moveTo'].includes(type)) {
        const insertion = type === 'ins' || type === 'moveTo', keep = action.操作 === 'accept' ? insertion : !insertion
        if (['moveFrom', 'moveTo'].includes(type) && node.parent?.name === 'w:rPr' && node.parent.parent?.name === 'w:pPr') { const paragraph = node.parent.parent.parent; if (!paragraph || paragraph.name !== 'w:p') throw new Error('段落移动修订无效'); edits.push({ start: keep ? node.start : paragraph.start, end: keep ? node.end : paragraph.end, text: '' }); continue }
        if (node.parent?.name === 'w:tcPr') throw new Error('此单元格结构修订已保留，但尚不支持完整接受或拒绝')
        if (node.parent?.name === 'w:trPr') {
          const row = node.parent.parent; if (!row || row.name !== 'w:tr') throw new Error('表格修订结构无效')
          const table = row.parent, onlyRow = table?.name === 'w:tbl' && nodes.filter(item => item.parent === table && item.name === 'w:tr').length === 1
          edits.push({ start: keep ? node.start : onlyRow ? table.start : row.start, end: keep ? node.end : onlyRow ? table.end : row.end, text: !keep && onlyRow ? '<w:p/>' : '' }); continue
        }
        const inside = keep ? xml.slice(node.openEnd, node.closeStart).replace(/<(\/?w:)delText(?=[\s>])/g, '<$1t').replace(/<(\/?w:)delInstrText(?=[\s>])/g, '<$1instrText') : ''
        edits.push({ start: node.start, end: node.end, text: inside })
      } else if (/^(?:rPr|pPr|sectPr|tblPr|tblPrEx|trPr|tcPr)Change$/.test(type)) {
        if (action.操作 === 'accept') edits.push({ start: node.start, end: node.end, text: '' })
        else if (node.parent) {
          const history = nodes.find(n => n.parent === node && n.name === node.parent.name)
          if (!history) throw new Error('格式修订历史属性缺失，已阻止不完整拒绝')
          edits.push({ start: node.parent.start, end: node.parent.end, text: xml.slice(history.start, history.end) })
        }
      }
    }
    const selected = edits.filter(e => !edits.some(parent => parent !== e && parent.start <= e.start && parent.end >= e.end)).sort((a, b) => b.start - a.start)
    for (const edit of selected) xml = xml.slice(0, edit.start) + edit.text + xml.slice(edit.end)
  }
  const removedRanges = new Set(moves.filter(move => resolvedGroups.has(move.name)).flatMap(move => [move.start, move.end].map(node => `${node.name}:${node.attrs['w:id']}`)))
  for (const node of xmlNodes(xml).filter(node => removedRanges.has(`${node.name}:${node.attrs['w:id']}`)).sort((a, b) => b.start - a.start)) xml = xml.slice(0, node.start) + xml.slice(node.end)
  return xml
}

function 移动关联(nodes) {
  const result = []
  for (const start of nodes.filter(node => /^w:move(?:From|To)RangeStart$/.test(node.name))) {
    const end = nodes.find(node => node.name === start.name.replace('Start', 'End') && node.attrs['w:id'] === start.attrs['w:id'] && node.start > start.start)
    if (!end || !start.attrs['w:name']) continue
    result.push({ name: start.attrs['w:name'], start, end, revisions: nodes.filter(node => ['w:moveFrom', 'w:moveTo'].includes(node.name) && node.start >= start.end && node.end <= end.start) })
  }
  return result
}

async function 创建源包上下文(zip, render, baseline = {}, renderPart) {
  // Legacy fragment-only inputs can still use the supported HTML/model codec;
  // without an OPC manifest there is no safe complete package to retain.
  if (!zip.file('[Content_Types].xml')) return null
  const xml = await zip.file('word/document.xml').async('string')
  const complexDrawing = advancedDrawing(xml)
  const special = /<w:(?:ins|del|moveFrom|moveTo|\w*Change|cellIns|cellDel|cellMerge|customXml\w*|footnoteReference|endnoteReference|instrText)(?=[\s/>])/.test(xml) || [...xml.matchAll(/<w:fldSimple(?=[\s>])[^>]*>/g)].some(match => !/w:instr=["']\s*(?:PAGE|NUMPAGES)\s*["']/.test(match[0]))
  let extraHistory = false
  if (!special && !complexDrawing) for (const file of Object.values(zip.files)) if (!file.dir && /^word\/.*\.xml$/.test(file.name) && file.name !== 'word/document.xml' && /<w:(?:ins|del|moveFrom|moveTo|\w*Change|cellIns|cellDel|cellMerge|customXml\w*)(?=[\s/>])/.test(await file.async('string'))) { extraHistory = true; break }
  if (!special && !complexDrawing && !extraHistory && (xml.match(/<w:sectPr(?=[\s>])/g) ?? []).length <= 1 && !/<w:(?:header|footer)Reference[^>]*w:type=["'](?:first|even)["']/.test(xml)) return null
  const data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await 读取安全源包(data.toString('base64'))
  const blocks = bodyBlocks(xml), output = [], catalog = [], sections = []
  for (const file of Object.values(zip.files)) if (!file.dir && /^word\/.*\.xml$/.test(file.name)) {
    const nodes = xmlNodes(await file.async('string')), moves = 移动关联(nodes)
    for (const node of nodes) if (/^w:(?:ins|del|moveFrom|moveTo|\w*Change|cellIns|cellDel|cellMerge|customXml\w*(?:Start|End))$/.test(node.name) && node.attrs['w:id'] !== undefined) {
      catalog.push({ 类型: node.name.slice(2), 标识: node.attrs['w:id'], 作者: node.attrs['w:author'] ?? '', 时间: node.attrs['w:date'], 部件: file.name, ...(moves.find(move => move.revisions.includes(node)) ? { 组: moves.find(move => move.revisions.includes(node)).name } : {}) })
    }
  }
  for (const block of blocks) {
    if (block.name === 'w:sectPr') continue
    let html = render(block.xml)
    const invisible = !html && /(?:RangeStart|RangeEnd|bookmarkStart|bookmarkEnd)$/.test(block.name)
    if (!html && !invisible) { html = '<p>此原生对象保留在文件中，请通过原生打印预览查看完整效果。</p>' }
    const locked = sourceBlockLocked(block)
    output.push(`<div data-seal-ooxml-block="${block.id}" data-seal-ooxml-baseline="${转义(encodeURIComponent(html))}"${invisible ? ' hidden="hidden" data-seal-ooxml-empty="true"' : ''}${locked ? ' data-seal-ooxml-locked="true" contenteditable="false" title="保留的原生结构；可审阅修订，正文编辑受保护"' : ''}>${html}</div>`)
    const section = xmlNodes(block.xml).find(node => node.name === 'w:sectPr' && node.parent?.name !== 'w:sectPrChange')
    if (section) sections.push({ end: output.length, xml: block.xml.slice(section.start, section.end) })
  }
  const finalSection = blocks.findLast(block => block.name === 'w:sectPr')
  sections.push({ end: output.length, xml: finalSection?.xml ?? '<w:sectPr/>' })
  let start = 0, content = ''
  const relationships = relationNodes(await partText(zip, 'word/_rels/document.xml.rels', emptyRels)), inherited = { 页眉Html: {}, 页脚Html: {} }
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index], nodes = xmlNodes(section.xml), attrs = name => nodes.find(n => n.name === 'w:' + name)?.attrs ?? {}, size = attrs('pgSz'), margin = attrs('pgMar'), cols = attrs('cols')
    for (const [kind, key] of [['header', '页眉Html'], ['footer', '页脚Html']]) for (const ref of nodes.filter(n => n.name === 'w:' + kind + 'Reference')) {
      const relationship = relationships.find(n => n.attrs.Id === ref.attrs['r:id']), part = relationship && resolvePart('word/document.xml', relationship.attrs.Target)
      if (part && renderPart) inherited[key][ref.attrs['w:type'] || 'default'] = await renderPart(part)
    }
    const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback
    const layout = { 纸张: { 宽: positive(size['w:w'], 11906), 高: positive(size['w:h'], 16838) }, 页边距: Object.fromEntries([['上', 'top'], ['右', 'right'], ['下', 'bottom'], ['左', 'left']].map(([key, attr]) => [key, positive(margin['w:' + attr], 1440)])), 类型: attrs('type')['w:val'] || 'nextPage', 分栏: { 数量: positive(cols['w:num'], 1), 间距: positive(cols['w:space'], 720), 宽度: nodes.filter(n => n.name === 'w:col').map(n => positive(n.attrs['w:w'], 0)) }, 页眉Html: { ...inherited.页眉Html }, 页脚Html: { ...inherited.页脚Html } }
    content += `<div data-seal-section="s${index}" data-seal-section-layout="${转义(encodeURIComponent(JSON.stringify(layout)))}">${output.slice(start, section.end).join('')}</div>`
    start = section.end
  }
  return { html: `<span data-seal-docx-package="${data.toString('base64')}" data-seal-docx-baseline="${转义(encodeURIComponent(JSON.stringify(baseline)))}" data-seal-revision-catalog="${转义(encodeURIComponent(JSON.stringify(catalog)))}" hidden="hidden" contenteditable="false" aria-hidden="true"></span>` + content, blocks }
}

class 来源属性 extends XmlAttributeComponent { constructor(id) { super({ sealSource: id }); this.xmlKeys = { sealSource: 'sealSource' } } }
function 标记来源(component, block) { if (block?.原始块?.标识) { if (!/^b\d{1,5}$/.test(block.原始块.标识)) throw new Error('原始块标识无效'); component.root.unshift(new 来源属性(block.原始块.标识)) } return component }

const relationNodes = xml => xmlNodes(xml).filter(node => /(?:^|:)Relationship$/.test(node.name))
const emptyRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
const resolvePart = (owner, target) => path.posix.normalize(target.startsWith('/') ? target.slice(1) : path.posix.join(path.posix.dirname(owner), target))
const relationXml = attrs => `<Relationship ${Object.entries(attrs).map(([key, value]) => `${key}="${转义(value)}"`).join(' ')}/>`
async function partText(zip, name, fallback = '') { return zip.file(name) ? zip.file(name).async('string') : fallback }
const stableHash = text => { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return (hash >>> 0).toString(16) }
function 合并命名空间(target, extra) {
  const root = xmlNodes(target).find(node => !node.parent), added = xmlNodes(extra).find(node => !node.parent)
  if (!root || !added) throw new Error('XML部件根节点缺失')
  let open = target.slice(root.start, root.openEnd)
  for (const [name, uri] of Object.entries(added.attrs)) if (name.startsWith('xmlns:')) {
    if (root.attrs[name] && root.attrs[name] !== uri) throw new Error('新增内容命名空间冲突，已阻止覆盖')
    if (!root.attrs[name]) open = open.replace(/>$/, ` ${name}="${转义(uri)}">`)
  }
  return target.slice(0, root.start) + open + target.slice(root.openEnd)
}

async function 准备新增部件(source, fresh) {
  let prefix = 'sealGenerated', suffix = 0
  while (Object.keys(source.files).some(name => name.startsWith(`word/${prefix}/`))) prefix = `sealGenerated${++suffix}`
  // Generated parts have their own namespace. Their relative relationship graph
  // remains intact, and existing native styles/numbering/relationships are untouched.
  const styleIds = new Map(), freshStyles = await partText(fresh, 'word/styles.xml'), oldStyles = await partText(source, 'word/styles.xml')
  const occupied = new Set(xmlNodes(oldStyles || '<styles/>').map(n => n.attrs['w:styleId']).filter(Boolean))
  for (const node of xmlNodes(freshStyles || '<styles/>').filter(n => n.name === 'w:style')) styleIds.set(node.attrs['w:styleId'], `SealGenerated_${node.attrs['w:styleId']}_${stableHash(freshStyles.slice(node.start, node.end))}`)
  const oldNumbering = await partText(source, 'word/numbering.xml'), freshNumbering = await partText(fresh, 'word/numbering.xml')
  const numberIds = new Map(), abstractIds = new Map()
  let number = Math.max(0, ...xmlNodes(oldNumbering || '<numbering/>').filter(n => n.name === 'w:num').map(n => Number(n.attrs['w:numId']) || 0)) + 1
  let abstract = Math.max(0, ...xmlNodes(oldNumbering || '<numbering/>').filter(n => n.name === 'w:abstractNum').map(n => Number(n.attrs['w:abstractNumId']) || 0)) + 1
  for (const node of xmlNodes(freshNumbering || '<numbering/>')) { if (node.name === 'w:num') numberIds.set(node.attrs['w:numId'], String(number++)); if (node.name === 'w:abstractNum') abstractIds.set(node.attrs['w:abstractNumId'], String(abstract++)) }
  const rewrite = xml => xml.replace(/(<w:(?:pStyle|rStyle|basedOn|next|link)\b[^>]*\bw:val=")([^"]+)(")/g, (all, a, id, b) => styleIds.has(id) ? a + styleIds.get(id) + b : all)
    .replace(/(<w:style\b[^>]*\bw:styleId=")([^"]+)(")/g, (all, a, id, b) => a + styleIds.get(id) + b)
    .replace(/(<w:numId\b[^>]*\bw:val=")([^"]+)(")/g, (all, a, id, b) => a + (numberIds.get(id) ?? id) + b)
    .replace(/(<w:num\b[^>]*\bw:numId=")([^"]+)(")/g, (all, a, id, b) => a + numberIds.get(id) + b)
    .replace(/(<w:abstractNum(?:Id)?\b[^>]*\bw:(?:abstractNumId|val)=")([^"]+)(")/g, (all, a, id, b) => a + (abstractIds.get(id) ?? id) + b)
  if (freshStyles) {
    const existing = new Map(xmlNodes(oldStyles || '<styles/>').filter(n => n.name === 'w:style').map(n => [n.attrs['w:styleId'], oldStyles.slice(n.start, n.end)]))
    const added = xmlNodes(freshStyles).filter(n => n.name === 'w:style').map(n => { const xml = rewrite(freshStyles.slice(n.start, n.end)), id = styleIds.get(n.attrs['w:styleId']); if (existing.has(id)) { if (existing.get(id) !== xml) throw new Error('新增样式与源文件样式标识冲突，已阻止覆盖'); return '' } return xml }).join('')
    source.file('word/styles.xml', oldStyles ? oldStyles.replace('</w:styles>', added + '</w:styles>') : rewrite(freshStyles))
  }
  if (freshNumbering) {
    const added = xmlNodes(freshNumbering).filter(n => n.parent?.name === 'w:numbering').map(n => rewrite(freshNumbering.slice(n.start, n.end))).join('')
    source.file('word/numbering.xml', oldNumbering ? oldNumbering.replace('</w:numbering>', added + '</w:numbering>') : rewrite(freshNumbering))
  }
  for (const file of Object.values(fresh.files)) if (!file.dir && /^word\//.test(file.name) && !/^word\/(?:document\.xml|_rels\/document\.xml\.rels|styles\.xml|numbering\.xml|settings\.xml|webSettings\.xml|fontTable\.xml|theme\/)/.test(file.name)) {
    let data = await file.async('nodebuffer')
    if (/\.(?:xml|rels)$/.test(file.name)) { let xml = rewrite(data.toString('utf8')); if (file.name.endsWith('.rels')) xml = xml.replace(/\bTarget="\/word\//g, `Target="/word/${prefix}/`); data = Buffer.from(xml) }
    source.file(`word/${prefix}/${file.name.slice(5)}`, data)
  }
  const oldTypes = await partText(source, '[Content_Types].xml'), freshTypes = await partText(fresh, '[Content_Types].xml'), additions = []
  const extensions = new Set(xmlNodes(oldTypes).filter(n => n.name === 'Default').map(n => n.attrs.Extension))
  for (const node of xmlNodes(freshTypes)) {
    if (node.name === 'Default' && !extensions.has(node.attrs.Extension)) { additions.push(freshTypes.slice(node.start, node.end)); extensions.add(node.attrs.Extension) }
    if (node.name === 'Override' && node.attrs.PartName?.startsWith('/word/') && source.file(`word/${prefix}/` + node.attrs.PartName.slice(6))) additions.push(freshTypes.slice(node.start, node.end).replace(/PartName="\/word\//, `PartName="/word/${prefix}/`))
  }
  source.file('[Content_Types].xml', oldTypes.replace('</Types>', additions.join('') + '</Types>'))
  return { rewrite, prefix }
}

async function 合并源包(generated, model) {
  if (!model.源包) {
    if (model.段落?.some(block => block.原始块)) throw new Error('文档原始包缺失，已阻止高级结构被覆盖')
    if (model.修订动作?.length) { const zip = await JSZip.loadAsync(generated); for (const entry of Object.values(zip.files)) if (!entry.dir && /^word\/.*\.xml$/.test(entry.name)) zip.file(entry.name, 应用原生修订动作(await entry.async('string'), model.修订动作, entry.name)); return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) }
    return generated
  }
  const source = await 读取安全源包(model.源包), fresh = await JSZip.loadAsync(generated), originalXml = await source.file('word/document.xml').async('string')
  if (model.修订动作 !== undefined && (!Array.isArray(model.修订动作) || model.修订动作.length > 10000)) throw new Error('修订操作记录无效或过多')
  const baselinePage = model.源包基准?.页面设置, samePage = !model.页面设置 || !baselinePage || [...new Set([...Object.keys(model.页面设置), ...Object.keys(baselinePage)])].every(key => JSON.stringify(model.页面设置[key] ?? null) === JSON.stringify(baselinePage[key] ?? null))
  const sourceOrder = bodyBlocks(originalXml).filter(block => block.name !== 'w:sectPr').map(block => block.id), modelOrder = [...new Set(model.段落.map(item => item.原始块?.标识))]
  if (JSON.stringify(sourceOrder) === JSON.stringify(modelOrder) && model.段落.every(item => item.原始块?.未修改) && (model.注释 ?? []).every(note => note.未修改) && samePage) {
    for (const entry of Object.values(source.files)) if (!entry.dir && /^word\/.*\.xml$/.test(entry.name)) source.file(entry.name, 应用原生修订动作(await entry.async('string'), model.修订动作, entry.name))
    return source.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  }
  const { rewrite, prefix } = await 准备新增部件(source, fresh), freshXml = rewrite(await fresh.file('word/document.xml').async('string'))
  const originalBlocks = bodyBlocks(originalXml), byId = new Map(originalBlocks.map(b => [b.id, b])), groups = new Map()
  for (const item of model.段落) if (item.原始块) { const id = item.原始块.标识; if (!byId.has(id)) throw new Error('文档原始块映射无效'); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(item) }
  const used = new Set(), output = [], actions = model.修订动作 ?? []
  if (!Array.isArray(actions) || actions.length > 10000) throw new Error('修订操作记录无效或过多')
  for (const block of originalBlocks) if (block.name !== 'w:sectPr' && sourceBlockLocked(block) && !groups.has(block.id)) throw new Error('受保护的原生结构被移除，已阻止覆盖')
  const idMap = new Map(), sourceRelsPath = 'word/_rels/document.xml.rels'
  let sourceRels = await partText(source, sourceRelsPath, emptyRels)
  const freshRels = await partText(fresh, sourceRelsPath, emptyRels)
  const oldIds = new Set(relationNodes(sourceRels).map(n => n.attrs.Id)), newRelationships = []
  const usedFreshIds = new Set(bodyBlocks(freshXml).filter(block => block.name !== 'w:sectPr' && (!block.attrs.sealSource || !groups.get(block.attrs.sealSource)?.every(item => item.原始块.未修改))).flatMap(block => [...block.xml.matchAll(/\br:(?:id|embed|link)="([^"]+)"/g)].map(match => match[1])))
  for (const relation of relationNodes(freshRels)) {
    const type = relation.attrs.Type ?? '', target = relation.attrs.Target
    if (/\/(?:styles|settings|webSettings|fontTable|theme|numbering|footnotes|endnotes)$/.test(type)) continue
    // Empty implicit parts emitted by the library (notably comments.xml) must
    // never supersede or accumulate beside a native source part.
    if (!/\/(?:image|hyperlink|header|footer)$/.test(type)) continue
    if (/\/(?:image|hyperlink)$/.test(type) && !usedFreshIds.has(relation.attrs.Id)) continue
    if (type.endsWith('/header') && (model.页面设置?.页眉Html ?? '') === (baselinePage?.页眉Html ?? '')) continue
    if (type.endsWith('/footer') && (model.页面设置?.页脚Html ?? '') === (baselinePage?.页脚Html ?? '')) continue
    let id, i = idMap.size + 1; do { id = `sealGenerated${i++}` } while (oldIds.has(id)); oldIds.add(id); idMap.set(relation.attrs.Id, id)
    if (relation.attrs.TargetMode === 'External') {
      if (!type.endsWith('/hyperlink') || !/^(?:https?:|mailto:|tel:)/i.test(target ?? '')) throw new Error('新增关系包含不安全外部目标')
      newRelationships.push(`<Relationship Id="${id}" Type="${转义(type)}" Target="${转义(target)}" TargetMode="External"/>`)
    } else if (target) {
      const file = path.posix.normalize(target.startsWith('/') ? target.slice(1) : `word/${target}`)
      if (!file.startsWith('word/') || !fresh.file(file)) throw new Error('新增部件关系无效')
      const destination = `word/${prefix}/${file.slice(5)}`
      if (!source.file(destination)) throw new Error('新增部件未完整复制')
      newRelationships.push(`<Relationship Id="${id}" Type="${转义(type)}" Target="${转义(path.posix.relative('word', destination))}"/>`)
    }
  }
  for (const block of bodyBlocks(freshXml)) {
    if (block.name === 'w:sectPr' || /SealOfficeTableSeparator/.test(block.xml)) continue
    const id = block.attrs.sealSource, group = id ? groups.get(id) : undefined
    if (id && !group) throw new Error('生成块缺少对应模型映射')
    if (id && group.every(item => item.原始块.未修改 === true)) { if (!used.has(id)) output.push(byId.get(id).xml); used.add(id); continue }
    if (id && sourceBlockLocked(byId.get(id))) throw new Error('保留的原生结构发生不支持的编辑，已阻止覆盖；请撤销该编辑或使用支持此结构的程序')
    let xml = block.xml.replace(/\s+sealSource="[^"]*"/g, '').replace(/\br:(id|embed|link)="([^"]+)"/g, (all, attr, value) => idMap.has(value) ? `r:${attr}="${idMap.get(value)}"` : all)
    xml = xml.replace(/(<w:(?:footnote|endnote)Reference\b[^>]*w:id=")([^"]+)(")/g, (all, before, nativeId, after) => model.注释?.[Number(nativeId) - 1] ? before + model.注释[Number(nativeId) - 1].标识 + after : all)
    // Native paragraph properties preserve unsupported pagination/style settings when text changes.
    if (id && byId.get(id).name === 'w:p' && block.name === 'w:p') {
      const oldPr = byId.get(id).xml.match(/<w:pPr(?=[\s>])[^>]*>[\s\S]*?<\/w:pPr>/)?.[0]
      if (oldPr) {
        const freshPr = xml.match(/<w:pPr(?=[\s>])[^>]*>[\s\S]*?<\/w:pPr>/)?.[0]
        if (!freshPr) xml = xml.replace(/^(<w:p[^>]*>)/, '$1' + oldPr)
        else { const existing = new Set(xmlNodes(freshPr).filter(n => n.parent?.name === 'w:pPr').map(n => n.name)); const preserved = xmlNodes(oldPr).filter(n => n.parent?.name === 'w:pPr' && !existing.has(n.name)).map(n => oldPr.slice(n.start, n.end)).join(''); xml = xml.replace(freshPr, freshPr.replace('</w:pPr>', preserved + '</w:pPr>')) }
      }
    }
    output.push(xml)
  }
  let finalSection = originalBlocks.findLast(block => block.name === 'w:sectPr')?.xml ?? ''
  const layoutKeys = ['纸张', '纸张方向', '页边距', '分栏', '水印', '页面边框', '页面颜色', '文字方向', '行号', '原始纸张', '原始页边距']
  if (baselinePage && layoutKeys.some(key => JSON.stringify(model.页面设置?.[key]) !== JSON.stringify(baselinePage[key]))) {
    if ((originalXml.match(/<w:sectPr(?=[\s>])/g) ?? []).length > 1) throw new Error('多节文档的纸张布局已受保护；请保留各节设置，或在支持分节编辑的程序中修改')
    const freshSection = bodyBlocks(freshXml).findLast(block => block.name === 'w:sectPr')?.xml
    if (!freshSection) throw new Error('页面布局生成失败')
    const propertyNames = ['w:pgSz', 'w:pgMar', 'w:cols', 'w:textDirection', 'w:pgBorders', 'w:lnNumType']
    for (const name of propertyNames) { const expression = new RegExp(`<${name}(?=[\\s/>])[^>]*(?:\\/>|>[\\s\\S]*?<\\/${name}>)`, 'g'), replacement = freshSection.match(expression)?.[0] ?? ''; finalSection = finalSection.replace(expression, ''); if (replacement) finalSection = finalSection.replace('</w:sectPr>', replacement + '</w:sectPr>') }
  }
  // The selected default header/footer is editable; first/even variants and all
  // other sections keep their native parts and relationships.
  for (const [kind, key] of [['header', '页眉Html'], ['footer', '页脚Html']]) if (baselinePage && (model.页面设置?.[key] ?? '') !== (baselinePage[key] ?? '')) {
    const oldReferences = xmlNodes(finalSection || '<w:sectPr/>').filter(node => node.name === `w:${kind}Reference` && (node.attrs['w:type'] || 'default') === 'default')
    for (const reference of oldReferences) { const relation = relationNodes(sourceRels).find(node => node.attrs.Id === reference.attrs['r:id']); const part = relation && resolvePart('word/document.xml', relation.attrs.Target); if (part && lockedBlock(await partText(source, part))) throw new Error('此页眉页脚含受保护的原生结构，已阻止不完整覆盖；请先在修订历史中审阅或保留原内容') }
    const freshRelation = relationNodes(freshRels).find(n => n.attrs.Type?.endsWith('/' + kind)), freshId = freshRelation && idMap.get(freshRelation.attrs.Id)
    if (!freshId) { finalSection = finalSection.replace(new RegExp(`<w:${kind}Reference(?=[\\s/>])[^>]*w:type="default"[^>]*\\/>`, 'g'), '') }
    else {
      const reference = `<w:${kind}Reference w:type="default" r:id="${freshId}"/>`, regex = new RegExp(`<w:${kind}Reference(?=[\\s/>])[^>]*w:type="default"[^>]*\\/>`, 'g')
      finalSection = regex.test(finalSection) ? finalSection.replace(regex, reference) : finalSection.replace(/^(<w:sectPr[^>]*>)/, '$1' + reference)
    }
  }
  // Native note ids are stable even when the generator internally renumbers its
  // entries. Merge definitions and rebase old local relationships into the new part.
  for (const kind of ['footnote', 'endnote']) {
    const notes = (model.注释 ?? []).filter(note => note.类型 === kind)
    if (!notes.some(note => !note.未修改)) continue
    const oldRelation = relationNodes(sourceRels).find(n => n.attrs.Type?.endsWith('/' + kind + 's'))
    const oldPart = oldRelation ? resolvePart('word/document.xml', oldRelation.attrs.Target) : `word/${kind}s.xml`
    const oldXml = await partText(source, oldPart, `<w:${kind}s xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:${kind}s>`)
    const newPart = `word/${prefix}/${kind}s.xml`, newXml = await partText(source, newPart)
    if (!newXml) throw new Error('新增注释部件缺失')
    const definitions = new Map(xmlNodes(oldXml).filter(n => n.name === 'w:' + kind).map(n => [Number(n.attrs['w:id']), oldXml.slice(n.start, n.end)]))
    const newNodes = xmlNodes(newXml).filter(n => n.name === 'w:' + kind)
    for (const note of notes) if (!note.未修改) {
      if (definitions.has(note.标识) && lockedBlock(definitions.get(note.标识))) throw new Error('此注释含受保护的原生结构，已阻止覆盖')
      const nativeId = model.注释.indexOf(note) + 1, node = newNodes.find(n => Number(n.attrs['w:id']) === nativeId)
      if (!node) throw new Error('注释内容生成失败')
      definitions.set(note.标识, newXml.slice(node.start, node.end).replace(/\bw:id="[^"]*"/, `w:id="${note.标识}"`))
    }
    const oldRelsPart = path.posix.join(path.posix.dirname(oldPart), '_rels', path.posix.basename(oldPart) + '.rels'), newRelsPart = `word/${prefix}/_rels/${kind}s.xml.rels`
    const oldNoteRels = await partText(source, oldRelsPart, emptyRels), newNoteRels = await partText(source, newRelsPart, emptyRels), preservedRels = []
    for (const node of relationNodes(oldNoteRels)) { const id = 'sealOriginal_' + node.attrs.Id; for (const [noteId, xml] of definitions) if (notes.find(note => note.标识 === noteId)?.未修改 !== false) definitions.set(noteId, xml.replace(/\br:(id|embed|link)="([^"]+)"/g, (all, key, value) => value === node.attrs.Id ? `r:${key}="${id}"` : all)); preservedRels.push(relationXml({ ...node.attrs, Id: id, ...(node.attrs.TargetMode !== 'External' ? { Target: '/' + resolvePart(oldPart, node.attrs.Target) } : {}) })) }
    source.file(newPart, 合并命名空间(newXml.replace(new RegExp(`(<w:${kind}s[^>]*>)[\\s\\S]*(<\\/w:${kind}s>)`), '$1' + [...definitions.values()].join('') + '$2'), oldXml))
    source.file(newRelsPart, newNoteRels.replace('</Relationships>', preservedRels.join('') + '</Relationships>'))
    const type = `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${kind}s`
    if (oldRelation) sourceRels = sourceRels.replace(sourceRels.slice(oldRelation.start, oldRelation.end), relationXml({ ...oldRelation.attrs, Target: `${prefix}/${kind}s.xml` }))
    else newRelationships.push(relationXml({ Id: `seal${kind}s`, Type: type, Target: `${prefix}/${kind}s.xml` }))
  }
  const nextXml = 合并命名空间(originalXml.replace(/(<w:body[^>]*>)[\s\S]*?(<\/w:body>)/, '$1' + output.join('') + finalSection + '$2'), freshXml)
  source.file('word/document.xml', 应用原生修订动作(nextXml, actions))
  source.file(sourceRelsPath, sourceRels.replace('</Relationships>', newRelationships.join('') + '</Relationships>'))
  for (const entry of Object.values(source.files)) if (!entry.dir && /^word\/.*\.xml$/.test(entry.name) && entry.name !== 'word/document.xml') {
    const xml = await entry.async('string'), next = 应用原生修订动作(xml, actions, entry.name)
    if (next !== xml) source.file(entry.name, next)
  }
  await 清理生成部件(source)
  return source.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
async function 清理生成部件(zip) {
  const document = await partText(zip, 'word/document.xml'), relsPath = 'word/_rels/document.xml.rels'
  let rels = await partText(zip, relsPath, emptyRels)
  const ids = new Set([...document.matchAll(/\br:(?:id|embed|link)=["']([^"']+)["']/g)].map(match => match[1]))
  for (const node of relationNodes(rels).filter(node => !node.attrs.TargetMode && /^sealGenerated\d*\//.test(node.attrs.Target || '') && /\/(?:header|footer|image|hyperlink)$/.test(node.attrs.Type || '') && !ids.has(node.attrs.Id)).reverse()) rels = rels.slice(0, node.start) + rels.slice(node.end)
  zip.file(relsPath, rels)
  const visited = new Set(), queue = ['word/document.xml', '']
  while (queue.length) {
    const owner = queue.pop(); if (visited.has(owner)) continue; visited.add(owner)
    const relsName = owner ? path.posix.join(path.posix.dirname(owner), '_rels', path.posix.basename(owner) + '.rels') : '_rels/.rels'
    const xml = await partText(zip, relsName); if (!xml) continue; visited.add(relsName)
    for (const node of relationNodes(xml)) if (!/^External$/i.test(node.attrs.TargetMode || '') && node.attrs.Target) { let target; try { target = decodeURIComponent(node.attrs.Target.split('#')[0]) } catch { throw new Error('生成部件关系编码无效') } queue.push(resolvePart(owner, target)) }
  }
  const removed = new Set()
  for (const file of Object.values(zip.files)) if (!file.dir && /^word\/sealGenerated\d*\//.test(file.name) && !visited.has(file.name)) { removed.add('/' + file.name); zip.remove(file.name) }
  for (const file of Object.values(zip.files).filter(file => file.dir && /^word\/sealGenerated\d*\//.test(file.name)).sort((a, b) => b.name.length - a.name.length)) if (!Object.values(zip.files).some(other => !other.dir && other.name.startsWith(file.name))) zip.remove(file.name)
  if (removed.size) { let types = await partText(zip, '[Content_Types].xml'); for (const node of xmlNodes(types).filter(node => node.name === 'Override' && removed.has(node.attrs.PartName)).reverse()) types = types.slice(0, node.start) + types.slice(node.end); zip.file('[Content_Types].xml', types) }
}
module.exports = { xmlNodes, bodyBlocks, lockedBlock, 读取安全源包, 应用原生修订动作, 创建源包上下文, 标记来源, 合并源包 }
