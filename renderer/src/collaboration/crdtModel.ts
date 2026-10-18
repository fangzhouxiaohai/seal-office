import * as Y from 'yjs'
import { createHtmlCrdt, patchHtmlCrdt, readHtmlCrdt } from './htmlCrdt'

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const object = (value: any): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value)
const keyed = (items: any[]) => items.length > 0 && items.every(item => object(item) && typeof item.id === 'string') && new Set(items.map(item => item.id)).size === items.length
const ID_LIST = '__seal_crdt_id_list__'
const SOURCE = '__seal_crdt_source_register__'
// Enums, colors and connector endpoints are atomic registers. Concurrent
// character edits could otherwise produce an invalid color or shape name.
const ATOMIC_STRINGS = new Set(['形状', '填充', '线条', '文字颜色', '颜色', '起点', '终点', 'type'])
const sourceConflict = () => Object.assign(new Error('两个成员同时替换了原生来源包；本机来源版本已保留，请另存副本后重新连接'), { code: 'CONTENT_CONFLICT' })
function encode(value: any, field?: string): any {
  if (field === 'html' && typeof value === 'string') return createHtmlCrdt(value)
  if (field === 'source' && typeof value === 'string') { const result = new Y.Map(), versions = new Y.Map<string>(); versions.set(crypto.randomUUID(), value); result.set(SOURCE, true); result.set('versions', versions); return result }
  if (typeof value === 'string' && field && ATOMIC_STRINGS.has(field)) return value
  if (typeof value === 'string') { const text = new Y.Text(); text.insert(0, value); return text }
  if (Array.isArray(value)) {
    if (!value.length || keyed(value)) {
      const result = new Y.Map(), order = new Y.Array<string>(), items = new Y.Map()
      order.insert(0, value.map(item => item.id)); value.forEach(item => items.set(item.id, encode(item)))
      result.set(ID_LIST, true); result.set('order', order); result.set('items', items); return result
    }
    const result = new Y.Array(); result.insert(0, value.map(item => encode(item))); return result
  }
  if (object(value)) { const result = new Y.Map(); Object.keys(value).forEach(key => { if (value[key] !== undefined) result.set(key, encode(value[key], key)) }); return result }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('实时文档包含非有限数值')
  return value ?? null
}
export function decodeModel(value: any): any {
  if (value instanceof Y.XmlFragment || value instanceof Y.XmlText) return readHtmlCrdt(value)
  if (value instanceof Y.Text) return value.toString()
  if (value instanceof Y.Array) return value.toArray().map(decodeModel)
  if (value instanceof Y.Map) {
    if (value.get(SOURCE) === true) { const versions = value.get('versions') as Y.Map<string>, values = [...new Set(versions.values())]; if (values.length !== 1) throw sourceConflict(); return values[0] }
    if (value.get(ID_LIST) === true) {
      const order = value.get('order') as Y.Array<string>, items = value.get('items') as Y.Map<any>, seen = new Set<string>()
      return order.toArray().filter(id => !seen.has(id) && (seen.add(id), items.has(id))).map(id => decodeModel(items.get(id)))
    }
    const result: Record<string, any> = Object.create(null)
    value.forEach((item, key) => { result[key] = decodeModel(item) }); return result
  }
  return value
}
export function createModelDocument(model?: unknown) {
  const doc = new Y.Doc()
  if (model !== undefined) doc.getMap('document').set('model', encode(model))
  return doc
}
export const readModel = <T = unknown>(doc: Y.Doc): T => decodeModel(doc.getMap('document').get('model'))
function changeText(target: Y.Text, previous: string, next: string, baseline: Y.Text | undefined, doc: Y.Doc) {
  if (previous === next) return
  // Yjs positions count UTF-16 units. Compare code points first so no edit cuts a surrogate pair.
  const before = Array.from(previous), after = Array.from(next)
  let prefix = 0, suffix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++
  const start = before.slice(0, prefix).join('').length, removed = before.slice(prefix, before.length - suffix), insert = after.slice(prefix, after.length - suffix).join('')
  if (!baseline || baseline.toString() !== previous) {
    if (target.toString() !== previous) throw new Error('本地编辑基线已变化，请保留草稿后重试')
    target.delete(start, removed.join('').length); if (insert) target.insert(start, insert); return
  }
  const position = Y.createRelativePositionFromTypeIndex(baseline, start, -1)
  // Delete only the characters visible in the editing baseline. A remote insert
  // inside that range remains present, including while the local IME is active.
  const ranges: Array<{ index: number; length: number }> = []; let offset = start
  for (const point of removed) {
    const relative = Y.createRelativePositionFromTypeIndex(baseline, offset)
    const current = Y.createAbsolutePositionFromRelativePosition(relative, doc)
    if (current?.type === target && target.toString().slice(current.index, current.index + point.length) === point) ranges.push({ index: current.index, length: point.length })
    offset += point.length
  }
  ranges.sort((a, b) => b.index - a.index).forEach(range => target.delete(range.index, range.length))
  const resolved = Y.createAbsolutePositionFromRelativePosition(position, doc)
  if (!resolved || resolved.type !== target) throw new Error('此文字段已被其他成员删除，本机草稿已保留')
  if (insert) target.insert(resolved.index, insert)
}
function patch(target: any, previous: any, next: any, baseline: any, replace: (value: any) => void, doc: Y.Doc, field?: string) {
  if (equal(previous, next)) return
  if (equal(decodeModel(target), next)) return
  if (target instanceof Y.Map && target.get(SOURCE) === true && typeof previous === 'string' && typeof next === 'string') {
    const versions = target.get('versions') as Y.Map<string>, before = baseline instanceof Y.Map && baseline.get(SOURCE) === true ? baseline.get('versions') as Y.Map<string> : versions
    if (decodeModel(baseline || target) !== previous) throw sourceConflict()
    for (const id of before.keys()) versions.delete(id)
    versions.set(crypto.randomUUID(), next); return
  }
  if (target instanceof Y.XmlFragment && typeof previous === 'string' && typeof next === 'string') { patchHtmlCrdt(target, previous, next, baseline instanceof Y.XmlFragment ? baseline : undefined, doc); return }
  if (target instanceof Y.Text && typeof previous === 'string' && typeof next === 'string') { if (field && ATOMIC_STRINGS.has(field)) replace(next); else changeText(target, previous, next, baseline instanceof Y.Text ? baseline : undefined, doc); return }
  if (target instanceof Y.Map && target.get(ID_LIST) === true && Array.isArray(previous) && Array.isArray(next) && (keyed(next) || !next.length) && (keyed(previous) || !previous.length)) {
    const order = target.get('order') as Y.Array<string>, items = target.get('items') as Y.Map<any>, baseItems = baseline instanceof Y.Map ? baseline.get('items') as Y.Map<any> : undefined
    const old = new Map(previous.map(item => [item.id, item])), wanted = new Set(next.map(item => item.id))
    for (const item of previous) if (!wanted.has(item.id)) { const indices = order.toArray().map((id, index) => id === item.id ? index : -1).filter(index => index >= 0); indices.reverse().forEach(index => order.delete(index, 1)); items.delete(item.id) }
    next.forEach((item, index) => {
      if (!old.has(item.id)) {
        if (!items.has(item.id)) items.set(item.id, encode(item))
        const current = order.toArray(), preceding = next.slice(0, index).reverse().find(prior => current.includes(prior.id)), at = preceding ? current.lastIndexOf(preceding.id) + 1 : 0
        if (!current.includes(item.id)) order.insert(at, [item.id])
      } else if (items.has(item.id)) patch(items.get(item.id), old.get(item.id), item, baseItems?.get(item.id), value => items.set(item.id, value), doc)
      // A concurrent deletion wins over a stale edit; never resurrect a removed object.
    })
    const oldOrder = previous.filter(item => wanted.has(item.id)).map(item => item.id), newOrder = next.filter(item => old.has(item.id)).map(item => item.id)
    if (!equal(oldOrder, newOrder)) newOrder.forEach((id, index) => { const current = order.toArray(), oldIndex = current.indexOf(id); if (oldIndex >= 0 && oldIndex !== index) { order.delete(oldIndex, 1); order.insert(Math.min(index, order.length), [id]) } })
    return
  }
  if (target instanceof Y.Map && object(previous) && object(next) && !Array.isArray(previous)) {
    for (const key of Object.keys(previous)) if (!(key in next) || next[key] === undefined) target.delete(key)
    for (const key of Object.keys(next)) {
      if (next[key] === undefined || equal(previous[key], next[key])) continue
      if (target.has(key) && key in previous) patch(target.get(key), previous[key], next[key], baseline instanceof Y.Map ? baseline.get(key) : undefined, value => target.set(key, value), doc, key)
      else if (!(key in previous)) target.set(key, encode(next[key], key))
    }
    return
  }
  if (target instanceof Y.Array && Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length === next.length) {
      next.forEach((value, index) => { if (index < target.length) patch(target.get(index), previous[index], value, baseline instanceof Y.Array ? baseline.get(index) : undefined, replacement => { target.delete(index, 1); target.insert(index, [replacement]) }, doc) })
    } else {
      let prefix = 0, suffix = 0
      while (prefix < previous.length && prefix < next.length && equal(previous[prefix], next[prefix])) prefix++
      while (suffix < previous.length - prefix && suffix < next.length - prefix && equal(previous[previous.length - suffix - 1], next[next.length - suffix - 1])) suffix++
      target.delete(prefix, Math.min(previous.length - prefix - suffix, target.length - prefix)); target.insert(prefix, next.slice(prefix, next.length - suffix).map(item => encode(item)))
    }
    return
  }
  replace(encode(next, field))
}
export function applyModelChanges(doc: Y.Doc, previous: unknown, next: unknown, baseline?: Y.Doc, origin?: unknown) {
  // Preflight on an isolated replica: Yjs transactions do not roll back if a
  // callback throws, so a stale draft must never partially change the live doc.
  const preview = new Y.Doc(); Y.applyUpdate(preview, Y.encodeStateAsUpdate(doc))
  try { const check = preview.getMap('document'); preview.transact(() => patch(check.get('model'), previous, next, baseline?.getMap('document').get('model'), value => check.set('model', value), preview)); readModel(preview) } finally { preview.destroy() }
  const root = doc.getMap('document'), old = baseline?.getMap('document').get('model')
  doc.transact(() => patch(root.get('model'), previous, next, old, value => root.set('model', value), doc), origin)
}
export { Y }
