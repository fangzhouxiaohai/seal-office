import * as Y from 'yjs'

// HTML is a view of the shared tree, never the shared string itself. Inline
// formatting lives on Y.Text characters, so simultaneous bold/italic cannot
// interleave opening/closing tags. Source OOXML packages live outside this tree.
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
const BLOCK = new Set('address article aside blockquote div dl dt dd fieldset figure figcaption footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody thead tfoot tr td th ul'.split(' '))
const STYLE = '__seal_style:'
const REMOVED = '__seal_removed'
interface Unit { value: string | { html: string }; attributes: Record<string, any>; offset: number; length: number }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function parse(html: string): Node[] { const template = document.createElement('template'); template.innerHTML = html; return [...template.content.childNodes] }
function attributes(element: Element): Record<string, string> {
  const result: Record<string, string> = Object.create(null)
  for (const item of [...element.attributes]) if (item.name !== 'style') result[item.name] = item.value
  const style = (element as HTMLElement).style
  if (style) for (let index = 0; index < style.length; index++) { const name = style.item(index); result[STYLE + name] = style.getPropertyValue(name) + (style.getPropertyPriority(name) ? ' !important' : '') }
  return result
}
function inline(nodes: Node[], inherited: Record<string, any> = {}): Unit[] {
  const result: Unit[] = []; let offset = 0
  const append = (value: Unit['value'], marks: Record<string, any>) => { const length = typeof value === 'string' ? value.length : 1; result.push({ value, attributes: marks, offset, length }); offset += length }
  const walk = (node: Node, marks: Record<string, any>) => {
    if (node.nodeType === Node.TEXT_NODE) { for (const point of Array.from(node.textContent || '')) append(point, marks); return }
    if (node.nodeType === Node.COMMENT_NODE) { append({ html: `<!--${node.textContent || ''}-->` }, marks); return }
    if (!(node instanceof Element)) return
    const tag = node.localName.toLowerCase()
    if (VOID.has(tag) || node.getAttribute('contenteditable') === 'false') { append({ html: node.outerHTML }, marks); return }
    const next = { ...marks }, values = attributes(node), normal: Record<string, string> = Object.create(null)
    for (const [key, value] of Object.entries(values)) { if (key.startsWith(STYLE)) next['style:' + key.slice(STYLE.length)] = value; else normal[key] = value }
    if (tag !== 'span' || Object.keys(normal).length) {
      const identity = normal['data-seal-revision-id'] || ''
      next[`tag:${tag}${identity ? ':' + identity : ''}`] = normal
    }
    for (const child of [...node.childNodes]) walk(child, next)
  }
  nodes.forEach(node => walk(node, inherited)); return result
}
function deltaUnits(text: Y.XmlText): Unit[] {
  const result: Unit[] = []; let offset = 0
  for (const part of text.toDelta()) for (const value of typeof part.insert === 'string' ? Array.from(part.insert) : [part.insert]) { const length = typeof value === 'string' ? value.length : 1; result.push({ value, attributes: part.attributes || {}, offset, length }); offset += length }
  return result
}
function insertUnits(text: Y.XmlText, at: number, values: Unit[]) {
  for (let index = 0; index < values.length;) {
    const unit = values[index]
    if (typeof unit.value !== 'string') { text.insertEmbed(at, unit.value, unit.attributes); at++; index++; continue }
    let content = unit.value, next = index + 1
    while (next < values.length && typeof values[next].value === 'string' && same(unit.attributes, values[next].attributes)) content += values[next++].value
    text.insert(at, content, unit.attributes); at += content.length; index = next
  }
}
function encodeNode(node: Node): Y.XmlElement | Y.XmlText {
  if (!(node instanceof Element)) { const text = new Y.XmlText(); insertUnits(text, 0, inline([node])); return text }
  const result = new Y.XmlElement(node.localName.toLowerCase())
  for (const [key, value] of Object.entries(attributes(node))) result.setAttribute(key, value)
  if ([...node.children].some(child => BLOCK.has(child.localName.toLowerCase()))) result.insert(0, [...node.childNodes].map(encodeNode))
  else { const text = new Y.XmlText(); insertUnits(text, 0, inline([...node.childNodes])); result.insert(0, [text]) }
  return result
}
export function createHtmlCrdt(html: string) { const fragment = new Y.XmlFragment(); fragment.insert(0, parse(html).map(encodeNode)); return fragment }
function renderInline(text: Y.XmlText) {
  return text.toDelta().map((part: any) => {
    const marks = part.attributes || {}, styles: string[] = [], wrappers: Array<{ tag: string; values: Record<string, string> }> = []
    for (const key of Object.keys(marks).sort()) {
      if (key.startsWith('style:')) styles.push(`${key.slice(6)}: ${marks[key]};`)
      else if (key.startsWith('tag:')) wrappers.push({ tag: key.split(':')[1], values: marks[key] || {} })
    }
    if (styles.length) wrappers.push({ tag: 'span', values: { style: styles.join(' ') } })
    const value = typeof part.insert === 'string' ? escape(part.insert) : part.insert?.html || ''
    return wrappers.map(item => `<${item.tag}${Object.keys(item.values).sort().map(key => ` ${key}="${escape(String(item.values[key]))}"`).join('')}>`).join('') + value + wrappers.slice().reverse().map(item => `</${item.tag}>`).join('')
  }).join('')
}
export function readHtmlCrdt(node: Y.XmlFragment | Y.XmlElement | Y.XmlText): string {
  if (node instanceof Y.XmlText) return renderInline(node)
  const content = node.toArray().map(child => readHtmlCrdt(child as any)).join('')
  if (!(node instanceof Y.XmlElement)) return content
  const values = node.getAttributes(), styles: string[] = [], normal: Record<string, string> = Object.create(null)
  if (values[REMOVED] && !content) return ''
  for (const key of Object.keys(values).sort()) { if (key === REMOVED) continue; if (key.startsWith(STYLE)) styles.push(`${key.slice(STYLE.length)}: ${values[key]};`); else normal[key] = values[key] }
  if (styles.length) normal.style = styles.join(' ')
  const opening = `<${node.nodeName}${Object.keys(normal).sort().map(key => ` ${key}="${escape(String(normal[key]))}"`).join('')}>`
  return VOID.has(node.nodeName) ? opening : `${opening}${content}</${node.nodeName}>`
}
function patchInline(target: Y.XmlText, before: Unit[], after: Unit[], baseline: Y.XmlText | undefined, doc: Y.Doc) {
  const prior = baseline || target, known = deltaUnits(target), current = new Map(known.map(unit => [unit.offset, unit]))
  let prefix = 0, suffix = 0
  while (prefix < before.length && prefix < after.length && same(before[prefix].value, after[prefix].value)) prefix++
  while (suffix < before.length - prefix && suffix < after.length - prefix && same(before[before.length - suffix - 1].value, after[after.length - suffix - 1].value)) suffix++
  const locate = (unit: Unit) => { const position = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromTypeIndex(prior, unit.offset), doc); return position?.type === target ? position.index : -1 }
  const format = (old: Unit, next: Unit) => {
    if (same(old.attributes, next.attributes)) return
    const index = locate(old); if (index < 0 || !same(current.get(index)?.value, old.value)) return
    const changed: Record<string, any> = Object.create(null)
    for (const key of new Set([...Object.keys(old.attributes), ...Object.keys(next.attributes)])) if (!same(old.attributes[key], next.attributes[key])) changed[key] = next.attributes[key] ?? null
    if (Object.keys(changed).length) target.format(index, old.length, changed)
  }
  for (let index = 0; index < prefix; index++) format(before[index], after[index])
  for (let index = 0; index < suffix; index++) format(before[before.length - index - 1], after[after.length - index - 1])
  const start = prefix < before.length ? before[prefix].offset : before.reduce((sum, unit) => sum + unit.length, 0), position = Y.createRelativePositionFromTypeIndex(prior, start, -1)
  const removed = before.slice(prefix, before.length - suffix).map(unit => ({ ...unit, index: locate(unit) })).filter(unit => unit.index >= 0 && same(current.get(unit.index)?.value, unit.value)).sort((a, b) => b.index - a.index)
  for (const unit of removed) target.delete(unit.index, unit.length)
  const at = Y.createAbsolutePositionFromRelativePosition(position, doc)
  const added = after.slice(prefix, after.length - suffix)
  if (added.length) { if (!at || at.type !== target) throw new Error('此段已被其他成员删除，本机输入已保留'); insertUnits(target, at.index, added) }
}
const lexical = (node: Node) => node instanceof Element ? node.outerHTML : node.nodeType + ':' + node.textContent
const compatible = (old: Node, next: Node) => old.nodeType === next.nodeType && (!(old instanceof Element) || next instanceof Element && old.localName === next.localName)
function patchNode(target: any, before: Node, after: Node, baseline: any, doc: Y.Doc) {
  if (target instanceof Y.XmlText) { patchInline(target, inline([before]), inline([after]), baseline instanceof Y.XmlText ? baseline : undefined, doc); return }
  if (!(target instanceof Y.XmlElement) || !(before instanceof Element) || !(after instanceof Element)) return
  const oldAttrs = attributes(before), nextAttrs = attributes(after)
  for (const key of new Set([...Object.keys(oldAttrs), ...Object.keys(nextAttrs)])) if (oldAttrs[key] !== nextAttrs[key]) { if (key in nextAttrs) target.setAttribute(key, nextAttrs[key]); else target.removeAttribute(key) }
  const children = target.toArray(), originalChildren = baseline?.toArray?.() || []
  if (children.length === 1 && children[0] instanceof Y.XmlText && ![...after.children].some(child => BLOCK.has(child.localName.toLowerCase()))) patchInline(children[0], inline([...before.childNodes]), inline([...after.childNodes]), originalChildren[0] instanceof Y.XmlText ? originalChildren[0] : undefined, doc)
  else patchChildren(target, [...before.childNodes], [...after.childNodes], baseline, doc)
}
function patchChildren(target: any, before: Node[], after: Node[], baseline: any, doc: Y.Doc) {
  const prior = baseline || target
  const allOriginal = prior.toArray(), original = allOriginal.filter((child: any) => readHtmlCrdt(child) !== '')
  const at = (index: number, association = 0) => Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromTypeIndex(prior, original[index] ? allOriginal.indexOf(original[index]) : prior.length, association), doc)
  const removeSeen = (existing: any, old: Node, base: any) => {
    if (existing instanceof Y.XmlText) patchInline(existing, inline([old]), [], base instanceof Y.XmlText ? base : undefined, doc)
    else if (existing instanceof Y.XmlElement && old instanceof Element) {
      const child = existing.get(0)
      if (existing.length === 1 && child instanceof Y.XmlText) patchInline(child, inline([...old.childNodes]), [], base?.get?.(0), doc)
      else patchChildren(existing, [...old.childNodes], [], base, doc)
      // Keep the shared parent as an invisible tombstone. Removing the parent
      // itself would discard a concurrent insertion that we have not seen yet.
      existing.setAttribute(REMOVED, '1')
    }
  }
  let prefix = 0, suffix = 0
  while (prefix < before.length && prefix < after.length && lexical(before[prefix]) === lexical(after[prefix])) prefix++
  while (suffix < before.length - prefix && suffix < after.length - prefix && lexical(before[before.length - suffix - 1]) === lexical(after[after.length - suffix - 1])) suffix++
  const oldEnd = before.length - suffix, nextEnd = after.length - suffix, pairs = Math.min(oldEnd - prefix, nextEnd - prefix)
  for (let index = 0; index < pairs; index++) {
    const oldIndex = prefix + index, resolved = at(oldIndex), existing = resolved && resolved.type === target ? target.get(resolved.index) : undefined
    if (existing && compatible(before[oldIndex], after[oldIndex])) patchNode(existing, before[oldIndex], after[oldIndex], original[oldIndex], doc)
    else if (existing && resolved) { removeSeen(existing, before[oldIndex], original[oldIndex]); target.insert(resolved.index, [encodeNode(after[oldIndex])]) }
  }
  for (let index = oldEnd - 1; index >= prefix + pairs; index--) {
    const resolved = at(index), existing = resolved && resolved.type === target ? target.get(resolved.index) : undefined
    if (!existing || !resolved) continue
    // Cross-paragraph deletion removes only characters the deleting peer saw.
    // Keep an extra paragraph if a remote insertion survived that deletion.
    removeSeen(existing, before[index], original[index])
  }
  if (nextEnd > prefix + pairs) { const resolved = at(prefix + pairs, -1); if (!resolved || resolved.type !== target) throw new Error('段落结构已变化，本机内容已保留'); target.insert(resolved.index, after.slice(prefix + pairs, nextEnd).map(encodeNode)) }
}
export function patchHtmlCrdt(target: Y.XmlFragment, previous: string, next: string, baseline: Y.XmlFragment | undefined, doc: Y.Doc) { patchChildren(target, parse(previous), parse(next), baseline, doc) }
