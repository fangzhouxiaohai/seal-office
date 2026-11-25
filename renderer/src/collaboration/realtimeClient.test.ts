import { expect, it } from 'vitest'
import { applyModelChanges, createModelDocument, readModel, Y } from './crdtModel'

// 依赖旧 Node 云服务进程内夹具的多账号实时协作用例已随旧后端删除；
// 这里保留不需要服务端的 CRDT 合并语义用例。
it('CRDT乱序重放幂等，未提交草稿只删除已见字符，保留期间插入的远端内容', () => {
  const original = createModelDocument({ html: '<p>abcd😀</p>' }), state = Y.encodeStateAsUpdate(original), a = createModelDocument(), b = createModelDocument(), base = createModelDocument()
  for (const doc of [a, b, base]) Y.applyUpdate(doc, state)
  applyModelChanges(b, { html: '<p>abcd😀</p>' }, { html: '<p>ab远端cd😀</p>' }, base)
  const updateB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(original)); Y.applyUpdate(a, updateB)
  applyModelChanges(a, { html: '<p>abcd😀</p>' }, { html: '<p>a本地d😀</p>' }, base)
  const updateA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(original)); Y.applyUpdate(b, updateA); Y.applyUpdate(b, updateA)
  expect(readModel(a)).toEqual(readModel(b)); expect(readModel<any>(a).html).toContain('远端'); expect(readModel<any>(a).html).toContain('本地'); expect(readModel<any>(a).html).not.toContain('�')
  for (const doc of [original, a, b, base]) doc.destroy()
})
