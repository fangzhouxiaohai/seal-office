import { expect, it } from 'vitest'
import { applyModelChanges, createModelDocument, readModel, Y } from '../collaboration/crdtModel'
import { diagramCloudEdit, decodeDiagramFile, encodeDiagramFile, parseDiagramCloud, validateDiagramCloud, type DiagramCloudModel } from './diagramCloud'
import { 解析图文件 } from './diagramData'
const source = (): DiagramCloudModel => ({ schema: 1, type: '脑图', title: '图形😀𠀀', graph: { 节点: [{ id: 'root', 文本: '根节点', x: 10, y: 20, 形状: '矩形', 填充: '#FFFFFF', 线条: '#000000' }, { id: 'child', 文本: '中文子节点', 备注: '保留备注👩🏽‍💻é', x: 200, y: 100 }], 连线: [{ id: 'e', 起点: 'root', 终点: 'child', 标签: '关联' }] } })
it('云图形文件带明确格式与类型，Unicode、备注、坐标和原JSON导入往返完整', () => {
  const model = source(), data = encodeDiagramFile(model)
  expect(decodeDiagramFile(data, '脑图')).toEqual(model)
  const text = new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0)))
  expect(解析图文件(text)).toEqual(model.graph); expect(() => decodeDiagramFile(data, '流程图')).toThrow(/类型/)
  expect(() => decodeDiagramFile(btoa('{}'))).toThrow(/不是/)
})
it('并发配色和形状使用完整原子值收敛，不把枚举或色值拼接成损坏图形', () => {
  const model = source(), a = createModelDocument(model), b = new Y.Doc(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  try {
    const ma = structuredClone(model), mb = structuredClone(model)
    Object.assign(ma.graph.节点[0], { 形状: '菱形', 填充: '#EAF2FF', 线条: '#2B6CF6' }); Object.assign(mb.graph.节点[0], { 形状: '椭圆', 填充: '#FFF1DF', 线条: '#BB7227' })
    applyModelChanges(a, model, ma); applyModelChanges(b, model, mb); const left = Y.encodeStateAsUpdate(a), right = Y.encodeStateAsUpdate(b); Y.applyUpdate(a, right); Y.applyUpdate(b, left)
    const merged = readModel<DiagramCloudModel>(a); expect(readModel(b)).toEqual(merged); expect(validateDiagramCloud(merged)).toBeNull()
    expect(['菱形', '椭圆']).toContain(merged.graph.节点[0].形状); expect(['#EAF2FF', '#FFF1DF']).toContain(merged.graph.节点[0].填充); expect(['#2B6CF6', '#BB7227']).toContain(merged.graph.节点[0].线条)
    expect(merged.graph.节点[1]).toEqual(model.graph.节点[1])
  } finally { a.destroy(); b.destroy() }
})
it('只投影掉并发删除后的悬空连线，仍拒绝重复标识、非法颜色及超限内容', () => {
  const model = source(); model.graph.连线.push({ id: 'dangling', 起点: 'root', 终点: 'removed', 标签: '保留在CRDT中' })
  expect(parseDiagramCloud(model).graph.连线).toHaveLength(1); expect(model.graph.连线).toHaveLength(2)
  expect(validateDiagramCloud({ ...model, graph: { ...model.graph, 连线: [...model.graph.连线, model.graph.连线[0]] } })).toMatch(/标识/)
  expect(validateDiagramCloud({ ...model, graph: { ...model.graph, 连线: [{ id: 'bad', 起点: 'root', 终点: 'removed', 颜色: 'javascript:alert(1)' }] } })).toMatch(/连线/)
  expect(validateDiagramCloud({ ...model, title: '\u0000坏名称' })).toMatch(/名称/)
})


it('无关节点编辑保留并发删除产生的隐藏连线，明确删除可见端点才移除它', () => {
  const base: DiagramCloudModel = { schema: 1, type: '流程图', title: '并发连线', graph: { 节点: [{ id: 'root', 文本: '开始', x: 10, y: 10 }, { id: 'keep', 文本: '保留', x: 300, y: 10 }], 连线: [{ id: 'hidden', 起点: 'root', 终点: 'concurrently-removed', 标签: '其他成员新增连线' }] } }
  const shown = parseDiagramCloud(base).graph; expect(shown.连线).toEqual([])
  const edited = diagramCloudEdit(base, { ...shown, 节点: shown.节点.map(node => node.id === 'keep' ? { ...node, 备注: '只修改这个节点' } : node) })
  expect(edited.graph.连线).toEqual(base.graph.连线); expect(base.graph.节点[1].备注).toBeUndefined()
  const deleted = diagramCloudEdit(base, { ...shown, 节点: shown.节点.filter(node => node.id !== 'root') }); expect(deleted.graph.连线).toEqual([])
})
